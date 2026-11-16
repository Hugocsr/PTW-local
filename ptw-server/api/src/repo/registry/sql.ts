/**
 * Ferramentas de consulta do cadastro: montam o texto SQL com parâmetros numerados (`$n::tipo`, cada
 * valor entra uma vez, na ordem) e executam por `tx.unsafe`. Tudo que filtra, busca, ordena e pagina
 * é SQL: a API nunca guarda a lista na memória.
 */
import type { FastifyRequest } from "fastify"
import { isUuid, type Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"

export type Param = string | number | boolean | null

/** Montador de uma consulta: `p(valor, "uuid")` devolve `$n::uuid` e guarda o valor. */
export class Q {
  readonly params: Param[] = []
  p(value: Param | undefined, cast: string): string {
    this.params.push(value ?? null)
    return `$${this.params.length}::${cast}`
  }
  /** Lista de uuids (já validados) como um único parâmetro de texto. */
  uuids(list: readonly string[]): string {
    return this.p(`{${list.join(",")}}`, "uuid[]")
  }
  json(value: unknown): string {
    return this.p(JSON.stringify(value), "jsonb")
  }
}

export async function run<T = Record<string, unknown>>(tx: Tx, text: string, params: Param[] = []): Promise<T[]> {
  return (await tx.unsafe(text, params as never)) as unknown as T[]
}

export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v))
export const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v))

/** O `id` do caminho; o que não é uuid não existe (404), não é erro de formato. */
export function pathId(req: FastifyRequest): string {
  const id = (req.params as { id?: unknown }).id
  if (!isUuid(id)) throw pta.notFound()
  return id
}

export const uuidList = (list: readonly string[] | undefined): string[] => [...new Set(list ?? [])]

/** Escapa `%`, `_` e `\` do termo da busca (o `like` do SQL). */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => "\\" + c)

/** `col like '%termo%'` sobre a coluna `search` (já sem acento e sem caixa; índice trigram). */
export function searchLike(q: Q, column: string, term: string | undefined): string | null {
  const t = term?.trim()
  if (t === undefined || t === "") return null
  return `${column} like '%' || ptw.search_text(${q.p(likeEscape(t), "text")}) || '%'`
}

export interface Paging {
  page: number
  pageSize: number
}
export const pagingOf = (query: { page?: number; pageSize?: number }): Paging => ({ page: query.page ?? 0, pageSize: query.pageSize ?? 50 })

/** `sort=-name` → `{ key: "name", desc: true }`, só com as chaves permitidas. */
export function orderBy(sort: string | undefined, fallback: string, columns: Record<string, string>, tiebreak: string): string {
  const raw = sort ?? fallback
  const desc = raw.startsWith("-")
  const col = columns[desc ? raw.slice(1) : raw] ?? columns[fallback]!
  return `${col} ${desc ? "desc" : "asc"}, ${tiebreak}`
}

export interface PageOut<T> {
  page: number
  pageSize: number
  total: number
  items: T[]
}

/**
 * Uma página: `select <colunas>, count(*) over() … limit … offset …`. Página além do fim não traz linha
 * para ler o total: refaz só a contagem.
 */
export async function selectPage<R extends object, T>(
  tx: Tx,
  q: Q,
  spec: { columns: string; from: string; where: string[]; order: string; paging: Paging },
  map: (row: R) => T,
): Promise<PageOut<T>> {
  const where = spec.where.length > 0 ? ` where ${spec.where.join(" and ")}` : ""
  const { page, pageSize } = spec.paging
  const limit = Math.max(1, Math.trunc(pageSize))
  const offset = Math.max(0, Math.trunc(page)) * limit
  const rows = await run<R & { _total: number | string }>(
    tx,
    `select ${spec.columns}, count(*) over() as _total from ${spec.from}${where} order by ${spec.order} limit ${limit} offset ${offset}`,
    q.params,
  )
  let total = rows.length > 0 ? Number(rows[0]!._total) : 0
  if (rows.length === 0 && offset > 0) {
    const c = await run<{ n: number | string }>(tx, `select count(*) as n from ${spec.from}${where}`, q.params)
    total = Number(c[0]?.n ?? 0)
  }
  return { page, pageSize, total, items: rows.map(map) }
}

/** Erro do banco que a API levanta sozinha quando o esquema ainda não recusa (mesmo formato do banco). */
export function dbLike(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

export const statusFilter = (q: Q, column: string, status: readonly string[] | undefined): string | null =>
  status && status.length > 0 ? `${column} = any (${q.p(`{${status.join(",")}}`, "ptw.record_status[]")})` : null

export const sinceFilter = (q: Q, column: string, since: string | undefined): string | null =>
  since === undefined ? null : `${column} > ${q.p(since, "timestamptz")}`

/** Como `searchLike`, para tabela sem coluna `search`: normaliza a coluna na hora (só tabelas pequenas). */
export function searchLikeLabel(q: Q, column: string, term: string | undefined): string | null {
  const t = term?.trim()
  if (t === undefined || t === "") return null
  return `ptw.search_text(${column}) like '%' || ptw.search_text(${q.p(likeEscape(t), "text")}) || '%'`
}

/** Revisão atual de um cadastro com `revision` (para o `409 PTA06` depois de um `UPDATE … WHERE revision`). */
export async function currentRevision(tx: Tx, table: "location" | "asset" | "person" | "option_list", id: string): Promise<number | null> {
  const q = new Q()
  const r = await run<{ revision: number }>(tx, `select revision from ptw.${table} where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")}`, q.params)
  return r[0] ? Number(r[0].revision) : null
}

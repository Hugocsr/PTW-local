/**
 * Ferramentas de consulta da PT: o texto SQL com parâmetros numerados (`$n::tipo`) executado por
 * `tx.unsafe`. Tudo que filtra, ordena e pagina é SQL; a API não guarda PTs na memória.
 */
import type { FastifyRequest } from "fastify"
import { isUuid, type Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"

export type Param = string | number | boolean | null

/** Montador de uma consulta: `q.p(valor, "uuid")` devolve `$n::uuid` e guarda o valor. */
export class Q {
  readonly params: Param[] = []
  p(value: Param | undefined, cast: string): string {
    this.params.push(value ?? null)
    return `$${this.params.length}::${cast}`
  }
  /** Lista de uuids (já validados pelo contrato) num parâmetro só. */
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

/** O `id` do caminho como uuid; o que não é uuid não existe (404). */
export function permitIdOf(req: FastifyRequest): string {
  const id = (req.params as { id?: unknown }).id
  if (!isUuid(id)) throw pta.notFound()
  return id
}

/** Escapa `%`, `_` e `\` do termo da busca (o `like` do SQL). */
export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => "\\" + c)

/** A pessoa da sessão (toda operação de PT é autenticada). */
export function personOf(req: FastifyRequest): string {
  const p = req.ptw.session?.personId
  if (!p) throw pta.unauthorized()
  return p
}

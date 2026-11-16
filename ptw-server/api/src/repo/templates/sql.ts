/** Ferramentas de consulta dos modelos: parâmetros numerados (`$n::tipo`) e `tx.unsafe`. */
import type { FastifyRequest } from "fastify"
import { isUuid, type Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"

export type Param = string | number | boolean | null

export class Q {
  readonly params: Param[] = []
  p(value: Param | undefined, cast: string): string {
    this.params.push(value ?? null)
    return `$${this.params.length}::${cast}`
  }
  /** Lista de uuids (já validados) como um único parâmetro. */
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

/** Erro de regra com o código do banco, para o que o esquema ainda não recusa sozinho. */
export function dbLike(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

/** `{id}` do caminho; o que não é uuid não existe (404). */
export function pathId(req: FastifyRequest, name = "id"): string {
  const id = (req.params as Record<string, unknown>)[name]
  if (!isUuid(id)) throw pta.notFound()
  return id
}

export const likeEscape = (s: string): string => s.replace(/[\\%_]/g, (c) => "\\" + c)

/**
 * Concorrência otimista (A7): `If-Match: "<n>"` → `UPDATE … WHERE revision = n` (ou `row_version`).
 * Nenhuma linha → `409 PTA06` com a revisão atual; sem o cabeçalho → `428 PTA07`. Parar não usa.
 */
import type { FastifyReply, FastifyRequest } from "fastify"
import { pta } from "../errors/apiError.js"

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/** A revisão que o cliente leu; nulo se o cabeçalho não veio. Formato errado → `400 PTA05`. */
export function ifMatchOf(req: FastifyRequest): number | null {
  const v = one(req.headers["if-match"])
  if (v === undefined || v === "") return null
  const m = /^"([0-9]{1,15})"$/.exec(v)
  if (!m) throw pta.badRequest("Requisição fora do contrato", 'headers/if-match: a revisão entre aspas, ex. "7"')
  return Number(m[1])
}

/** A revisão do `If-Match`; ausente → `428 PTA07`. */
export function requireIfMatch(req: FastifyRequest): number {
  const n = ifMatchOf(req)
  if (n === null) throw pta.ifMatchRequired()
  return n
}

/** `ETag: "<n>"` com a revisão que ficou. */
export function setEtag(reply: FastifyReply, revision: number | string): void {
  reply.header("etag", `"${String(revision)}"`)
}

/**
 * Depois de um `UPDATE … WHERE revision = n` que não alterou linha: a linha não existe (`404 PTA04`)
 * ou mudou (`409 PTA06`, com a revisão atual em `detail`).
 */
export function staleOrMissing(currentRevision: number | string | null | undefined): never {
  if (currentRevision === null || currentRevision === undefined) throw pta.notFound()
  throw pta.staleRevision(currentRevision)
}

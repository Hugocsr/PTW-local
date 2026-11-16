/**
 * Idempotência (A8): `Idempotency-Key` (uuid) nas operações que a declaram. A mesma chave com o mesmo
 * pedido devolve a resposta original (`Idempotency-Replayed: true`) sem repetir a escrita; com outro
 * pedido, `422 PTA08`.
 *
 * A chave mora no banco (`ptw.api_idempotency`, lacuna L7) e é reservada NA MESMA transação da
 * escrita (`ptw.idempotency_begin`); a resposta entra antes do commit (`ptw.idempotency_finish`).
 * Escrita recusada → o rollback solta a chave e a nova tentativa executa. Duas chamadas iguais ao
 * mesmo tempo → a segunda espera a primeira no banco e repete a resposta. A API pode reiniciar.
 *
 * Por isso a rota de uma operação com `Idempotency-Key` faz a escrita E monta a resposta dentro de
 * `idempotent(req, reply, fn)`, no lugar de `withCtx`.
 */
import { createHash } from "node:crypto"
import type { FastifyReply, FastifyRequest } from "fastify"
import { withCtx, type CtxOverrides, type Tx } from "../db.js"
import { pta } from "../errors/apiError.js"

export interface IdempotentOptions<T> extends CtxOverrides {
  /** Status da resposta (padrão 200; criação: 201). */
  status?: number
  /** Revisão que vai no `ETag` (guardada com a resposta, para a repetição). */
  etag?: (body: T) => number | string | null | undefined
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

/** SHA-256 (hexa) do pedido: método, endereço e corpo. */
export function requestHash(method: string, url: string, body: unknown): string {
  const h = createHash("sha256")
  h.update(method).update("\n").update(url).update("\n")
  h.update(body === undefined || body === null ? "" : typeof body === "string" ? body : JSON.stringify(body))
  return h.digest("hex")
}

type Outcome<T> =
  | { kind: "new"; body: T; etag: string | null }
  | { kind: "replay"; status: number; body: T; etag: string | null }
  | { kind: "mismatch" }

/**
 * A transação de uma escrita que aceita `Idempotency-Key`. `fn` faz a escrita e devolve o corpo da
 * resposta. Sem a chave no pedido, é só `withCtx`. Define o status e o `ETag` da resposta.
 */
export async function idempotent<T>(req: FastifyRequest, reply: FastifyReply, fn: (tx: Tx) => Promise<T>, opts: IdempotentOptions<T> = {}): Promise<T> {
  const op = req.ptw.op
  const key = one(req.headers["idempotency-key"])
  const status = opts.status ?? 200
  const etagOf = (body: T): string | null => {
    const v = opts.etag?.(body)
    return v === null || v === undefined ? null : `"${String(v)}"`
  }

  if (!op?.idempotent || key === undefined || !req.ptw.session) {
    const body = await withCtx(req, fn, opts)
    const etag = etagOf(body)
    if (etag !== null) reply.header("etag", etag)
    reply.code(status)
    return body
  }

  const hash = requestHash(req.method, req.url, req.body)
  const out = await withCtx<Outcome<T>>(
    req,
    async (tx) => {
      const rows = await tx<{ situacao: string; status: number | null; response: { body: T; etag: string | null } | null }[]>`
        select situacao, status, response from ptw.idempotency_begin(${key}::uuid, ${op.operationId}::text, ${hash}::text)`
      const r = rows[0]
      if (!r) throw pta.unexpected(undefined, "idempotency_begin sem resposta")
      if (r.situacao === "diferente") return { kind: "mismatch" }
      if (r.situacao === "repetida") return { kind: "replay", status: r.status ?? status, body: r.response?.body as T, etag: r.response?.etag ?? null }
      const body = await fn(tx)
      const etag = etagOf(body)
      await tx`select ptw.idempotency_finish(${key}::uuid, ${status}::integer, ${JSON.stringify({ body: body ?? null, etag })}::jsonb)`
      return { kind: "new", body, etag }
    },
    opts,
  )
  if (out.kind === "mismatch") throw pta.idempotencyMismatch()
  if (out.etag !== null) reply.header("etag", out.etag)
  if (out.kind === "replay") {
    reply.header("idempotency-replayed", "true")
    reply.code(out.status)
  } else reply.code(status)
  return out.body
}

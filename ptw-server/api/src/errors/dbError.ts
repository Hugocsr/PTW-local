/**
 * Erro do banco → resposta, pelo `x-ptw-error-map` do contrato (A5). A API não escreve mensagem de
 * regra: a frase é a do banco; `detail` e `hint` do banco vão em `detail`.
 */
import { ApiError, pta } from "./apiError.js"

export interface DbErrorLike {
  code?: string
  message?: string
  detail?: string
  hint?: string
  errno?: string | number
}

/** Erros do driver (não do Postgres) que significam "o banco não respondeu". */
const DRIVER_DOWN = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EPIPE",
  "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECTION_DESTROYED", "CONNECT_TIMEOUT", "CONNECTION_CONNECT_TIMEOUT",
])

const isSqlState = (c: string): boolean => /^[A-Z0-9]{5}$/.test(c)

/** Erros que valem repetir a transação inteira (até 2 vezes): corrida de serialização, impasse, hora fora de ordem. */
export function isRetryable(e: unknown): boolean {
  const c = (e as DbErrorLike | null)?.code
  return c === "40001" || c === "40P01" || c === "PTW12"
}

/** Status HTTP de um código do banco (SQLSTATE ou PTWnn); nulo = não previsto (500 PTA99). */
export function statusOfDbCode(code: string): number | null {
  if (/^PTW\d\d$/.test(code)) {
    if (code === "PTW10") return 409
    if (code === "PTW12" || code === "PTW13" || code === "PTW14") return 500
    return 422
  }
  if (code === "23514") return 422
  if (code === "23505" || code === "23503") return 409
  if (code === "42501") return 403
  if (code === "23502" || code.startsWith("22")) return 400
  if (code === "57014") return 504
  if (code === "55P03" || code === "40001" || code === "40P01") return 503
  if (code.startsWith("08") || code.startsWith("53") || code.startsWith("57P0")) return 503
  return null
}

const detailOf = (e: DbErrorLike): string | undefined => {
  const parts = [e.detail, e.hint].filter((x): x is string => typeof x === "string" && x !== "")
  return parts.length ? parts.join(" · ") : undefined
}

/** Converte qualquer erro em `ApiError`. Um `ApiError` passa como está. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  const d = (e ?? {}) as DbErrorLike
  const code = typeof d.code === "string" ? d.code : ""
  if (code === "XX000" && /EMAXCONNSESSION|Max client connections reached/i.test(d.message ?? "")) return pta.unavailable(e)
  if (DRIVER_DOWN.has(code) || (typeof d.errno === "string" && DRIVER_DOWN.has(d.errno))) return pta.unavailable(e)
  if (!isSqlState(code)) return pta.unexpected(e)
  const status = statusOfDbCode(code)
  if (status === null) return pta.unexpected(e)
  const message = d.message && d.message !== "" ? d.message : "Recusado pelo banco"
  if (status === 503) {
    // Conexão, recursos ou desligamento: é "servidor fora do ar". Trava e corrida, depois de repetir: tente de novo.
    if (code === "55P03" || code === "40001" || code === "40P01") {
      return new ApiError(503, code, "O registro está em uso por outra operação: tente de novo", { headers: { "retry-after": "1" }, cause: e })
    }
    return pta.unavailable(e)
  }
  if (status === 504) return new ApiError(504, code, "A consulta passou do tempo limite", { cause: e })
  return new ApiError(status, code, message, { detail: detailOf(d), cause: e })
}

/**
 * A recusa fica na trilha (`ptw.audit_denied`)? Contrato: toda recusa por regra — 4xx com `PTWnn`,
 * `23xxx`, `42501`, `PTA02` (401) e `PTA03` (403).
 */
export function isAuditedDenial(e: ApiError): boolean {
  if (e.audited || e.status < 400 || e.status >= 500) return false
  return /^PTW\d\d$/.test(e.code) || /^23\d{3}$/.test(e.code) || e.code === "42501" || e.code === "PTA02" || e.code === "PTA03"
}

/**
 * Guarda das escritas (A9): além do cookie `SameSite=Strict`, toda escrita autenticada exige o
 * cabeçalho `X-Ptw-Csrf` (o `csrfToken` de `GET /session`) e `Origin` igual ao host do app.
 */
import type { FastifyRequest } from "fastify"
import { pta } from "../errors/apiError.js"
import { sameText } from "../session/cookie.js"

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

const SAFE = new Set(["GET", "HEAD", "OPTIONS"])
export const isWrite = (method: string): boolean => !SAFE.has(method.toUpperCase())

/** O host pelo qual o navegador chegou (o Caddy repassa `Host`; `X-Forwarded-Host` se houver). */
function appHost(req: FastifyRequest): string | null {
  const h = one(req.headers["x-forwarded-host"]) ?? one(req.headers.host)
  return h === undefined ? null : h.split(",")[0]!.trim().toLowerCase()
}

/** `Origin`, se veio, tem de ser o host do app. `required`: a falta dele também recusa. */
export function checkOrigin(req: FastifyRequest, required: boolean): void {
  const origin = one(req.headers.origin)
  if (origin === undefined || origin === "") {
    if (required) throw pta.forbidden("Escrita sem o cabeçalho Origin: recusada")
    return
  }
  let host: string | null
  try {
    host = new URL(origin).host.toLowerCase()
  } catch {
    host = null
  }
  if (host === null || host !== appHost(req)) throw pta.forbidden("Escrita vinda de outro endereço: recusada")
}

/** Escrita autenticada: `X-Ptw-Csrf` da sessão e `Origin` do app. */
export function checkCsrf(req: FastifyRequest): void {
  const session = req.ptw.session
  if (!session) throw pta.unauthorized()
  const sent = one(req.headers["x-ptw-csrf"])
  if (sent === undefined || !sameText(sent, session.csrfToken)) throw pta.forbidden("Escrita sem a confirmação da sessão (X-Ptw-Csrf): recusada")
  checkOrigin(req, true)
}

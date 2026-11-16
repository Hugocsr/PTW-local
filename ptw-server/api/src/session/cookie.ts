/**
 * Cookie de sessão (A9): `ptw_session`, opaco, 256 bits aleatórios,
 * `HttpOnly; Secure; SameSite=Strict; Path=/api`. O servidor guarda só o SHA-256 do valor.
 * O token de CSRF é derivado do valor do cookie (que o JavaScript da página não lê): a API confere
 * sem guardar nada a mais.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "ptw_session"
const ATTRS = "Path=/api; HttpOnly; Secure; SameSite=Strict"

export const newToken = (): string => randomBytes(32).toString("base64url")

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

export const csrfOf = (token: string): string => createHash("sha256").update("ptw-csrf\n").update(token).digest("base64url")

export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** O valor do cookie `ptw_session`, se veio e tem o formato esperado. */
export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    if (part.slice(0, i).trim() !== SESSION_COOKIE) continue
    const v = part.slice(i + 1).trim()
    return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null
  }
  return null
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; ${ATTRS}; Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; ${ATTRS}; Max-Age=0`
}

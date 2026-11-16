/**
 * Ids as the database makes them: every table key is a lowercase uuid v7 (`uuidv7()` in
 * PostgreSQL 18). Ids inside a form (section, item, line, own option) stay text, but must match
 * FORM_ID_RE (ptw-server/db/schema/40_formulario.sql).
 */

const hex = (n: number, width: number) => n.toString(16).padStart(width, "0")

/** RFC 9562 uuid v7: 48-bit Unix ms, version 7, variant 10, the rest random. Lowercase. */
export function uuidv7(ms: number = Date.now()): string {
  const r = new Uint8Array(10)
  globalThis.crypto.getRandomValues(r)
  const t = hex(Math.max(0, Math.floor(ms)) % 2 ** 48, 12)
  const b = Array.from(r, (x) => hex(x, 2)).join("")
  const randA = (0x7000 | ((r[0] << 4 | r[1] >> 4) & 0x0fff)).toString(16)
  const variant = (0x8000 | ((r[2] << 8 | r[3]) & 0x3fff)).toString(16)
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-${randA}-${variant}-${b.slice(8, 20)}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Any lowercase uuid (the database prints them lowercase; seed ids are not random v7). */
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID_RE.test(s)

/** Id of a form section, item, line or own option. */
export const FORM_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/

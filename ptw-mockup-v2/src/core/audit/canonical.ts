/** Canonical form v2 and the hash of an event. */
import { sha256Hex, utf8 } from "./sha256.ts"
import type { AuditEvent, Json, JsonObject } from "./types.ts"

/** Plain decimal text of a number, never an exponent ("1e-7" → "0.0000001", -0 → "0"). */
function numberText(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Número inválido na auditoria: ${n}`)
  if (Object.is(n, -0) || n === 0) return "0"
  const s = String(n)
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s)
  if (!m) return s
  const [, sign, int, frac = "", expText] = m
  const digits = int + frac
  const exp = Number(expText)
  const point = 1 + exp // position of the decimal point within `digits`
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`.replace(/0+$/, "")
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

/** A lone surrogate cannot be UTF-8: it becomes U+FFFD, as TextEncoder would write it. */
const wellFormed = (s: string) => s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�")
/** JSON.stringify escapes exactly \" \\ \b \f \n \r \t and \u00xx (lowercase) below 0x20, like the database. */
const textOf = (s: string) => JSON.stringify(wellFormed(s))

function byteCompare(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return a.length - b.length
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** UTF-8 of an object key, kept: the same few dozen keys repeat in every event. */
const keyCache = new Map<string, Uint8Array>()
function keyBytes(k: string): Uint8Array {
  let b = keyCache.get(k)
  if (!b) { b = utf8(wellFormed(k)); if (keyCache.size < 10_000) keyCache.set(k, b) }
  return b
}

/** Canonical JSON v2 (see the header). `undefined` object members are dropped, like a missing column. */
export function canonicalJson(v: Json): string {
  if (v === null || v === undefined) return "null"
  if (v === true) return "true"
  if (v === false) return "false"
  if (typeof v === "number") return numberText(v)
  if (typeof v === "string") return textOf(v)
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x === undefined ? null : x)).join(", ")}]`
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).map((k) => ({ k, b: keyBytes(k) }))
  keys.sort((x, y) => byteCompare(x.b, y.b))
  return `{${keys.map(({ k }) => `${textOf(k)}: ${canonicalJson(v[k])}`).join(", ")}}`
}

/** The 19 hashed keys of an event, with the database's names. */
export function eventBody(e: Omit<AuditEvent, "hash" | "prev">): JsonObject {
  return {
    action: e.action, actor: e.actor, asset: e.asset, at: e.at, auth: e.auth, client: e.client, data: e.data,
    entity: e.entity, entity_id: e.entityId, ok: e.ok, permit: e.permit, reason: e.reason, request: e.request,
    rev: e.rev, role: e.role, seq: e.seq, text: e.text, unit: e.unit, v: 2,
  }
}

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16))

/** hash = SHA-256(prev (32 bytes) ‖ UTF-8(canonical body)). */
export function eventHash(e: Omit<AuditEvent, "hash">): string {
  const body = utf8(canonicalJson(eventBody(e)))
  const prev = hexBytes(e.prev)
  const all = new Uint8Array(prev.length + body.length)
  all.set(prev)
  all.set(body, prev.length)
  return sha256Hex(all)
}
export const hashOf = eventHash

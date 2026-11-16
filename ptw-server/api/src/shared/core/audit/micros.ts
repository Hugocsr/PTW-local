// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit/micros.ts; não edite (node scripts/sync-shared.mjs)
import type { AuditEvent } from "./types.ts"

/** Time as the database keeps it: microseconds, row timestamps, ranges. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Microseconds since 1970 UTC of an ISO instant (fractions down to the microsecond). A text without
 * offset (old data) is read in São Paulo (-03:00, no daylight saving since 2019).
 */
export function epochMicros(iso: string): number {
  const m = ISO.exec(iso)
  if (!m) throw new Error(`Hora inválida na auditoria: ${iso}`)
  const [, y, mo, d, h, mi, s = "0", frac = "", zone = "-03:00"] = m
  let off = 0
  if (zone !== "Z") {
    const z = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)!
    off = (z[1] === "-" ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3]))
  }
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - off * 60000
  return ms * 1000 + Number((frac + "000000").slice(0, 6))
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0")
function utcParts(us: number) {
  const ms = Math.floor(us / 1000)
  const t = new Date(ms)
  const micro = us - Math.floor(us / 1_000_000) * 1_000_000
  return { t, micro, date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}` }
}
/** "quando" of the export: UTC with microseconds, like to_char(… 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'). */
export function microsToUtc(us: number): string {
  const p = utcParts(us)
  return `${p.date}T${p.time}.${pad(p.micro, 6)}Z`
}
/** ISO instant (for the screen's time helpers) of an event's `at`. */
export const eventIso = (e: Pick<AuditEvent, "at">): string => microsToUtc(e.at)

const fracText = (micro: number) => (micro ? `.${pad(micro, 6).replace(/0+$/, "")}` : "")
/** A timestamptz as to_jsonb writes it in the audit (session in UTC): "2026-11-06T17:00:00+00:00". */
export const rowTs = (iso: string): string => {
  const p = utcParts(epochMicros(iso))
  return `${p.date}T${p.time}${fracText(p.micro)}+00:00`
}
const rangeBound = (iso: string) => {
  const p = utcParts(epochMicros(iso))
  return `"${p.date} ${p.time}${fracText(p.micro)}+00"`
}
/** A tstzrange "[start, end)" as text in UTC: `["2026-11-06 17:00:00+00","2026-11-06 21:00:00+00")`. */
export const rowRange = (startIso: string, endIso: string): string => `[${rangeBound(startIso)},${rangeBound(endIso)})`
/** A bytea column (SHA-256 kept as bytes): "\\x" + hex. */
export const rowBytea = (hex: string): string => `\\x${hex.toLowerCase()}`

// @ts-nocheck — cópia de ptw-mockup-v2/src/core/time.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Time as the database keeps it (ptw-server/db/MODELO.md): every instant is ISO 8601 with its
 * offset ("2026-11-06T14:00:00-03:00"); a day of validity is "AAAA-MM-DD" read in the unit's time
 * zone (`unit.timezone`). The screen keeps showing local wall time ("06/11 14:03:27").
 * Pure: no clock is read here; the zone is a parameter (default: the unit's).
 */

export const DEFAULT_TZ = "America/Sao_Paulo"

const pad = (n: number, w = 2) => String(n).padStart(w, "0")

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function partsAt(ms: number, tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    fmtCache.set(tz, f)
  }
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value)
  return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second }
}

/** Minutes the zone is ahead of UTC at that instant (São Paulo: -180). */
function offsetMin(ms: number, tz: string): number {
  const p = partsAt(ms, tz)
  const wallAsUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
  return Math.round((wallAsUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

const offsetText = (min: number) => `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`

/** An instant (ms since 1970 UTC) written in the zone: "2026-11-06T14:00:00-03:00" (whole seconds). */
export function isoAt(ms: number, tz: string = DEFAULT_TZ): string {
  const p = partsAt(ms, tz)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${offsetText(offsetMin(ms, tz))}`
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/

/** ms since 1970 UTC. A text without offset (old data) is read as wall time in the zone. */
export function msOf(iso: string, tz: string = DEFAULT_TZ): number {
  if (HAS_ZONE.test(iso)) return Date.parse(iso)
  return Date.parse(instant(iso, tz))
}

/** Wall time in the zone → instant with offset. "2026-11-06T14:00[:ss]" → "2026-11-06T14:00:00-03:00". */
export function instant(wall: string, tz: string = DEFAULT_TZ): string {
  if (HAS_ZONE.test(wall)) return isoAt(Date.parse(wall), tz)
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(wall)
  if (!m) throw new Error(`Hora inválida: ${wall}`)
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  // Two passes settle the offset also next to a daylight-saving change.
  let ms = asUtc - offsetMin(asUtc, tz) * 60000
  ms = asUtc - offsetMin(ms, tz) * 60000
  return isoAt(ms, tz)
}

/** Local wall time of an instant: "2026-11-06T14:00:00". */
export function wallOf(iso: string, tz: string = DEFAULT_TZ): string {
  if (!HAS_ZONE.test(iso)) return toSeconds(iso)
  return isoAt(Date.parse(iso), tz).slice(0, 19)
}

/** The day of an instant in the zone: "2026-11-06". */
export const dayOf = (iso: string, tz: string = DEFAULT_TZ): string => wallOf(iso, tz).slice(0, 10)

/** Validity "up to the day" as an instant: the start of the next day in the zone. */
export function nextDayStart(day: string, tz: string = DEFAULT_TZ): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return instant(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00:00`, tz)
}

/** The instant `minutes` later (fractions allowed), written in the zone. */
export const addMinutes = (iso: string, minutes: number, tz: string = DEFAULT_TZ): string => isoAt(msOf(iso, tz) + Math.round(minutes * 60000), tz)

/** Order of two instants (with or without offset): negative when `a` is earlier. */
export const cmpInstant = (a: string, b: string, tz: string = DEFAULT_TZ): number => msOf(a, tz) - msOf(b, tz)

/** Full "YYYY-MM-DDTHH:mm:ss" wall text of a minute- or second-precision wall time. */
export const toSeconds = (iso: string) => (iso.length === 16 ? `${iso}:00` : iso.slice(0, 19))

/** How times read on screen: always with seconds, local to the unit ("14:03:27"). */
export const hms = (iso: string, tz: string = DEFAULT_TZ) => wallOf(iso, tz).slice(11, 19)
/** "06/11 14:03:27" */
export const dmHms = (iso: string, tz: string = DEFAULT_TZ) => {
  const w = wallOf(iso, tz)
  return `${w.slice(8, 10)}/${w.slice(5, 7)} ${w.slice(11, 19)}`
}
/** "06/11/2026" for a day or an instant. */
export const dmy = (dayOrIso: string, tz: string = DEFAULT_TZ) => {
  const d = dayOrIso.length === 10 ? dayOrIso : dayOf(dayOrIso, tz)
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
}

import type { Permit } from "@/permit/types"
import { cmpInstant, dayOf, dmHms, hms } from "@/core/time"

/** The permit's name: its number, or "PT sem número" before Enviar (never the state word, which the badge already says). */
export const permitName = (p: Permit) => p.number ?? "PT sem número"
/** Shorter form for tight cells: "PT-…0010". */
export const permitShort = (p: Permit) => (p.number ? `PT-…${p.number.slice(-4)}` : "PT sem número")

const dm = (iso: string) => dmHms(iso).slice(0, 5)
const hm = hms

/** "06/11 08:00:00–17:00:00" (local to the unit), or both dates when the window crosses midnight. */
export function fmtWindow(p: Permit) {
  return dayOf(p.windowStart) === dayOf(p.windowEnd)
    ? `${dm(p.windowStart)} ${hm(p.windowStart)}–${hm(p.windowEnd)}`
    : `${dm(p.windowStart)} ${hm(p.windowStart)} – ${dm(p.windowEnd)} ${hm(p.windowEnd)}`
}

/** Minutes from the simulated now to the end of the window (negative = already over). */
export const minutesToEnd = (p: Permit, now: string) => Math.round(cmpInstant(p.windowEnd, now) / 60000)

export function fmtRemaining(min: number) {
  if (min <= 0) return "janela encerrada"
  const h = Math.floor(min / 60)
  const m = min % 60
  // "vence em 45 min", "vence em 3 h", "vence em 3 h 5 min": always with units, never split across lines.
  const t = `vence em ${[h > 0 ? `${h} h` : "", m > 0 ? `${m} min` : ""].filter(Boolean).join(" ")}`
  return t.replace(/ /g, " ")
}

/** "5 h 12 min", "3 h", "42 min": units always, never split across lines (non-breaking spaces). Zero or less = "0 min". */
export function fmtDuration(min: number) {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  return (h > 0 ? [`${h} h`, r > 0 ? `${r} min` : ""] : [`${r} min`]).filter(Boolean).join(" ").replace(/ /g, " ")
}

/** "06/11 · 08:00–16:00" (no seconds, for lists); both days when the window crosses midnight. */
export function fmtWindowShort(p: Pick<Permit, "windowStart" | "windowEnd">) {
  const hm5 = (iso: string) => hm(iso).slice(0, 5)
  return dayOf(p.windowStart) === dayOf(p.windowEnd)
    ? `${dm(p.windowStart)} · ${hm5(p.windowStart)}–${hm5(p.windowEnd)}`
    : `${dm(p.windowStart)} ${hm5(p.windowStart)} – ${dm(p.windowEnd)} ${hm5(p.windowEnd)}`
}

/** "10/11 07:45:00": date and time with seconds, for a signature stamp or an audit event (seconds belong there). */
export const fmtStamp = (iso: string) => dmHms(iso)

/** "há 12 min", "há 2 h", "há 3 d": relative time for `now`; always pair it with the absolute time in a `title`. */
export function fmtAgo(iso: string, now: string) {
  const min = Math.max(0, Math.floor(cmpInstant(now, iso) / 60000))
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  if (min < 1440) return `há ${Math.floor(min / 60)} h`
  return `há ${Math.floor(min / 1440)} d`
}

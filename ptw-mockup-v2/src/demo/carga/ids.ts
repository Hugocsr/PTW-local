/**
 * Ids of the load scenario ("Carga · 100 mil PTs"): families of their own (0x0c..), so they never
 * meet the pulp mill's (0x0a.., 0x0b..) or the original sample's.
 */
import { seedUuid } from "@/registry/seedIds"

/** seedUuid without its checks, for the hundreds of thousands of rows the load makes (same text). */
const fast = (family: number) => {
  const head = `019a${family.toString(16).padStart(4, "0")}-0000-7000-8000-`
  return (n: number) => head + n.toString(16).padStart(12, "0")
}

export const G = {
  asset: (n: number) => seedUuid(0x0c11, n),
  rel: (n: number) => seedUuid(0x0c12, n),
  person: (n: number) => seedUuid(0x0c20, n),
  personRole: (n: number) => seedUuid(0x0c21, n),
  permit: fast(0x0c01),
  signature: fast(0x0c02),
  /** Signatures of the prototypes (replayed, then copied: never in the scenario). */
  protoSignature: (n: number) => seedUuid(0x0c03, n),
  protoPermit: (n: number) => seedUuid(0x0c04, n),
}

/** Deterministic PRNG (mulberry32): the same seed gives the same plant on every load. */
export function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1))
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
  /** Weighted choice: [value, weight][]. */
  const weighted = <T,>(xs: readonly (readonly [T, number])[]): T => {
    const total = xs.reduce((n, [, w]) => n + w, 0)
    let r = next() * total
    for (const [v, w] of xs) { if ((r -= w) < 0) return v }
    return xs[xs.length - 1][0]
  }
  function shuffle<T>(xs: T[]): T[] {
    for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]] }
    return xs
  }
  return { next, int, pick, weighted, shuffle }
}
export type Rng = ReturnType<typeof rng>

/**
 * Fast instant text for the unit's zone (America/Sao_Paulo has kept -03:00 all year since 2019):
 * "2026-11-10T10:00:00-03:00". `Intl` per instant would cost seconds over a million signatures.
 */
const OFFSET_MS = -3 * 3600_000
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
/** Day number → civil date (H. Hinnant's algorithm): no Date object per call. */
function civil(days: number): [number, number, number] {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d]
}
export function isoSP(ms: number): string {
  const local = ms + OFFSET_MS
  const days = Math.floor(local / 86400_000)
  let rest = Math.floor((local - days * 86400_000) / 1000)
  const [y, mo, d] = civil(days)
  const h = Math.floor(rest / 3600); rest -= h * 3600
  const mi = Math.floor(rest / 60)
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(rest - mi * 60)}-03:00`
}

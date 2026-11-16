/** Typed fields: time of day, date, document code and number, with their masks and range rules. */

/** Digits only, grouped by ":" as they are typed ("1430" becomes "14:30"). */
export function maskTime(raw: string, seconds: boolean): string {
  const d = raw.replace(/\D/g, "").slice(0, seconds ? 6 : 4)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join(":")
}

/** Why a typed time is not a time yet, or null when it is complete and valid. Empty says nothing. */
export function timeProblem(v: string, seconds: boolean): string | null {
  if (!v) return null
  const p = v.split(":")
  if (p.length !== (seconds ? 3 : 2) || p.some((x) => x.length !== 2)) return `Complete o horário (${seconds ? "hh:mm:ss" : "hh:mm"}).`
  const [h, m, s] = p.map(Number)
  if (h > 23) return "Hora de 00 a 23."
  if (m > 59) return "Minutos de 00 a 59."
  if (seconds && s > 59) return "Segundos de 00 a 59."
  return null
}

/* ---------- dates: "dd/mm/aaaa", typed as digits ---------- */

/** Digits only, grouped by "/" as they are typed ("08112026" becomes "08/11/2026"). */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/")
}

/** "08/11/2026" (as typed) → "2026-11-08", or null when incomplete or not a real date. */
export function dateIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}
/** "2026-11-08" → "08/11/2026" (how every date is shown). */
export const dateBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")
/** A stored date ("AAAA-MM-DD") that is complete and exists, or null. */
export function validIso(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return dateIso(dateBr(v)) === v ? v : null
}

/** Why a typed date is not a date yet, or null when it is complete and valid. Empty says nothing. */
export function dateProblem(v: string): string | null {
  if (!v) return null
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return "Complete a data (dd/mm/aaaa)."
  return dateIso(v) ? null : "Data inexistente."
}

/** Why a complete date breaks the item's rule (before today, outside min/max), or null. */
export function dateRuleProblem(item: { notBeforeToday: boolean; min?: string; max?: string }, iso: string, today?: string): string | null {
  if (item.notBeforeToday && today && iso < today) return "antes de hoje"
  if (item.min && iso < item.min) return `antes de ${dateBr(item.min)}`
  if (item.max && iso > item.max) return `depois de ${dateBr(item.max)}`
  return null
}

/** "não antes de hoje · até 31/12/2026", or "". */
export function dateRuleLabel(item: { notBeforeToday: boolean; min?: string; max?: string }): string {
  return [item.notBeforeToday ? "não antes de hoje" : "", item.min ? `a partir de ${dateBr(item.min)}` : "", item.max ? `até ${dateBr(item.max)}` : ""].filter(Boolean).join(" · ")
}

/* ---------- document codes: "#" digit, "A" letter, anything else literal ---------- */

/** Does a code follow the pattern? An empty pattern accepts anything. */
export function codeMatches(code: string, pattern: string | undefined): boolean {
  const p = pattern?.trim()
  if (!p) return true
  const c = code.trim().toUpperCase()
  if (c.length !== p.length) return false
  return [...p].every((ch, i) => (ch === "#" ? /\d/.test(c[i]) : ch.toUpperCase() === "A" && ch === "A" ? /[A-Z]/.test(c[i]) : c[i] === ch.toUpperCase()))
}

/* ---------- numbers: stored as numbers, shown and typed with the pt-BR mask ---------- */

export const MAX_DECIMALS = 4
/** Integer digits a number item accepts (keeps values exact in floating point). */
const MAX_INT_DIGITS = 9

/** 1234.5 with 2 decimals → "1.234,50". Always the fixed number of decimals. */
export function formatNumber(v: number, decimals: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)
}

/** "1.234,50 V"; the unit is omitted when empty. */
export const formatMeasure = (v: number, decimals: number, unit: string) => `${formatNumber(v, decimals)}${unit.trim() ? ` ${unit.trim()}` : ""}`

/** What the person typed in a number field: the value (undefined when empty) or why it is refused. */
export type NumberText = { ok: true; value: number | undefined } | { ok: false; message: string }

/**
 * Natural typing: the number as it is read. "," or "." is the decimal separator (with a comma
 * present, dots are thousands separators; several dots are thousands too). At most `decimals`
 * digits after it; "-" only with `negative`. Empty means no answer. The value is rounded to `decimals`.
 */
export function parseNumberText(raw: string, decimals: number, negative: boolean): NumberText {
  let t = raw.replace(/\s/g, "")
  if (!t) return { ok: true, value: undefined }
  let sign = 1
  if (t.startsWith("-")) {
    if (!negative) return { ok: false, message: "Este campo não aceita valor negativo." }
    sign = -1
    t = t.slice(1)
  }
  if (t.includes("-") || /[^\d.,]/.test(t)) return { ok: false, message: "Digite só números." }
  if (t.includes(",")) t = t.replace(/\./g, "")
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "")
  else t = t.replace(".", ",")
  const parts = t.split(",")
  if (parts.length > 2) return { ok: false, message: "Use uma só vírgula." }
  const [int, frac = ""] = parts
  if (parts.length === 2) {
    if (decimals === 0) return { ok: false, message: "Este campo aceita só números inteiros." }
    if (frac.length > decimals) return { ok: false, message: `No máximo ${decimals} ${decimals === 1 ? "casa decimal" : "casas decimais"}.` }
  }
  if (int.replace(/^0+/, "").length > MAX_INT_DIGITS) return { ok: false, message: `No máximo ${MAX_INT_DIGITS} dígitos inteiros.` }
  if (!int && !frac) return { ok: true, value: undefined } // only a separator typed so far
  const n = Number(`${int || "0"}.${frac || "0"}`)
  const v = Math.round(n * 10 ** decimals) / 10 ** decimals
  return { ok: true, value: sign === -1 && v !== 0 ? -v : v }
}

/** A value as the field shows it when left: thousands separators and fixed decimals ("-1.234,50"). */
export const formatNumberField = (v: number, decimals: number) => `${v < 0 ? "-" : ""}${formatNumber(Math.abs(v), decimals)}`

/** Why a value is out of the item's range, or null. */
export function rangeProblem(item: { min?: number; max?: number; decimals: number; unit: string }, v: number): string | null {
  const f = (x: number) => formatMeasure(x, item.decimals, item.unit)
  if (item.min !== undefined && v < item.min) return `abaixo do mínimo de ${f(item.min)}`
  if (item.max !== undefined && v > item.max) return `acima do máximo de ${f(item.max)}`
  return null
}

/** "faixa 19,5 a 23,5 %", "exatamente 0 V", "mín. 0 V", "máx. 50 °C", or "" with no range. */
export function rangeLabel(item: { min?: number; max?: number; decimals: number; unit: string }): string {
  const f = (x: number) => formatMeasure(x, item.decimals, item.unit)
  if (item.min !== undefined && item.min === item.max) return `exatamente ${f(item.min)}`
  if (item.min !== undefined && item.max !== undefined) return `faixa ${formatNumber(item.min, item.decimals)} a ${f(item.max)}`
  if (item.min !== undefined) return `mín. ${f(item.min)}`
  if (item.max !== undefined) return `máx. ${f(item.max)}`
  return ""
}

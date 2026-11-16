/**
 * Names, units and provenance: how labels are compared with the excerpt they cite.
 */

/** Lowercase, no accents, words separated by single spaces ("Painel / CCM" → "painel ccm"). */
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim()

const STOP = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "ou", "em", "no", "na", "nos", "nas", "um", "uma", "com", "sem", "por", "para", "que", "se", "ao", "aos", "the", "of", "and", "or", "to", "in", "on", "for"])
const sameWord = (x: string, y: string) => {
  if (x === y) return true
  if (x.length < 4 || y.length < 4) return false
  // tolerate plural/gender endings and fixed typos at the end: compare stems
  const sx = x.slice(0, Math.max(4, x.length - 2))
  const sy = y.slice(0, Math.max(4, y.length - 2))
  return y.startsWith(sx) || x.startsWith(sy)
}

/**
 * Is the label read from the quoted text? At least 80 % of its meaningful words must appear in
 * `trecho` (normalized, tolerant to plural/gender endings). A label the source does not contain is
 * the signature of an invented item.
 */
export function rotuloNoTrecho(rotulo: string, trecho: string): boolean {
  const t = normalizar(trecho).split(" ").filter(Boolean)
  const all = normalizar(rotulo).split(" ").filter(Boolean)
  const sig = all.filter((w) => !STOP.has(w))
  const words = sig.length ? sig : all
  if (words.length === 0) return true
  return words.filter((w) => t.some((y) => sameWord(w, y))).length / words.length >= 0.8
}

/** Canonical units (SI symbols and the few the plant forms use). Anything else is accepted with a warning. */
export const UNIDADES = ["", "%", "% LIE", "ppm", "mg/m³", "V", "kV", "mV", "A", "mA", "kA", "W", "kW", "Ω", "MΩ", "Hz", "°C", "bar", "kPa", "MPa", "Pa", "m", "cm", "mm", "m²", "m³", "L", "kg", "t", "N", "kN", "s", "min", "h", "lx", "dB(A)", "m/s", "km/h", "rpm"]

export const decimalsFit = (v: number, d: number) => { const x = v * 10 ** d; return Math.abs(x - Math.round(x)) < 1e-6 }

/** Pure text matching for the command palette: no accents, no case, every word must appear. */
const MARKS = /[̀-ͯ]/g
export const fold = (s: string) => s.normalize("NFD").replace(MARKS, "").toLocaleLowerCase("pt-BR")

/** True when every word of `query` appears somewhere in `text`. An empty query matches nothing. */
export function matches(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return false
  const hay = fold(text)
  return words.every((w) => hay.includes(w))
}

/** `text` cut into pieces; the odd ones are what the query's words matched (for a subtle emphasis). */
export function highlight(text: string, query: string): string[] {
  const hay = fold(text)
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length || hay.length !== text.length) return [text]
  const hit = new Array<boolean>(text.length).fill(false)
  for (const w of words) for (let i = hay.indexOf(w); i >= 0; i = hay.indexOf(w, i + 1)) for (let k = 0; k < w.length; k++) hit[i + k] = true
  const out: string[] = []
  let cur = "", on = false
  for (let i = 0; i < text.length; i++) {
    if (hit[i] !== on) { out.push(cur); cur = ""; on = hit[i] }
    cur += text[i]
  }
  out.push(cur)
  return out
}

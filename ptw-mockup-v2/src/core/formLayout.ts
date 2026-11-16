/**
 * How a form section reads when filled in (DESIGN.md · Itens de formulário). Pure: no React.
 * - A run of 3 or more notices, each with its own label ("Classe 5", "Classe 4"…), is a reference
 *   table copied from the paper: it folds into one block the filler opens when needed.
 * - A choice whose label names one of those notices ("Classe 4") shows that notice next to the answer.
 * - An item whose label repeats its section's title is not titled twice.
 * - Several signatures the answers do not require read as one muted line.
 */
import type { FormItem, FormSection } from "@/registry/types"

export type NoticeItem = Extract<FormItem, { kind: "aviso" }>
export type FormBlock = { kind: "item"; item: FormItem } | { kind: "notices"; items: NoticeItem[] }

/** Long option lists become a searchable picker above this many options; short ones stay as buttons. */
export const MAX_CHIPS = 6

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()

/** A notice with a label of its own (not the generic "Aviso" every notice gets by default). */
const named = (n: NoticeItem) => !!n.label.trim() && norm(n.label) !== "aviso"

/** Items in order, with each reference run (3+ consecutive named notices, labels all different) folded into one block. */
export function formBlocks(items: FormItem[]): FormBlock[] {
  const out: FormBlock[] = []
  let run: NoticeItem[] = []
  const flush = () => {
    const distinct = new Set(run.map((n) => norm(n.label))).size === run.length
    if (run.length >= 3 && run.every(named) && distinct) out.push({ kind: "notices", items: run })
    else out.push(...run.map((item) => ({ kind: "item" as const, item })))
    run = []
  }
  for (const item of items) {
    if (item.kind === "aviso") { run.push(item); continue }
    flush()
    out.push({ kind: "item", item })
  }
  flush()
  return out
}

/** The named notice of the section whose label is the chosen option's ("Classe 4" → the Classe 4 row). */
export function noticeForChoice(items: FormItem[], choiceLabel: string): NoticeItem | undefined {
  const k = norm(choiceLabel)
  if (!k) return undefined
  return items.find((i): i is NoticeItem => i.kind === "aviso" && named(i) && norm(i.label) === k)
}

/**
 * A notice's text in parts, without its own label in front: "Classe 4: Proteção… · aprovação mínima:
 * X · prazo máximo: 01 DIA" → ["Proteção…", "aprovação mínima: X", "prazo máximo: 01 DIA"].
 */
export function noticeParts(n: NoticeItem): string[] {
  let t = n.text.trim()
  const lead = `${n.label.trim()}:`
  if (named(n) && norm(t).startsWith(norm(lead))) t = t.slice(lead.length).trim()
  return t.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean)
}

/** The item says what its section already says ("Itens de verificação" in "Itens de verificação"). */
export function repeatsTitle(section: Pick<FormSection, "title">, item: Pick<FormItem, "label">): boolean {
  return !!section.title.trim() && norm(section.title) === norm(item.label)
}

/**
 * The reasons several not-required signatures would be required, as one phrase:
 * ["só para Classe 4", "só para Classe 3"] → "só para Classe 4 ou Classe 3".
 */
export function joinWhens(whens: string[]): string {
  const uniq = [...new Set(whens)]
  const pre = "só para "
  if (uniq.length > 1 && uniq.every((w) => w.startsWith(pre))) {
    const vals = [...new Set(uniq.flatMap((w) => w.slice(pre.length).split(/ ou /)))]
    return `${pre}${vals.slice(0, -1).join(", ")} ou ${vals[vals.length - 1]}`
  }
  return uniq.join("; ")
}

/** The creation engine's common pieces: item kinds, labels, small list helpers, inline name. */
import { useLayoutEffect, useRef } from "react"
import { runAsUndo } from "@/audit/store"
import { CalendarIcon, FileTextIcon, InfoIcon, ListChecksIcon, LockKeyholeIcon, PaperclipIcon, ClockIcon, HashIcon, SquareCheckIcon, Table2Icon, TextIcon, UserIcon, PencilIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { uuidv7 } from "@/lib/id"
import { DeferredText } from "../DeferredText"
import { answersLabel, dateRuleLabel, lineChoices, optionBlocks, optionsOf, rangeLabel } from "@/core/form"
import { joinOr } from "@/core/eligibility"
import type { AttachKind, CheckLine, ColumnItem, Condition, FormItem, FormItemKind, OptionList, TemplateContent, TypeDef } from "@/registry/types"

/* The creation engine: a common skeleton (the stages) and a free form hung on it. */

export const KINDS: Record<FormItemKind, { title: string; icon: typeof TextIcon }> = {
  texto: { title: "Texto", icon: TextIcon },
  marcacao: { title: "Marcação", icon: SquareCheckIcon },
  verificacao: { title: "Verificação", icon: ListChecksIcon },
  aviso: { title: "Aviso", icon: InfoIcon },
  numero: { title: "Número", icon: HashIcon },
  horario: { title: "Horário", icon: ClockIcon },
  data: { title: "Data", icon: CalendarIcon },
  anexo: { title: "Foto, vídeo ou arquivo", icon: PaperclipIcon },
  documento: { title: "Documento", icon: FileTextIcon },
  pessoa: { title: "Pessoa", icon: UserIcon },
  isolamento: { title: "Pontos de isolamento", icon: LockKeyholeIcon },
  grupo: { title: "Grupo repetível", icon: Table2Icon },
}

export const ATTACH: Record<AttachKind, string> = { foto: "Foto", video: "Vídeo", arquivo: "Arquivo" }
/** Accepted kinds always read in the same order (Foto, Vídeo, Arquivo), whatever the click order. */
export const attachOrder = (v: AttachKind[]) => (Object.keys(ATTACH) as AttachKind[]).filter((k) => v.includes(k))

/**
 * A template edit. A function patch is applied to the version as it is when it runs, so "Desfazer"
 * on a toast restores into the current content even after other edits.
 */
export type SetTpl = (patch: Partial<TemplateContent> | ((cur: TemplateContent) => Partial<TemplateContent>)) => void

/** The latest value, readable from a callback that runs later (a toast's "Desfazer"). */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useLayoutEffect(() => { ref.current = value })
  return ref
}

/** Puts a removed entry back where it was. */
export const insertAt = <T,>(list: T[], i: number, x: T) => [...list.slice(0, i), x, ...list.slice(i)]

/** Loose items are removed at once; the toast offers "Desfazer" that puts them back in place. */
export function removedToast(title: string, description: string | undefined, undo: () => void) {
  toast(title, { description: description || undefined, action: { label: "Desfazer", onClick: () => runAsUndo(undo) } })
}

/** Applies a change to one item of the form, wherever its section is. */
export const patchItem = (cur: TemplateContent, itemId: string, fn: (i: FormItem) => FormItem): Partial<TemplateContent> =>
  ({ form: { sections: (cur.form?.sections ?? []).map((s) => ({ ...s, items: s.items.map((i) => (i.id === itemId ? fn(i) : i.kind === "grupo" ? { ...i, columns: i.columns.map((c) => (c.id === itemId ? fn(c) as ColumnItem : c)) } : i)) })) } })

export const ANSWER_SETS = { sim_nao_na: "Sim · Não · N/A", sim_nao: "Sim · Não", confirmo: "Confirmo", lista: "Itens de uma lista" } as const

export const newLine = (label = ""): CheckLine => ({ id: uuidv7(), label, blockOn: ["nao"], noteOn: ["na"] })

export function newItem(kind: FormItemKind): FormItem {
  const base = { id: uuidv7(), label: "", required: true }
  if (kind === "texto") return { ...base, kind, long: false }
  if (kind === "marcacao") return { ...base, kind, options: [{ id: uuidv7(), label: "" }], multiple: true, other: false }
  if (kind === "verificacao") return { ...base, kind, answers: "sim_nao_na", lines: [newLine()] }
  if (kind === "anexo") return { ...base, kind, accept: ["foto"], min: 1, hint: "" }
  if (kind === "numero") return { ...base, kind, unit: "", decimals: 0, negative: false }
  if (kind === "horario") return { ...base, kind, seconds: false }
  if (kind === "data") return { ...base, kind, notBeforeToday: false }
  if (kind === "documento") return { ...base, kind, attach: false, validity: false }
  if (kind === "pessoa") return { ...base, kind, multiple: false, mustBeEligible: false }
  if (kind === "isolamento") return { ...base, kind, minRows: 1 }
  if (kind === "grupo") return { ...base, kind, minRows: 1, columns: [newItem("horario") as ColumnItem, { ...(newItem("numero") as ColumnItem), required: true }] }
  return { ...base, kind, label: "Aviso", required: false, text: "" }
}

/** One-line description of an item, so a collapsed list reads like the paper form. */
export function itemMeta(i: FormItem, lists: OptionList[], roles: TypeDef[] = [], { blocks = true }: { blocks?: boolean } = {}): string {
  if (i.kind === "data") return ["dd/mm/aaaa", dateRuleLabel(i)].filter(Boolean).join(" · ")
  if (i.kind === "documento") return [i.pattern?.trim() ? `formato ${i.pattern.trim()}` : "número ou código", i.attach ? "com o documento anexado" : "", i.validity ? "com validade" : ""].filter(Boolean).join(" · ")
  if (i.kind === "pessoa") return [i.multiple ? "várias pessoas" : "uma pessoa", i.roleId ? `cargo ${roles.find((r) => r.id === i.roleId)?.label ?? "removido"}` : "qualquer pessoa", i.mustBeEligible ? "deve estar elegível" : ""].filter(Boolean).join(" · ")
  if (i.kind === "isolamento") return `ponto, energia, método, cadeado, energia zero, quem aplicou${i.minRows ? ` · mín. ${i.minRows}` : ""}`
  if (i.kind === "grupo") return `${i.columns.length} ${i.columns.length === 1 ? "coluna" : "colunas"}: ${i.columns.map((c) => c.label || KINDS[c.kind].title).join(", ")}${i.minRows ? ` · mín. ${i.minRows} ${i.minRows === 1 ? "linha" : "linhas"}` : ""}`
  if (i.kind === "texto") return i.long ? "Texto longo" : "Texto curto"
  if (i.kind === "marcacao") {
    const src = i.listId ? `Lista ${lists.find((l) => l.id === i.listId)?.name ?? "removida"}` : `${i.options.length} ${i.options.length === 1 ? "opção" : "opções"}`
    const stops = optionsOf(i, lists).filter((o) => optionBlocks(i, o.id)).length
    return `${src}${i.other ? " + outro" : ""} · ${i.multiple ? "várias" : "uma"}${stops && blocks ? ` · ${stops} ${stops === 1 ? "impede" : "impedem"}` : ""}`
  }
  if (i.kind === "verificacao") {
    const stops = i.lines.filter((l) => l.blockOn.length > 0).length
    return `${i.lines.length} ${i.lines.length === 1 ? "linha" : "linhas"} · ${i.answers === "lista" ? answersLabel(i, lists) : ANSWER_SETS[i.answers]}${stops && blocks ? ` · ${stops} ${stops === 1 ? "impede" : "impedem"}` : ""}`
  }
  if (i.kind === "numero") {
    const range = rangeLabel(i)
    return [i.unit.trim() || "Sem unidade", i.decimals === 0 ? "inteiro" : `${i.decimals} ${i.decimals === 1 ? "casa" : "casas"}`, range].filter(Boolean).join(" · ")
  }
  if (i.kind === "horario") return i.seconds ? "hh:mm:ss" : "hh:mm"
  if (i.kind === "anexo") return `${attachOrder(i.accept).map((k) => ATTACH[k]).join(" ou ")}${i.min > 1 ? ` · mín. ${i.min}` : ""}`
  return ""
}

/** How many options or lines stop the stage (shown as its own flag on the row). */
export function blockCount(i: FormItem, lists: OptionList[]): number {
  if (i.kind === "marcacao") return optionsOf(i, lists).filter((o) => optionBlocks(i, o.id)).length
  if (i.kind === "verificacao") return i.lines.filter((l) => l.blockOn.length > 0).length
  return 0
}

/** "Classe = Classe 4 ou Classe 3": the condition in words, for a collapsed row or a signature summary. */
export function conditionText(c: Condition, items: FormItem[], lists: OptionList[]): string {
  const src = items.find((x) => x.id === c.itemId)
  if (!src) return "pergunta removida"
  const values = src.kind === "marcacao" ? optionsOf(src, lists) : src.kind === "verificacao" ? lineChoices(src, lists) : []
  const line = src.kind === "verificacao" && c.lineId ? src.lines.find((l) => l.id === c.lineId)?.label : undefined
  const names = c.anyOf.map((v) => values.find((x) => x.id === v)?.label ?? "?")
  return `${(line || src.label || "sem rótulo").trim()} = ${names.length ? joinOr(names) : "…"}`
}

/** The kind's icon in a small tile, the same in every row of the builder (one map: KINDS). */
export function KindIcon({ kind, className }: { kind: FormItemKind; className?: string }) {
  const K = KINDS[kind]
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground", className)} aria-hidden>
      <K.icon className="size-4" />
    </span>
  )
}

/**
 * An editable name that sits in the page (stage, section, signature title): a dashed underline at rest
 * and a pencil on hover/focus, so it never reads as a label. Fixed names show only the lock (DESIGN.md).
 */
export function InlineName({ className, inputClassName, ...rest }: React.ComponentProps<typeof DeferredText> & { inputClassName?: string }) {
  return (
    <div className={cn("group/name relative min-w-0 flex-1", className)}>
      <DeferredText {...rest} className={cn("min-h-11 w-full min-w-0 rounded-none border-x-transparent border-t-transparent border-b-input border-dashed bg-transparent pr-7 pl-1.5 shadow-none hover:bg-surface-row focus-visible:border-solid focus-visible:bg-surface-row md:min-h-9", inputClassName)} />
      <PencilIcon className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-within/name:opacity-0" aria-hidden />
    </div>
  )
}

export const move = <T,>(list: T[], i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

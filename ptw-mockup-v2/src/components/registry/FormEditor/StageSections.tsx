/** The sections of one stage, and the editor of a section. */
import { useContext, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ClipboardListIcon, EyeIcon, OctagonXIcon, QuoteIcon, ChevronRightIcon, PlusIcon, TextIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import { uuidv7 } from "@/lib/id"
import { ConfirmRemove } from "../common"
import { SourceContext, SourceDisclosure } from "../origem"
import type { FormItem, FormItemKind, FormSection, FormSpec, TemplateContent } from "@/registry/types"
import { TONE_TEXT } from "@/components/shell/Status"
import { ItemEditor } from "./ItemEditor"
import type { SetTpl } from "./shared"
import { InlineName, KINDS, KindIcon, blockCount, conditionText, insertAt, itemMeta, move, newItem, removedToast } from "./shared"

/** The sections filled in one stage, edited inside that stage's card in the Fluxo editor. */
export function StageSections({ tpl, set, stageId, stageName }: { tpl: TemplateContent; set: SetTpl; stageId: string; stageName: string }) {
  const form: FormSpec = tpl.form ?? { sections: [] }
  const setForm = (sections: FormSection[]) => set({ form: { sections } })
  /** A section without a stage (from the database or a file) is shown, and filled, with the first stage. */
  const inStage = (s: FormSection, id: string) => s.stageId === id || (s.stageId === undefined && id === tpl.stages[0]?.id)
  const mine = form.sections.filter((s) => inStage(s, stageId))
  /** Questions a condition may point at: those that come earlier (stage order, then section order). */
  const ordered = tpl.stages.flatMap((st) => form.sections.filter((s) => inStage(s, st.id))).flatMap((s) => s.items)
  const sourcesBefore = (itemId: string): FormItem[] => {
    const k = ordered.findIndex((i) => i.id === itemId)
    return ordered.slice(0, k < 0 ? ordered.length : k).filter((i) => i.kind === "marcacao" || i.kind === "verificacao")
  }
  return (
    <>
      {/* The group's heading row carries its "+ Seção" (DESIGN.md: section action on the right). */}
      <div className="flex min-h-11 flex-wrap items-center gap-x-2 md:min-h-9">
        <h4 className="flex items-center gap-1.5 type-subtitle"><ClipboardListIcon className="size-4 text-muted-foreground" aria-hidden />Preencher</h4>
        {mine.length > 0 && <span className="type-meta tabular-nums">{mine.length} {mine.length === 1 ? "seção" : "seções"} · {mine.reduce((n, s) => n + s.items.length, 0)} {mine.reduce((n, s) => n + s.items.length, 0) === 1 ? "item" : "itens"}</span>}
        <Button variant="ghost" className="ml-auto min-h-11 md:min-h-9" aria-label={`Adicionar seção em ${stageName}`} onClick={() => setForm([...form.sections, { id: uuidv7(), title: "", stageId, items: [] }])}>
          <PlusIcon data-icon="inline-start" />Seção
        </Button>
      </div>
      {mine.length === 0 && <p className="type-meta">Nada a preencher nesta etapa.</p>}
      {mine.length > 0 && <div className="flex flex-col gap-5">
      {mine.map((s, k) => (
        <SectionEditor
          key={s.id}
          section={s}
          number={k + 1}
          sourcesBefore={sourcesBefore}
          allItems={ordered}
          setTpl={set}
          canUp={k > 0}
          canDown={k < mine.length - 1}
          onChange={(next) => setForm(form.sections.map((x) => (x.id === s.id ? next : x)))}
          onRemove={() => {
            const at = form.sections.findIndex((x) => x.id === s.id)
            setForm(form.sections.filter((x) => x.id !== s.id))
            // A section with questions was confirmed first; an empty one goes at once, with "Desfazer".
            if (s.items.length === 0) removedToast("Seção removida", s.title.trim(), () => set((cur) => ({ form: { sections: insertAt(cur.form?.sections ?? [], at, s) } })))
          }}
          onMove={(d) => {
            const i = form.sections.findIndex((x) => x.id === s.id)
            const j = form.sections.findIndex((x) => x.id === mine[k + d]?.id)
            if (j < 0) return
            const next = [...form.sections]
            ;[next[i], next[j]] = [next[j], next[i]]
            setForm(next)
          }}
        />
      ))}
      </div>}
    </>
  )
}

function SectionEditor({ section, number, canUp, canDown, onChange, onRemove, onMove, sourcesBefore, allItems, setTpl }: {
  setTpl: SetTpl
  sourcesBefore: (itemId: string) => FormItem[]
  allItems: FormItem[]
  section: FormSection
  number: number
  canUp: boolean
  canDown: boolean
  onChange: (s: FormSection) => void
  onRemove: () => void
  onMove: (d: number) => void
}) {
  const { state } = useRegistry()
  const origins = useContext(SourceContext)
  const [open, setOpen] = useState<string | null>(null)
  const setItems = (items: FormItem[]) => onChange({ ...section, items })
  const add = (kind: FormItemKind) => {
    const item = newItem(kind)
    setItems([...section.items, item])
    setOpen(item.id)
  }
  const title = section.title.trim() || "sem título"
  const n = section.items.length
  return (
    // A section is a block marked by a left rule inside the stage card: divided, not boxed (DESIGN.md, no card in a card).
    <section className="flex min-w-0 flex-col gap-1 border-l-2 border-foreground/25 pl-2 sm:pl-3" aria-label={`Seção ${number}: ${title}`}>
      <span className="type-label tabular-nums">Seção {number} · {n} {n === 1 ? "item" : "itens"}</span>
      {/* On a phone the title takes the whole row and its actions sit below, so the name stays readable. */}
      <div className="flex flex-wrap items-center justify-end gap-1">
        <InlineName value={section.title} onCommit={(t) => onChange({ ...section, title: t })} placeholder="Título da seção" aria-label="Título da seção" aria-invalid={!section.title.trim()}
          className="basis-full sm:basis-0 sm:flex-1" inputClassName="text-[0.9375rem] leading-[1.375rem] font-semibold md:text-[0.9375rem]" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="min-h-11 md:min-h-9" aria-label={`Adicionar item em ${title}`}><PlusIcon data-icon="inline-start" />Item</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(KINDS) as FormItemKind[]).map((k) => {
              const K = KINDS[k]
              return <DropdownMenuItem key={k} className="min-h-11 md:min-h-9" onSelect={() => add(k)}><K.icon />{K.title}</DropdownMenuItem>
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Subir seção ${title}`} disabled={!canUp} onClick={() => onMove(-1)}><ArrowUpIcon /></Button>
        <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Descer seção ${title}`} disabled={!canDown} onClick={() => onMove(1)}><ArrowDownIcon /></Button>
        {n ? <ConfirmRemove what={section.title || "seção sem título"} detail={`Leva junto ${n} ${n === 1 ? "pergunta" : "perguntas"}.`} onConfirm={onRemove} /> : <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover seção ${title}`} onClick={onRemove}><Trash2Icon /></Button>}
      </div>
      <SourceDisclosure id={section.id} />
      {n === 0 && <p className="type-meta">Nenhum item. Use “+ Item”.</p>}
      {n > 0 && <ul className="flex flex-col divide-y border-t">
        {section.items.map((item, i) => {
          const K = KINDS[item.kind]
          const expanded = open === item.id
          const text = (item.kind === "aviso" ? item.text : item.label).trim()
          /** Names the item in its arrow buttons, so a screen reader hears which one moves. */
          const name = text ? (text.length > 40 ? `${text.slice(0, 40)}…` : text) : `${K.title} sem ${item.kind === "aviso" ? "texto" : "rótulo"}`
          const meta = [item.kind === "texto" ? (item.long ? "longo" : "curto") : itemMeta(item, state.optionLists, state.roleTypes, { blocks: false }), item.kind === "aviso" ? "" : item.required ? "obrigatório" : "opcional"].filter(Boolean).join(" · ")
          const stops = blockCount(item, state.optionLists)
          const origin = origins?.trechos[item.id]
          const flags: { icon: typeof TextIcon; text: string }[] = [
            ...(stops ? [{ icon: OctagonXIcon, text: stops === 1 ? "Impede a etapa" : `${stops} impedem a etapa` }] : []),
            ...(item.showWhen ? [{ icon: EyeIcon, text: `Mostrar quando ${conditionText(item.showWhen, allItems, state.optionLists)}` }] : []),
            ...(origin ? [{ icon: QuoteIcon, text: `Origem · p. ${origin.pagina}` }] : []),
          ]
          const up = () => setItems(move(section.items, i, -1))
          const down = () => setItems(move(section.items, i, 1))
          /* A loose item: removed at once, "Desfazer" puts it back in place. */
          const remove = () => {
            setItems(section.items.filter((x) => x.id !== item.id))
            if (expanded) setOpen(null)
            removedToast("Item removido", name, () => setTpl((cur) => ({ form: { sections: (cur.form?.sections ?? []).map((s) => (s.id === section.id ? { ...s, items: insertAt(s.items, i, item) } : s)) } })))
          }
          return (
            <li key={item.id}>
              <div className="flex items-center gap-1">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}
                  className="flex min-h-12 min-w-0 flex-1 items-start gap-2 rounded-md py-2 pr-1 text-left sm:gap-3 focus-visible:outline-2 focus-visible:outline-ring">
                  <KindIcon kind={item.kind} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("line-clamp-2 break-words type-body font-medium", !text && TONE_TEXT.stop)}>{text || `${K.title} sem ${item.kind === "aviso" ? "texto" : "rótulo"}`}</span>
                    <span className="line-clamp-2 break-words type-meta"><span className="font-medium text-foreground/80">{K.title}</span>{meta ? ` · ${meta}` : ""}
                      {item.kind === "numero" && item.min !== undefined && item.max !== undefined && item.min > item.max && <span className={TONE_TEXT.stop}> · mínimo maior que o máximo</span>}</span>
                    {flags.length > 0 && (
                      <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                        {flags.map((f) => <span key={f.text} className="flex min-w-0 max-w-full items-center gap-1 type-meta"><f.icon className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{f.text}</span></span>)}
                      </span>
                    )}
                  </span>
                  {expanded ? <ChevronDownIcon className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRightIcon className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                </button>
                {/* On a phone the row keeps its width for the text; move and remove sit in the open item. */}
                <div className="hidden shrink-0 items-center sm:flex">
                  <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Subir ${name}`} disabled={i === 0} onClick={up}><ArrowUpIcon /></Button>
                  <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Descer ${name}`} disabled={i === n - 1} onClick={down}><ArrowDownIcon /></Button>
                  <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover ${name}`} onClick={remove}><Trash2Icon /></Button>
                </div>
              </div>
              {expanded && (
                <div className="flex flex-wrap gap-1 border-t border-border/60 py-2 sm:hidden">
                  <Button variant="ghost" className="min-h-11" disabled={i === 0} aria-label={`Subir ${name}`} onClick={up}><ArrowUpIcon data-icon="inline-start" />Subir</Button>
                  <Button variant="ghost" className="min-h-11" disabled={i === n - 1} aria-label={`Descer ${name}`} onClick={down}><ArrowDownIcon data-icon="inline-start" />Descer</Button>
                  <Button variant="ghost" className="ml-auto min-h-11" aria-label={`Remover ${name}`} onClick={remove}><Trash2Icon data-icon="inline-start" />Remover</Button>
                </div>
              )}
              {expanded && (
                <ItemEditor
                  item={item}
                  sources={sourcesBefore(item.id)}
                  onChange={(next) => setItems(section.items.map((x) => (x.id === item.id ? next : x)))}
                  onDuplicate={() => {
                    const copy = structuredClone(item)
                    copy.id = uuidv7()
                    if (copy.kind === "marcacao") copy.options = copy.options.map((o) => ({ ...o, id: uuidv7() }))
                    if (copy.kind === "verificacao") copy.lines = copy.lines.map((l) => ({ ...l, id: uuidv7() }))
                    setItems([...section.items.slice(0, i + 1), copy, ...section.items.slice(i + 1)])
                    setOpen(copy.id)
                  }}
                  setTpl={setTpl}
                />
              )}
            </li>
          )
        })}
      </ul>}
    </section>
  )
}

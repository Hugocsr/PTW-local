/** Pieces of the item editor: group columns, option rows, show-when condition, number settings. */
import { useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronRightIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import { DeferredText } from "../DeferredText"
import { Stepper, ToggleField } from "../common"
import { COLUMN_KINDS, formatMeasure, lineChoices, MAX_DECIMALS, optionsOf } from "@/core/form"
import { NumberInput } from "../NumberInput"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ColumnItem, Condition, FormItem, OptionList } from "@/registry/types"
import { TONE_TEXT } from "@/components/shell/Status"
import { ItemEditor } from "./ItemEditor"
import type { SetTpl } from "./shared"
import { KINDS, KindIcon, insertAt, itemMeta, move, newItem, patchItem, removedToast } from "./shared"

/** The columns of a repeatable group: each one a small item (texto, número, horário, marcação, verificação). */
export function GroupColumns({ item, onChange, setTpl }: { item: Extract<FormItem, { kind: "grupo" }>; onChange: (i: FormItem) => void; setTpl: SetTpl }) {
  const { state } = useRegistry()
  const [open, setOpen] = useState<string | null>(null)
  const setCols = (columns: ColumnItem[]) => onChange({ ...item, columns })
  return (
    <>
      <Stepper label="Mínimo de linhas" value={item.minRows} min={0} onChange={(n) => onChange({ ...item, minRows: n })} />
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 type-field">Colunas (cada linha pede todas)</legend>
        {item.columns.length === 0 && <p className={cn("type-meta", TONE_TEXT.stop)}>Adicione ao menos uma coluna.</p>}
        <ul className="flex flex-col divide-y border-y">
          {item.columns.map((c, k) => {
            const K = KINDS[c.kind]
            const expanded = open === c.id
            const name = c.label.trim() || `${K.title} sem rótulo`
            return (
              <li key={c.id}>
                <div className="flex items-center gap-1">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-ring md:min-h-9">
                    {expanded ? <ChevronDownIcon className="size-4 shrink-0" aria-hidden /> : <ChevronRightIcon className="size-4 shrink-0" aria-hidden />}
                    <KindIcon kind={c.kind} className="size-7" />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("truncate type-body font-medium", !c.label.trim() && TONE_TEXT.stop)}>{name}</span>
                      <span className="truncate type-meta">{[K.title, itemMeta(c, state.optionLists)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Coluna ${name} para a esquerda`} disabled={k === 0} onClick={() => setCols(move(item.columns, k, -1))}><ArrowUpIcon /></Button>
                  <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Coluna ${name} para a direita`} disabled={k === item.columns.length - 1} onClick={() => setCols(move(item.columns, k, 1))}><ArrowDownIcon /></Button>
                  <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Remover coluna ${name}`} onClick={() => {
                    setCols(item.columns.filter((x) => x.id !== c.id))
                    removedToast("Coluna removida", name, () => setTpl((cur) => patchItem(cur, item.id, (x) => (x.kind === "grupo" ? { ...x, columns: insertAt(x.columns, k, c) } : x))))
                  }}><XIcon /></Button>
                </div>
                {expanded && <div className="pl-6"><ItemEditor item={c} sources={[]} column setTpl={setTpl} onChange={(next) => setCols(item.columns.map((x) => (x.id === c.id ? next as ColumnItem : x)))} /></div>}
              </li>
            )
          })}
        </ul>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" className="min-h-11 w-fit md:min-h-9"><PlusIcon data-icon="inline-start" />Coluna</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {COLUMN_KINDS.map((k) => {
              const K = KINDS[k]
              return <DropdownMenuItem key={k} className="min-h-11 md:min-h-9" onSelect={() => { const c = newItem(k) as ColumnItem; setCols([...item.columns, c]); setOpen(c.id) }}><K.icon />{K.title}</DropdownMenuItem>
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </fieldset>
    </>
  )
}

/** Rows typed in place; Enter on the last row adds the next one, as on paper. */
export function ListEditor({ title, rows, onRename, onAdd, onRemove, addLabel, extra }: {
  title: string
  rows: { id: string; label: string }[]
  onRename: (id: string, label: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  addLabel: string
  extra?: (id: string) => React.ReactNode
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 type-field">{title}</legend>
      <ol className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <DeferredText value={r.label} aria-label={`${title} ${i + 1}`} onCommit={(v) => onRename(r.id, v)}
                onKeyDown={(e) => { if (e.key === "Enter" && i === rows.length - 1) { e.preventDefault(); onAdd() } }}
                autoFocus={i === rows.length - 1 && !r.label} className="min-h-11 bg-background md:min-h-9" />
              <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Remover ${title.toLowerCase()} ${i + 1}`} disabled={rows.length === 1} onClick={() => onRemove(r.id)}><XIcon /></Button>
            </div>
            {extra?.(r.id)}
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="min-h-11 w-fit md:min-h-9" onClick={onAdd}><PlusIcon data-icon="inline-start" />{addLabel}</Button>
    </fieldset>
  )
}

/**
 * "Mostrar quando…": the one rule a question can have. It points at an earlier tick or checklist
 * question and lists the answers that make this one appear (and be required).
 */
export function ShowWhen({ item, sources, lists, onChange }: { item: FormItem; sources: FormItem[]; lists: OptionList[]; onChange: (i: FormItem) => void }) {
  return <ConditionEditor idBase={`${item.id}-sw`} value={item.showWhen} sources={sources} lists={lists} legend="Mostrar quando" toggle="Mostrar só quando outra pergunta tiver certa resposta" onChange={(showWhen) => onChange({ ...item, showWhen })} />
}

/**
 * The one rule of the product: "when <question> has one of <answers>". Used by "Mostrar quando" on a
 * question and by "Obrigatória só quando" on a signature. `sources` = tick or checklist questions before.
 */
export function ConditionEditor({ idBase, value, sources, lists, legend, toggle, onChange }: {
  idBase: string; value: Condition | undefined; sources: FormItem[]; lists: OptionList[]; legend: string; toggle: string; onChange: (c: Condition | undefined) => void
}) {
  const c = value
  const src = sources.find((x) => x.id === c?.itemId)
  const on = !!c
  const set = onChange
  const start = () => {
    const first = sources[0]
    if (!first) return
    set({ itemId: first.id, lineId: first.kind === "verificacao" ? first.lines[0]?.id : undefined, anyOf: [] })
  }
  const values: { id: string; label: string }[] = !src ? []
    : src.kind === "marcacao" ? optionsOf(src, lists)
    : src.kind === "verificacao" ? lineChoices(src, lists)
    : []
  const id = (x: string) => `${idBase}-${x}`
  return (
    <fieldset className="flex flex-col gap-3 border-t pt-3">
      <legend className="sr-only">{legend}</legend>
      <ToggleField label={toggle} checked={on} disabled={!on && sources.length === 0} onChange={(v) => (v ? start() : set(undefined))} />
      {!on && sources.length === 0 && <p className="type-meta">Precisa de uma pergunta de marcação ou verificação antes desta.</p>}
      {on && c && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("src")}>Pergunta</Label>
            <Select value={c.itemId} onValueChange={(v) => { const s = sources.find((x) => x.id === v); set({ itemId: v, lineId: s?.kind === "verificacao" ? s.lines[0]?.id : undefined, anyOf: [] }) }}>
              <SelectTrigger id={id("src")} className="min-h-11 w-full min-w-0 bg-surface-row md:min-h-9"><SelectValue placeholder="Pergunta anterior" /></SelectTrigger>
              <SelectContent><SelectGroup>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label || "Sem rótulo"}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </div>
          {src?.kind === "verificacao" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("line")}>Linha</Label>
              <Select value={c.lineId ?? ""} onValueChange={(v) => set({ ...c, lineId: v, anyOf: [] })}>
                <SelectTrigger id={id("line")} className="min-h-11 w-full min-w-0 bg-surface-row md:min-h-9"><SelectValue placeholder="Linha" /></SelectTrigger>
                <SelectContent><SelectGroup>{src.lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.label || "Sem texto"}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="type-field" id={id("val")}>Quando a resposta for</span>
            <ToggleGroup type="multiple" variant="outline" spacing={2} value={c.anyOf} aria-labelledby={id("val")} className="flex flex-wrap justify-start"
              onValueChange={(v) => set({ ...c, anyOf: v })}>
              {values.map((o) => <ToggleGroupItem key={o.id} value={o.id} className="min-h-11 bg-surface-row data-[state=on]:bg-foreground data-[state=on]:text-background md:min-h-9">{o.label}</ToggleGroupItem>)}
            </ToggleGroup>
            {c.anyOf.length === 0 && <p className={cn("type-meta", TONE_TEXT.stop)}>Escolha ao menos uma resposta.</p>}
          </div>
        </>
      )}
    </fieldset>
  )
}

/** Unit, decimals, sign and the optional safe range; the range fields use the same mask as filling in. */
export function NumberSettings({ item, onChange }: { item: Extract<FormItem, { kind: "numero" }>; onChange: (i: FormItem) => void }) {
  const id = (s: string) => `${item.id}-num-${s}`
  const round = (v: number | undefined, d: number) => (v === undefined ? undefined : Math.round(v * 10 ** d) / 10 ** d)
  const bad = item.min !== undefined && item.max !== undefined && item.min > item.max
  const sample = item.decimals === 0 ? 1234 : 1234.5678
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("unit")}>Unidade de medida</Label>
        <DeferredText id={id("unit")} value={item.unit} maxLength={12} onCommit={(unit) => onChange({ ...item, unit })} placeholder="Ex.: V, %, °C, bar, ppm" className="min-h-11 sm:w-48 md:min-h-9" />
      </div>
      <Stepper label="Casas decimais" value={item.decimals} min={0} max={MAX_DECIMALS}
        onChange={(d) => onChange({ ...item, decimals: d, min: round(item.min, d), max: round(item.max, d) })} />
      <ToggleField label="Aceita valor negativo" checked={item.negative}
        onChange={(v) => onChange({ ...item, negative: v, ...(v ? {} : { min: item.min !== undefined && item.min < 0 ? undefined : item.min, max: item.max !== undefined && item.max < 0 ? undefined : item.max }) })} />
      <p className="type-meta">Quem preenche vê: {formatMeasure(item.negative ? -sample : sample, item.decimals, item.unit)}</p>
      <fieldset className="flex flex-col gap-2 border-t pt-3">
        <legend className="float-left type-section">Faixa permitida (opcional)</legend>
        <p className="type-meta">Um valor fora da faixa impede a etapa, como um “Não” numa verificação.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("min")}>Mínimo</Label>
            <NumberInput id={id("min")} value={item.min} decimals={item.decimals} unit={item.unit} negative={item.negative} invalid={bad} describedBy={bad ? id("bad") : undefined} onChange={(v) => onChange({ ...item, min: v })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("max")}>Máximo</Label>
            <NumberInput id={id("max")} value={item.max} decimals={item.decimals} unit={item.unit} negative={item.negative} invalid={bad} describedBy={bad ? id("bad") : undefined} onChange={(v) => onChange({ ...item, max: v })} />
          </div>
        </div>
        {bad && <p id={id("bad")} className={cn("type-meta", TONE_TEXT.stop)}>O mínimo é maior que o máximo.</p>}
      </fieldset>
    </>
  )
}

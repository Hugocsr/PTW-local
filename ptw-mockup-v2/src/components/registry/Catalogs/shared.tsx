import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { PlusIcon } from "lucide-react"
import type { ActiveFilter } from "@/core/catalogs"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { TONE_TEXT } from "@/components/shell/Status"
import { useSettledSave } from "../common"

/**
 * A name saved when typing stops or the field is left (Catálogos, SPEC 005): an empty, too long or
 * repeated value is flagged in words and not saved; leaving the field puts back the last saved value.
 */
export function SavedName({ value, onSave, problem, readOnly, label, className }: {
  value: string; onSave: (v: string) => void; problem: (v: string) => string | null; readOnly?: boolean; label: string; className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setDraft(value) }
  const errId = useId()
  const err = problem(draft)
  const save = useSettledSave((v) => { if (v !== value) onSave(v) })
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input value={draft} readOnly={readOnly} aria-label={label} aria-invalid={!!err} aria-describedby={err ? errId : undefined}
        className={cn("min-h-11 bg-background md:min-h-9", className)}
        onChange={(e) => { setDraft(e.target.value); if (!problem(e.target.value)) save.schedule(e.target.value.trim()); else save.cancel() }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { save.cancel(); setDraft(value); e.currentTarget.blur() } }}
        onBlur={() => { if (err) { save.cancel(); setDraft(value) } else save.flush() }} />
      {err && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)}>{err}</p>}
    </div>
  )
}

/** The same Ativo switch for every catalog item (types and list items). */
export function ActiveSwitch({ active, name, disabled, onChange }: { active: boolean; name: string; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 shrink-0 items-center gap-2 md:min-h-9">
      {onChange && <Switch checked={active} disabled={disabled} onCheckedChange={onChange} aria-label={`Ativo: ${name}`} />}
      <span className={cn("w-14 rounded-full px-2 py-0.5 text-center text-[0.6875rem] font-semibold", active ? "bg-st-ok-surface text-st-ok-fg" : "bg-st-neutral-surface text-st-neutral-fg")}>{active ? "Ativo" : "Inativo"}</span>
    </label>
  )
}

export function FilterSelect({ value, onChange }: { value: ActiveFilter; onChange: (v: ActiveFilter) => void }) {
  return (
    <select aria-label="Situação dos itens" value={value} onChange={(e) => onChange(e.target.value as ActiveFilter)} className="min-h-11 rounded-md border bg-background px-2 text-sm md:min-h-8">
      <option value="todos">Ativos e inativos</option><option value="ativos">Só ativos</option><option value="inativos">Só inativos</option>
    </select>
  )
}

/** "Novo …" + Adicionar at the end of a catalog; Enter adds. */
export function AddRow({ placeholder, problem, disabled, onAdd }: { placeholder: string; problem: (v: string) => string | null; disabled?: boolean; onAdd: (v: string) => Promise<boolean> }) {
  const [text, setText] = useState("")
  const err = text.trim() ? problem(text) : null
  const errId = useId()
  return (
    <form className="flex flex-col gap-1 border-t px-4 py-3 md:px-5" onSubmit={async (e) => { e.preventDefault(); const v = text.trim(); if (v && !err && !disabled && await onAdd(v)) setText("") }}>
      <div className="flex items-center gap-2">
        <Input value={text} readOnly={disabled} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} aria-invalid={!!err}
          aria-describedby={err ? errId : undefined} className="min-h-11 flex-1 md:min-h-9" />
        <Button type="submit" className="min-h-11 md:min-h-9" disabled={!text.trim() || !!err || disabled}><PlusIcon data-icon="inline-start" />Adicionar</Button>
      </div>
      {err && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)}>{err}</p>}
    </form>
  )
}

/** One catalog item row: media, name, usage, actions. `focus` (from the search) highlights and scrolls into view. */
export function ItemRow({ media, name, usage, actions, focus, muted }: { media: ReactNode; name: ReactNode; usage?: ReactNode; actions?: ReactNode; focus?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: "center" }) }, [focus])
  return (
    <li ref={ref} data-focus={focus || undefined} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 last:border-b-0 md:flex-nowrap md:px-5", focus && "bg-st-attention-surface", muted && "[&_input]:line-through [&_input]:text-muted-foreground")}>
      {media}
      <div className="min-w-0 flex-1 md:max-w-sm">{name}</div>
      <div className="min-w-0 type-meta max-md:basis-full max-md:pl-12 md:flex-1">{usage}</div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 max-md:ml-auto">{actions}</div>}
    </li>
  )
}

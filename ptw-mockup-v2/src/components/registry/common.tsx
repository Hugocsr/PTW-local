import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  CircleAlertIcon, CircleSlashIcon, InfoIcon, LockIcon, MinusIcon, NetworkIcon, PlusIcon, Trash2Icon, type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Origin, Status, TypeDef } from "@/registry/types"
import { TYPE_ICON_GROUPS, TYPE_ICON_LABEL, typeIconKey, type TypeIconKey } from "@/registry/typeIcons"
import { TYPE_ICON, assetIcon, locationIcon } from "@/components/shell/TypeIcon"
import { initials, useRegistry } from "@/registry/store"
import { byId } from "@/core/indexes"
import { usePermits } from "@/permit/store"
import { NAV, type ViewKey } from "@/components/shell/nav"
import { backTarget, goBack } from "@/components/work/nav"
import { permitName } from "@/core/permitFormat"
import { PageHeader as ShellPageHeader } from "@/components/shell/Page"
import { StatusBadge, TONE_TEXT } from "@/components/shell/Status"

/**
 * Saves a text field once the person stops typing (1,5 s) or leaves it, so one edit is one write and
 * one audit event, not one per key. `schedule(v)` waits; `flush()` saves now; `cancel()` drops it.
 * A pending value is saved when the field unmounts.
 */
export function useSettledSave(save: (v: string) => void, ms = 1500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])
  const flush = useCallback(() => {
    const v = pending.current
    cancel()
    if (v !== null) saveRef.current(v)
  }, [cancel])
  const schedule = useCallback((v: string) => {
    pending.current = v
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, ms)
  }, [flush, ms])
  useEffect(() => flush, [flush])
  return { schedule, flush, cancel }
}

/* ---------- exceptions only: nothing is shown for the normal case ---------- */

export function Flags({ origin, status, compact = false }: { origin: Origin; status: Status; compact?: boolean }) {
  const review = status === "em_revisao" || origin === "sugerida"
  if (compact) {
    return (
      <>
        {origin === "ad" && (
          <Tooltip>
            <TooltipTrigger asChild><NetworkIcon role="img" aria-label="Do diretório" className="size-3.5 shrink-0 text-muted-foreground" /></TooltipTrigger>
            <TooltipContent>Do diretório. Somente leitura.</TooltipContent>
          </Tooltip>
        )}
        {review && (
          /* Words, not a bare dot: a tooltip never opens on touch. */
          <span className={cn("inline-flex shrink-0 items-center gap-1 type-meta whitespace-nowrap", TONE_TEXT.attention)}>
            <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />{origin === "sugerida" ? "Sugerido" : "Revisar"}
          </span>
        )}
        {status === "inativo" && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 type-meta whitespace-nowrap", TONE_TEXT.neutral)}>
            <CircleSlashIcon className="size-3.5 shrink-0" aria-hidden />Inativo
          </span>
        )}
      </>
    )
  }
  return (
    <>
      {origin === "ad" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary"><NetworkIcon data-icon="inline-start" />AD</Badge>
          </TooltipTrigger>
          <TooltipContent>Sincronizado do diretório. Somente leitura aqui.</TooltipContent>
        </Tooltip>
      )}
      {origin === "csv" && <Badge variant="outline">CSV</Badge>}
      {review && <StatusBadge tone="attention" icon={CircleAlertIcon}>{origin === "sugerida" ? "Sugerido" : "Revisar"}</StatusBadge>}
      {status === "inativo" && <StatusBadge tone="neutral" icon={CircleSlashIcon}>Inativo</StatusBadge>}
    </>
  )
}

/* ---------- sections: the frame shows what can be done inside ---------- */

type Mode = "edit" | "locked"
type Tone = "box" | "well"

/**
 * A titled block of a detail (model B card, DESIGN.md): heading 14/600 with no icon. `icon` is accepted for old
 * callers and ignored. Page-level sections use `PageSection` from shell/Page instead.
 */
export function Section({
  title, mode = "edit", tone = "box", action, children, className,
}: { className?: string; title: string; icon?: LucideIcon; mode?: Mode; tone?: Tone; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn("overflow-hidden rounded-lg", className, tone === "well" ? (mode === "locked" ? "bg-surface-fixed" : "bg-surface-well") : "border", tone === "box" && mode === "locked" && "bg-muted/40")}>
      <header className={cn("flex min-h-11 flex-wrap items-center gap-2 px-3 py-1.5", tone === "box" && "border-b", tone === "box" && mode === "locked" && "bg-muted/60")}>
        <h3 className="type-section">{title}</h3>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
          {mode === "locked" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline"><LockIcon data-icon="inline-start" />Leitura</Badge>
              </TooltipTrigger>
              <TooltipContent>Vem do diretório. Edite lá.</TooltipContent>
            </Tooltip>
          )}
          {mode === "edit" && action}
        </div>
      </header>
      {children}
    </section>
  )
}

export function KV({ rows }: { rows: { k: string; v: ReactNode; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2.5 p-3 type-body">
      {rows.map((r) => (
        <div key={r.k} className="contents">
          <dt className="type-label">
            {r.hint ? (
              <Tooltip>
                <TooltipTrigger asChild><span className="inline-flex cursor-help items-center gap-1">{r.k}<InfoIcon className="size-3 text-muted-foreground" aria-hidden /></span></TooltipTrigger>
                <TooltipContent>Campo no AD: {r.hint}</TooltipContent>
              </Tooltip>
            ) : r.k}
          </dt>
          <dd className="min-w-0 break-words">{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- layout ---------- */

/** @deprecated Use `PageHeader` from `@/components/shell/Page` (actions as data, back link, meta). */
export function PageHeader({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="type-page whitespace-nowrap">{title}</h1>
      {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground", className)}><Icon className="size-5" /></div>
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

/* ---------- icons of location and asset types (chosen in Tipos; guessed from the name when not set) ---------- */

export { TYPE_ICON, assetIcon, locationIcon }

/** The type's icon as a button; opens a grid of icons. The line on top names the icon under the pointer or focus. */
export function TypeIconPicker({ type, family, disabled, onPick }: { type: TypeDef; family: "locationTypes" | "assetTypes"; disabled?: boolean; onPick: (key: TypeIconKey) => void }) {
  const current = typeIconKey(type, family)
  const [hover, setHover] = useState<TypeIconKey | null>(null)
  const Icon = TYPE_ICON[current]
  return (
    <Popover onOpenChange={() => setHover(null)}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="size-11 self-start md:size-9" disabled={disabled} aria-label={`Ícone de ${type.label}: ${TYPE_ICON_LABEL[current]}. Trocar`}>
          <Icon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-[min(28rem,70svh)] w-auto max-w-[calc(100vw-2rem)] flex-col p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="border-b px-3 py-2 type-label" aria-hidden>{type.label}: <span className="font-normal normal-case tracking-normal">{TYPE_ICON_LABEL[hover ?? current]}</span></p>
        <div className="flex flex-col gap-3 overflow-y-auto p-2" onPointerLeave={() => setHover(null)}>
          {TYPE_ICON_GROUPS.map((g) => (
            <div key={g.title} role="group" aria-label={g.title} className="flex flex-col gap-1">
              <span className="px-1 type-label">{g.title}</span>
              <div className="grid grid-cols-6 gap-1 md:grid-cols-8">
                {(Object.keys(g.icons) as TypeIconKey[]).map((k) => {
                  const G = TYPE_ICON[k]
                  return (
                    <Button key={k} type="button" variant={k === current ? "secondary" : "ghost"} size="icon" aria-pressed={k === current} aria-label={TYPE_ICON_LABEL[k]} title={TYPE_ICON_LABEL[k]}
                      className={cn("size-11 md:size-9", k === current && "ring-2 ring-ring")}
                      onPointerEnter={() => setHover(k)} onFocus={() => setHover(k)} onClick={() => onPick(k)}>
                      <G />
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** On narrow screens the detail sits below the list: scroll it into view when something is selected. */
export function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const reveal = () => {
    if (window.innerWidth < 1024) requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  return { ref, reveal }
}

/* ---------- shared controls: one way to do each thing ---------- */

/**
 * Removing something that holds content (a stage with sections, a section with items, a version, a
 * list) asks first, naming what goes with it. Loose items (a line, an option) are removed at once.
 */
export function ConfirmRemove({ what, detail, onConfirm, label = "Remover", iconOnly = true, disabled }: {
  what: string
  detail?: string
  onConfirm: () => void
  label?: string
  iconOnly?: boolean
  disabled?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {iconOnly
          ? <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`${label} ${what}`} disabled={disabled}><Trash2Icon /></Button>
          : <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={disabled}><Trash2Icon data-icon="inline-start" />{label}</Button>}
      </PopoverTrigger>
      <PopoverContent collisionPadding={16} className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <span className="type-body">{label} “{what}”?</span>
        {detail && <span className="type-meta">{detail}</span>}
        <Button variant="destructive" className="min-h-11 md:min-h-9" onClick={onConfirm}>{label}</Button>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Why something cannot be removed: a lock that opens its reason on tap or click (a tooltip never
 * opens on touch), so the reason reaches a phone too.
 */
export function LockedReason({ label, reason }: { label: string; reason: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground md:size-9" aria-label={label}><LockIcon /></Button>
      </PopoverTrigger>
      <PopoverContent collisionPadding={16} className="w-64 max-w-[calc(100vw-2rem)] type-body">{reason}</PopoverContent>
    </Popover>
  )
}

/** A switch with a fixed label on its right, full touch height: the label is the tall target. */
export function ToggleField({ label, checked, onChange, disabled, small }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; small?: boolean }) {
  const id = useId()
  return (
    <Label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-center gap-2 font-normal md:min-h-9", disabled && "cursor-not-allowed opacity-50")}>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <span className={cn(small && "type-meta")}>{label}</span>
    </Label>
  )
}

/** A number with − and +, its label always visible. */
export function Stepper({ label, value, min = 1, max, onChange, suffix = "" }: { label: string; value: number; min?: number; max?: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-3 md:min-h-9">
      <span className="type-field">{label}</span>
      <div className="flex items-center rounded-md border border-input" role="group" aria-label={label}>
        <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Menos: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}><MinusIcon /></Button>
        <span className="min-w-8 text-center type-body tabular-nums">{value}{suffix}</span>
        <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Mais: ${label}`} disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)}><PlusIcon /></Button>
      </div>
    </div>
  )
}

/** One style for "pick one of a few" toggles everywhere (forms, filters, Parar reasons). */
export const TOGGLE_ON = "data-[state=on]:border-foreground/70 data-[state=on]:bg-surface-well data-[state=on]:text-foreground data-[state=on]:font-semibold data-[state=on]:shadow-xs"

/**
 * Header of a detail view: optional icon or avatar, title, one supporting line and badges, stacked
 * in one column. `page` is the screen's own title (PT, template version); `item` is a record shown
 * beside its list (Ativos, Locais, Pessoas). `mono` sets the title as a code (asset tag).
 * @deprecated for pages: use `PageHeader` from `@/components/shell/Page`.
 */
export function DetailHeader({ title, media, meta, badges, size = "item", mono }: {
  title: ReactNode; media?: ReactNode; meta?: ReactNode; badges?: ReactNode; size?: "page" | "item"; mono?: boolean
}) {
  // A page title is the page's h1: hand it to the shared header (badges join the meta line, DESIGN.md).
  if (size === "page" && !media) return <ShellPageHeader title={title} mono={mono} meta={meta || badges ? <>{meta}{badges}</> : undefined} />
  const cls = mono ? "type-data-title" : size === "page" ? "type-page" : "type-title"
  return (
    <div className="flex items-start gap-3">
      {media}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className={cn(cls, "break-words")}>{title}</h2>
        {meta && <div className="type-meta">{meta}</div>}
        {badges && <div className="flex flex-wrap items-center gap-1.5">{badges}</div>}
      </div>
    </div>
  )
}

/**
 * Back link of a record page (Ativos, Locais): "← <where it was opened from>" and a "Voltar" that never
 * leaves the app (work/nav.ts). Opened from a link or a reload, it goes to `fallback`.
 */
export function useRecordBack(fallback: "ativos" | "locais" | "pessoas") {
  const { state } = useRegistry()
  const { permits } = usePermits()
  const [head, id] = backTarget(fallback).split("/")
  let text: string = NAV[fallback].title
  if (head === "ativos" && id) text = byId(state.assets, id)?.code ?? text
  else if (head === "locais" && id) text = byId(state.locations, id)?.name ?? text
  else if (head === "pessoas" && id) text = byId(state.people, id)?.name ?? text
  else if (head === "pt" && id) { const p = byId(permits, id); text = p ? permitName(p) : "PT" }
  else if (head in NAV) text = NAV[head as ViewKey].title
  return { label: text, onClick: () => goBack(fallback) }
}

/** A type name with its icon (record pages). */
export function TypeLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <span className="inline-flex items-center gap-2"><Icon className="size-4 text-muted-foreground" aria-hidden />{text}</span>
}

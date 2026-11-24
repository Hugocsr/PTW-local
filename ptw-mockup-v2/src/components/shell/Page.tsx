import { useId, useRef, useState, type ReactNode } from "react"
import { ArrowLeftIcon, EllipsisIcon, SearchIcon, XIcon, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/*
 * The page frame (DESIGN.md · Layout). Every screen renders exactly one `Page`; nothing else sets a
 * page max-width. Rhythm (DESIGN.md): back → title 8, title → meta 4, header → tabs/toolbar 16,
 * toolbar → content 12, section → section 32, side-by-side columns 24.
 */

/** Button height rule (DESIGN.md): 44 px below md, 36 px above. */
const H = "h-11 md:h-9"

/** The one frame: 72rem, left-aligned beside the sidebar (never centered); children stack 16 apart (header → tabs/toolbar). */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("app-page flex w-full min-w-0 max-w-[72rem] flex-col gap-5", className)}>{children}</div>
}

/**
 * Narrow content inside the frame, always on the title's left edge (never centered on its own).
 * `form` = 40rem (forms, ≈65ch), `list` = 48rem (trees and simple lists).
 */
export function Narrow({ size = "form", children, className }: { size?: "form" | "list"; children: ReactNode; className?: string }) {
  return <div className={cn("flex w-full min-w-0 flex-col gap-4", size === "form" ? "max-w-[40rem]" : "max-w-[48rem]", className)}>{children}</div>
}

/* ---------- header ---------- */

export interface PageAction {
  /** Verb + object, the same wherever this action appears ("Nova versão"). */
  label: string
  onClick?: () => void
  /** Renders a link instead of a button. */
  href?: string
  icon?: LucideIcon
  disabled?: boolean
  /** Red text; never allowed as `primary`. */
  destructive?: boolean
  /**
   * Menu items only: ask before running `onClick` (things with content, DESIGN.md). `what` is the name of the
   * thing; `detail` says what goes with it.
   */
  confirm?: { what: string; detail?: string }
}

export interface PageActions {
  /** The one filled button of the header, rightmost. */
  primary?: PageAction
  /** Up to 2 outline buttons left of the primary; below md they move into the "⋯" menu. */
  secondary?: PageAction[]
  /** Everything else (Renomear, Remover…), behind "⋯". */
  menu?: PageAction[]
}

/** A primary of at most two words stays on the title row on a phone; a longer one gets its own row (DESIGN.md). */
const short = (label: string) => label.trim().split(/\s+/).length <= 2

function ActionButton({ a, variant, className }: { a: PageAction; variant: "default" | "outline"; className?: string }) {
  const Icon = a.icon
  const body = <>{Icon && <Icon data-icon="inline-start" />}{a.label}</>
  const cls = cn(H, a.destructive && "text-destructive-text", className)
  if (a.href) return <Button asChild variant={variant} className={cls}><a href={a.href} aria-disabled={a.disabled || undefined}>{body}</a></Button>
  return <Button variant={variant} className={cls} disabled={a.disabled} onClick={a.onClick}>{body}</Button>
}

function MoreMenu({ secondary, menu }: { secondary: PageAction[]; menu: PageAction[] }) {
  const [ask, setAsk] = useState<PageAction | null>(null)
  const asking = useRef(false)
  const run = (a: PageAction) => {
    if (a.href) { window.location.assign(a.href); return }
    // Open after the menu has closed: opening in the same click lets the closing menu dismiss it.
    if (a.confirm) { asking.current = true; setTimeout(() => setAsk(a), 0); return }
    a.onClick?.()
  }
  const item = (a: PageAction, cls?: string) => {
    const Icon = a.icon
    return (
      <DropdownMenuItem key={a.label} className={cn("min-h-11 md:min-h-9", cls)} disabled={a.disabled} variant={a.destructive ? "destructive" : "default"} onSelect={() => run(a)}>
        {Icon && <Icon />}{a.label}
      </DropdownMenuItem>
    )
  }
  return (
    <Popover open={!!ask} onOpenChange={(o) => { if (!o) setAsk(null) }}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            {/* Only secondaries in it: the menu exists below md only. */}
            <Button variant="outline" size="icon" aria-label="Mais ações" className={cn("size-11 md:size-9", menu.length === 0 && "md:hidden")}><EllipsisIcon /></Button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent align="end" className="min-w-48"
          onCloseAutoFocus={(e) => { if (asking.current) { e.preventDefault(); asking.current = false } }}>
          {secondary.map((a) => item(a, "md:hidden"))}
          {secondary.length > 0 && menu.length > 0 && <DropdownMenuSeparator className="md:hidden" />}
          {menu.map((a) => item(a))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent align="end" collisionPadding={16} onFocusOutside={(e) => e.preventDefault()} className="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {ask?.confirm && (
          <>
            <span className="type-body">{ask.label} “{ask.confirm.what}”?</span>
            {ask.confirm.detail && <span className="type-meta">{ask.confirm.detail}</span>}
            <Button variant={ask.destructive ? "destructive" : "default"} className="min-h-11 md:min-h-9" onClick={() => { const a = ask; setAsk(null); a.onClick?.() }}>{ask.label}</Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface PageHeaderProps {
  /** Detail pages only: "← <real parent name>", never just "Voltar". */
  back?: { label: string; href?: string; onClick?: () => void }
  /** The page's only h1 (22/600). Never an input. */
  title: ReactNode
  /** Collection total, list screens only (grey badge). */
  count?: number
  /** One muted line; a Estado/Situação badge goes here, not on its own line. */
  meta?: ReactNode
  actions?: PageActions
  /** Monospaced title, for codes only (asset tag). */
  mono?: boolean
}

/** Page header (DESIGN.md): back link, h1 + count, actions on the right, one meta line. */
export function PageHeader({ back, title, count, meta, actions, mono }: PageHeaderProps) {
  const primary = actions?.primary
  const secondary = (actions?.secondary ?? []).slice(0, 2)
  const menu = actions?.menu ?? []
  // Phone: the primary shares the title row only when both are short; a long title keeps the row to itself.
  const inline = primary ? short(primary.label) && (typeof title !== "string" || title.length <= 20) : true
  // A long origin name (e.g. a model title) truncates instead of widening the page.
  const backBody = <><ArrowLeftIcon data-icon="inline-start" /><span className="min-w-0 truncate">{back?.label}</span></>
  const backCls = "-ml-2 w-fit max-w-full min-h-11 px-2 text-muted-foreground hover:text-foreground md:min-h-9 print:hidden"
  return (
    <header className="app-page-header flex min-w-0 flex-col gap-2">
      {back && (back.href
        ? <Button asChild variant="ghost" className={backCls}><a href={back.href}>{backBody}</a></Button>
        : <Button variant="ghost" className={backCls} onClick={back.onClick}>{backBody}</Button>)}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 md:min-h-9">
            <h1 className={cn(mono ? "type-data-title" : "type-page", "min-w-0 break-words")}>{title}</h1>
            {count !== undefined && <Badge variant="secondary">{count}</Badge>}
          </div>
          {(primary || secondary.length > 0 || menu.length > 0) && (
            <div className="flex shrink-0 items-center gap-2 print:hidden">
              {secondary.map((a) => <ActionButton key={a.label} a={a} variant="outline" className="max-md:hidden" />)}
              {(secondary.length > 0 || menu.length > 0) && <MoreMenu secondary={secondary} menu={menu} />}
              {primary && <ActionButton a={primary} variant="default" className={cn(!inline && "max-md:hidden")} />}
            </div>
          )}
        </div>
        {meta && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 type-meta">{meta}</div>}
      </div>
      {primary && !inline && <ActionButton a={primary} variant="default" className="w-full md:hidden" />}
    </header>
  )
}

/* ---------- sections ---------- */

/**
 * A section of the page (DESIGN.md): h2 15/600, no icon, no card; optional ghost "+ Item" on the right.
 * Consecutive PageSections inside a gap-4 column (Page, Narrow, SidePanel main) end up 32 apart.
 */
export function PageSection({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn("page-section flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-h-11 items-center gap-2 md:min-h-9">
        <h2 id={id} className="type-heading">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/** Label/value rows (DESIGN.md): 7rem muted 12/500 labels, 8 px between rows. */
export function PropertyList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("doc-block grid-cols-1 sm:grid-cols-2", className)}>
      {items.map((r) => (
        <div key={r.label} className="doc-cell flex flex-col gap-1">
          <dt className="type-label">{r.label}</dt>
          <dd className="min-w-0 break-words type-body">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- record layout (model C) ---------- */

/**
 * Model C body: `children` (tabs) on the left, a 20rem panel on the right from xl, sticky.
 * Below xl the `actions` block comes first, above the content; `properties` show only from xl, so
 * the caller also renders the same facts in the content (e.g. the Resumo tab) with `className="xl:hidden"`.
 */
export function SidePanel({ label, actions, properties, children }: {
  /** Accessible name of the panel, e.g. "Estado e ações da PT". */
  label: string
  /** Order: state → next person → primary → secondaries (DESIGN.md). */
  actions?: ReactNode
  /** Usually a PropertyList; hidden below xl. */
  properties?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
      {(actions || properties) && (
        <aside aria-label={label} className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 shadow-elev-2 xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1">
          {actions}
          {properties && <div className={cn("hidden xl:block", actions && "border-t pt-4")}>{properties}</div>}
        </aside>
      )}
      <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">{children}</div>
    </div>
  )
}

/* ---------- list toolbar (DESIGN.md) ---------- */

export interface ListToolbarProps {
  search: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }
  /** Segmented ToggleGroup (≤ 4 options) or a Select (more). */
  filters?: ReactNode
  /** Any search text or filter active: shows "N de M" and "Limpar filtros". */
  filtering?: boolean
  onClear?: () => void
  /** Rows shown, collection total, and the noun as [singular, plural]. */
  count: { shown: number; total: number; noun: [string, string] }
  /** The table/list below; sits 12 px under the toolbar. */
  children?: ReactNode
  /** Many filters (more than one group): they get their own row under search and total, instead of squeezing between them. */
  filtersBelow?: boolean
}

/** Search (20rem) · filters · "N de M <noun>" on the right; stacked on narrow containers. */
export function ListToolbar({ search, filters, filtering, onClear, count, children, filtersBelow }: ListToolbarProps) {
  const { shown, total, noun } = count
  const word = total === 1 ? noun[0] : noun[1]
  return (
    <div className="app-list-panel @container flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-center">
        <div className="relative @3xl:w-80 @3xl:shrink-0">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search.value} onChange={(e) => search.onChange(e.target.value)} aria-label={search.label} placeholder={search.placeholder ?? "Buscar"} className="px-8 max-md:h-11" />
          {search.value && (
            <Button variant="ghost" size="icon" aria-label="Limpar busca" className="absolute top-1/2 right-0 size-11 -translate-y-1/2 md:size-9" onClick={() => search.onChange("")}><XIcon /></Button>
          )}
        </div>
        {filters && !filtersBelow && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
        {filtering && onClear && !filtersBelow && <Button variant="ghost" className={cn(H, "w-fit")} onClick={onClear}>Limpar filtros</Button>}
        <p role="status" aria-live="polite" className="type-meta whitespace-nowrap @3xl:ml-auto">
          {/* A default filter (Quadro opens on "Em andamento") also hides rows: say so. */}
          {filtering || shown !== total ? `${shown} de ${total} ${word}` : `${total} ${word}`}
        </p>
      </div>
      {filtersBelow && filters && (
        <div className="flex min-w-0 flex-col gap-2 @3xl:flex-row @3xl:flex-wrap @3xl:items-center">
          {filters}
          {filtering && onClear && <Button variant="ghost" className={cn(H, "w-fit")} onClick={onClear}>Limpar filtros</Button>}
        </div>
      )}
      {children}
    </div>
  )
}

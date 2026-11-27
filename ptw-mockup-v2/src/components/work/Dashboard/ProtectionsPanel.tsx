import { useMemo, useState } from "react"
import { ArrowUpRightIcon, ChevronDownIcon, CircleAlertIcon, CircleCheckIcon, ClockIcon, InboxIcon, ShieldAlertIcon, ShieldCheckIcon, ShieldIcon, ShieldOffIcon, type LucideIcon } from "lucide-react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { bypassFacts, bypassGroup } from "@/core/bypass"
import type { BoardRow } from "@/core/board"
import { initialOpenGroups, PROTECTION_GROUPS, type ProtectionGroup } from "@/core/dashboard"
import { fmtWindow } from "@/core/permitFormat"
import { windowLeft } from "@/core/permitView"
import { usePermitBoard } from "@/data/hooks"
import type { ListView } from "@/data/port"
import { cn } from "@/lib/utils"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { WindowMeter } from "@/components/signal/WindowMeter"
import { TONE_SOLID, TONE_TEXT } from "../../shell/Status"
import { PermitStateBadge } from "../state"
import { ACCENT, EmptyBox, Panel, Tile, type Accent } from "./shared"

/** Open PTs of models that do not hold the equipment (interlock / safety-device disabling). */
const VIEW: ListView = { q: "", filters: { segment: "andamento" }, sort: { id: "windowStart", dir: "asc" }, page: 0, pageSize: 100, answers: true }

const GROUP: Record<ProtectionGroup, { title: string; accent: Accent; icon: LucideIcon; emptyIcon: LucideIcon; empty: string }> = {
  vigor: { title: "Desabilitados agora", accent: "stop", icon: ShieldOffIcon, emptyIcon: ShieldIcon, empty: "Nenhuma proteção desabilitada." },
  reabilitar: { title: "A reabilitar", accent: "attention", icon: ShieldCheckIcon, emptyIcon: CircleCheckIcon, empty: "Nenhuma proteção aguardando reabilitação." },
  aprovacao: { title: "Aguardando aprovação", accent: "approval", icon: ClockIcon, emptyIcon: InboxIcon, empty: "Nenhuma solicitação aguardando aprovação." },
}
const groupId = (g: ProtectionGroup) => `dash-prot-${g}`

/**
 * Painel "Desabilitados agora" (SPEC 001 · 5.2): three counters (↗ opens and scrolls to the group) and
 * "Detalhamento das proteções", one collapsible group each. Read-only; a row opens its PT.
 */
export function ProtectionsPanel() {
  const sim = useSim()
  const board = usePermitBoard(VIEW)
  const [open, setOpen] = useState(initialOpenGroups)
  const groups = useMemo(() => {
    const by: Record<ProtectionGroup, BoardRow[]> = { vigor: [], reabilitar: [], aprovacao: [] }
    for (const r of board.items) { const g = bypassGroup(r.p, r.ver.holdsEquipment); if (g) by[g].push(r) }
    return by
  }, [board.items])
  const total = groups.vigor.length + groups.reabilitar.length + groups.aprovacao.length
  const focus = (g: ProtectionGroup) => {
    setOpen((o) => ({ ...o, [g]: true }))
    requestAnimationFrame(() => document.getElementById(groupId(g))?.scrollIntoView({ block: "start", behavior: "smooth" }))
  }
  const count = (n: number) => (board.loading ? "–" : sim.serverDown && !board.items.length ? "—" : n)

  return (
    <Panel id="dash-protecoes" icon={ShieldAlertIcon} title="Desabilitados agora" sub="Acompanhe o status das proteções desabilitadas e pendências">
      {board.error && <p role="alert" className={cn("rounded-md border border-st-stop-border bg-st-stop-surface px-3 py-2 type-body", TONE_TEXT.stop)}>Não foi possível carregar: {board.error.message}</p>}
      <ul className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumo das proteções">
        {PROTECTION_GROUPS.map((g) => (
          <li key={g} className="min-w-0">
            <button type="button" onClick={() => focus(g)} aria-label={`${GROUP[g].title}: ${board.loading ? "carregando" : groups[g].length}. Ver no detalhamento`}
              className="group flex h-full min-h-24 w-full min-w-0 flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:border-ring/50 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-32 sm:gap-3 sm:p-4">
              <span className="flex items-start justify-between gap-2">
                <Tile icon={GROUP[g].icon} accent={GROUP[g].accent} className="max-sm:size-8 max-sm:[&_svg]:size-4" />
                <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
              </span>
              <span className={cn("text-2xl leading-none font-bold tabular-nums sm:text-3xl", groups[g].length > 0 ? ACCENT[GROUP[g].accent].text : "text-foreground")}>{count(groups[g].length)}</span>
              <span className="type-meta leading-tight text-foreground/80 sm:type-body">{GROUP[g].title}</span>
            </button>
          </li>
        ))}
      </ul>

      <section aria-labelledby="dash-det-h" className="flex min-w-0 flex-col overflow-hidden rounded-lg border">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h3 id="dash-det-h" className="type-section">Detalhamento das proteções</h3>
          <span className="type-meta tabular-nums">{board.loading ? "Carregando…" : `${total} ${total === 1 ? "registro" : "registros"}`}</span>
        </header>
        {PROTECTION_GROUPS.map((g) => (
          <Collapsible key={g} open={open[g]} onOpenChange={(v) => setOpen((o) => ({ ...o, [g]: v }))} className="border-b last:border-b-0">
            <h4 id={groupId(g)} className="scroll-mt-20">
              <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                {(() => { const Icon = GROUP[g].icon; return <Icon className={cn("size-5 shrink-0", ACCENT[GROUP[g].accent].text)} aria-hidden /> })()}
                <span className="min-w-0 flex-1 type-body font-semibold">{GROUP[g].title}</span>
                <span className={cn("min-w-9 rounded-full px-2.5 py-0.5 text-center type-meta font-semibold tabular-nums", ACCENT[GROUP[g].accent].pill)}>{board.loading ? "–" : groups[g].length}</span>
                <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open[g] && "rotate-180")} aria-hidden />
              </CollapsibleTrigger>
            </h4>
            <CollapsibleContent className="px-3 pb-3">
              {board.loading ? <p className="px-1 py-3 type-meta">Carregando…</p>
                : groups[g].length === 0 ? <EmptyBox icon={GROUP[g].emptyIcon} text={GROUP[g].empty} />
                : <ul className="flex flex-col overflow-hidden rounded-md border">{groups[g].map((r) => <ProtectionRow key={r.p.id} row={r} group={g} />)}</ul>}
            </CollapsibleContent>
          </Collapsible>
        ))}
        {board.items.length >= (VIEW.pageSize ?? 100) && <p className="border-t px-4 py-2 type-meta">Primeiras {VIEW.pageSize} PTs em andamento. Veja todas em Solicitações de PT.</p>}
      </section>
    </Panel>
  )
}

/** One PT of a group: service, number and assets · facts (tag, classe, OS), state and next · time left and window. */
function ProtectionRow({ row: r, group }: { row: BoardRow; group: ProtectionGroup }) {
  const sim = useSim()
  const { state } = useRegistry()
  const { formOf } = usePermits()
  const facts = bypassFacts(formOf(r.p, r.ver), r.p.answers, state.optionLists)
  const w = group === "vigor" ? windowLeft(r.p, sim.now) : null
  const over = w?.tone === "stop"
  const tone = over ? "stop" : group === "vigor" ? "stop" : group === "reabilitar" ? "attention" : "neutral"
  return (
    <li className="relative border-b bg-card last:border-b-0">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[tone])} />
      <a href={`#pt/${r.p.id}/etapas`} className="grid gap-x-6 gap-y-2 py-3 pr-3 pl-4 transition-colors hover:bg-surface-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem] xl:items-center">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="type-section break-words">{r.p.scope}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 type-data text-muted-foreground"><span>{r.p.number}</span>{r.p.assetIds.map((id) => <span key={id} className="flex items-center gap-1 text-foreground"><AssetIcon id={id} className="size-3.5" />{state.assets.find((a) => a.id === id)?.code}</span>)}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {facts.map((f) => <span key={f.label} title={f.label} className="type-body break-words">{f.value}</span>)}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta"><PermitStateBadge state={r.p.state} />{r.next !== "—" && <span>{r.next}</span>}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          {group === "vigor" && <WindowMeter permit={r.p} now={sim.now} size="card" />}
          {over && <span className={cn("flex items-center gap-1 type-meta font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="size-3.5" aria-hidden />Prazo vencido: reabilite</span>}
          <span className="type-data text-muted-foreground">{fmtWindow(r.p)}</span>
        </span>
      </a>
    </li>
  )
}

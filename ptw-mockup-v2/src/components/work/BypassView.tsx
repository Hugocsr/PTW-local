import { useMemo } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { CircleAlertIcon, ClipboardCheckIcon, HourglassIcon, ShieldOffIcon, type LucideIcon } from "lucide-react"
import { bypassFacts, bypassGroup, type BypassGroup } from "@/core/bypass"
import type { BoardRow } from "@/core/board"
import { windowLeft } from "@/core/permitView"
import { usePermitBoard } from "@/data/hooks"
import type { ListView } from "@/data/port"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { cn } from "@/lib/utils"
import { Page, PageHeader } from "../shell/Page"
import { TONE_SOLID, TONE_TEXT, type StatusTone } from "../shell/Status"
import { WindowMeter } from "../signal/WindowMeter"
import { fmtWindow } from "@/core/permitFormat"
import { DownBanner, PermitStateBadge } from "./state"

const VIEW: ListView = { q: "", filters: { segment: "andamento" }, sort: { id: "windowStart", dir: "asc" }, page: 0, pageSize: 100, answers: true }

const GROUPS: { key: BypassGroup; title: string; tone: StatusTone; icon: LucideIcon; empty: string }[] = [
  { key: "vigor", title: "Desabilitados agora", tone: "stop", icon: ShieldOffIcon, empty: "Nenhuma proteção desabilitada." },
  { key: "reabilitar", title: "A reabilitar", tone: "attention", icon: ClipboardCheckIcon, empty: "Nada a reabilitar." },
  { key: "aprovacao", title: "Aguardando aprovação", tone: "neutral", icon: HourglassIcon, empty: "Nenhum pedido aguardando." },
]

/**
 * Desabilitados agora (`#desabilitados`): the open permits of models that do not hold the equipment
 * (disabling an interlock or a safety device): what is disabled right now and until when, what
 * still has to be put back, what waits for approval. Read-only; a row opens its PT.
 */
export function BypassView() {
  const sim = useSim()
  const { state } = useRegistry()
  const { formOf } = usePermits()
  const board = usePermitBoard(VIEW)
  const groups = useMemo(() => {
    const by: Record<BypassGroup, BoardRow[]> = { vigor: [], reabilitar: [], aprovacao: [] }
    for (const r of board.items) { const g = bypassGroup(r.p, r.ver.holdsEquipment); if (g) by[g].push(r) }
    return by
  }, [board.items])
  const total = groups.vigor.length + groups.reabilitar.length + groups.aprovacao.length
  const asset = (id: string) => state.assets.find((a) => a.id === id)
  return (
    <Page>
      <PageHeader title="Desabilitados agora" count={board.loading ? undefined : total} />
      {sim.serverDown && <DownBanner now={sim.now} />}
      {board.error && <p role="alert" className={cn("type-body", TONE_TEXT.stop)}>Não foi possível carregar: {board.error.message}</p>}

      <dl className="doc-block grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.key} className="doc-cell flex flex-col gap-1">
            <dt className="type-label">{g.title}</dt>
            <dd className={cn("text-4xl leading-none font-bold tabular-nums", groups[g.key].length > 0 && g.tone !== "neutral" ? TONE_TEXT[g.tone] : "text-foreground")}>{board.loading ? "–" : groups[g.key].length}</dd>
          </div>
        ))}
      </dl>

      {GROUPS.map((g) => (
        <section key={g.key} className="mt-4 flex min-w-0 flex-col" aria-labelledby={`bp-${g.key}`}>
          <h2 id={`bp-${g.key}`} className="flex items-center gap-2 border-b-2 border-foreground pb-2 type-heading">
            <g.icon className={cn("size-4 shrink-0", TONE_TEXT[g.tone])} aria-hidden />{g.title}
            <span className="type-meta tabular-nums">{groups[g.key].length}</span>
          </h2>
          {groups[g.key].length === 0 ? <p className="py-4 type-meta">{board.loading ? "Carregando…" : g.empty}</p> : (
            <ul className="flex flex-col">
              {groups[g.key].map((r) => {
                const facts = bypassFacts(formOf(r.p, r.ver), r.p.answers, state.optionLists)
                const w = g.key === "vigor" ? windowLeft(r.p, sim.now) : null
                const over = w?.tone === "stop"
                return (
                  <li key={r.p.id} className="relative border-b border-border">
                    <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", TONE_SOLID[over ? "stop" : g.tone])} />
                    <a href={`#pt/${r.p.id}/etapas`} className="grid gap-x-6 gap-y-2 py-3 pr-2 pl-4 transition-colors hover:bg-surface-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15rem] xl:items-center">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="type-section break-words">{r.p.scope}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 type-data text-muted-foreground"><span>{r.p.number}</span>{r.p.assetIds.map((id) => <span key={id} className="flex items-center gap-1 text-foreground"><AssetIcon id={id} className="size-3.5" />{asset(id)?.code}</span>)}</span>
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        {facts.map((f) => <span key={f.label} title={f.label} className="type-body break-words">{f.value}</span>)}
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta"><PermitStateBadge state={r.p.state} />{r.next !== "—" && <span>{r.next}</span>}</span>
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        {g.key === "vigor" ? <WindowMeter permit={r.p} now={sim.now} size="card" /> : null}
                        {over && <span className={cn("flex items-center gap-1 type-meta font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="size-3.5" aria-hidden />Prazo vencido: reabilite</span>}
                        <span className="type-data text-muted-foreground">{fmtWindow(r.p)}</span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </Page>
  )
}

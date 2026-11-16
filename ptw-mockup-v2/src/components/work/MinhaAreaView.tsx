import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AssetIcon, LocationIcon } from "@/components/shell/TypeIcon"
import { PlusIcon, CircleAlertIcon, ClockIcon, EyeOffIcon, HourglassIcon, OctagonXIcon, PauseIcon, PenLineIcon, PlayIcon, ShieldCheckIcon, TimerOffIcon, TriangleAlertIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { mustActCount, waitingList, type WaitingItem, type WorkItem } from "@/core/myWork"
import { workRelease } from "@/core/permitView"
import { personalNotices, rolesView } from "@/core/rolesView"
import { canStop, needsResume } from "@/core/stopResume"
import { byId } from "@/core/indexes"
import { cn } from "@/lib/utils"
import { Page, PageHeader } from "../shell/Page"
import type { Permit } from "@/permit/types"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { AssinarDialog } from "./AssinarDialog"
import { CargosView } from "./CargosView"
import { minutesToEnd, permitName } from "@/core/permitFormat"
import { MiniRail } from "@/components/signal/MiniRail"
import { WindowMeter } from "@/components/signal/WindowMeter"
import { navigate, openPermit } from "./nav"
import { HolderText } from "./HolderText"
import { ResumeDialog } from "./ResumeDialog"
import { DownBanner } from "./state"
import { TONE_BLOCK, TONE_SOLID, TONE_TEXT, type StatusTone } from "../shell/Status"
import { StopSheet } from "./StopSheet"
import { useMyWork } from "./useMyWork"

const DOWN_ID = "ma-down"
/** Cards per column before "Mostrar mais": a person with thousands of PTs still gets a quick board. */
const STEP = 30

/**
 * Minha área is a board of my open PTs, one column per "who moves next", in the order work flows:
 * - Sua vez: the flow is stopped waiting for me; one button with the act. Its count is the sidebar
 *   badge (`mustActCount`).
 * - Aguardando: still open, someone else moves first (or my part is blocked, or my turn comes later).
 * - Em campo: work under a PT of mine is happening: live state (only EstadoAutorizacao says "Trabalho
 *   liberado"), time left, Parar one tap away, Entregar for whoever hands back.
 * Below lg the columns stack; Em campo comes first (safety before paperwork). From lg: three columns side by side; if they do not
 * fit, the board scrolls sideways inside itself, never the page. Finished PTs are in Quadro de PTs.
 * Model D (Trabalho do dia): header (h1; "Seus cargos e conta" in its "⋯", not in the primary's place),
 * then server and cargo notices, then the board. Nothing below it. `#minha-area/pts` lands on Aguardando.
 */
export function MinhaAreaView({ tab }: { tab?: string }) {
  if (tab === "eu") return <CargosView />
  return <Painel scrollTo={tab === "pts" ? "ma-aguardando" : undefined} />
}

function Painel({ scrollTo }: { scrollTo?: string }) {
  const sim = useSim()
  const work = useMyWork()
  const [signId, setSignId] = useState<string | null>(null)
  const [stopId, setStopId] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  useEffect(() => { if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ block: "start", inline: "start" }) }, [scrollTo])

  const { me } = useMyRoles()
  const cargosAction = me ? { label: "Seus cargos e conta", icon: ShieldCheckIcon, onClick: () => navigate("minha-area/eu") } : undefined
  const waiting = useMemo(() => waitingList(work), [work])
  const act = (it: WorkItem) => (it.act === "retomar" ? setResumeId(it.permitId) : it.fill ? openPermit(it.permitId, "etapas") : setSignId(it.permitId))
  const [limits, setLimits] = useState<Record<string, number>>({})
  const shown = <T,>(id: string, items: T[]) => items.slice(0, limits[id] ?? STEP)
  const more = (id: string, total: number): More | undefined => {
    const n = limits[id] ?? STEP
    return total > n ? { shown: n, total, onMore: () => setLimits((l) => ({ ...l, [id]: n + STEP })) } : undefined
  }

  return (
    <Page>
      {/* Everything that is not a PT sits above the board: the header (with the way to my cargos in its
          "⋯"), then what the server or my cargos stop. Nothing goes below the board. */}
      <PageHeader title="Minha área" actions={{ primary: { label: "Nova PT", icon: PlusIcon, onClick: () => navigate("nova-pt"), disabled: sim.serverDown }, menu: cargosAction ? [cargosAction] : [] }} />
      {sim.serverDown && <DownBanner id={DOWN_ID} now={sim.now} note="Assinar, entregar e retomar voltam com o servidor. Parar continua disponível." />}
      <Bloqueios />
      <CargoAvisos />

      <div className="relative flex flex-col gap-8 lg:-mx-1 lg:gap-6 lg:flex-row lg:items-start lg:overflow-x-auto lg:px-1 lg:pb-2" role="region" aria-label="Quadro das suas PTs">
        <Column id="ma-vez" title="Sua vez" icon={PenLineIcon} tone="pending" count={mustActCount(work)} strong empty="Nada esperando por você." more={more("ma-vez", work.agir.length)}>
          {shown("ma-vez", work.agir).map((it) => <li key={it.permitId}><ActCard item={it} onAct={act} /></li>)}
        </Column>
        <Column id="ma-aguardando" title="Aguardando" icon={HourglassIcon} tone="neutral" count={waiting.length} empty="Nenhuma PT esperando outra pessoa." more={more("ma-aguardando", waiting.length)}>
          {shown("ma-aguardando", waiting).map((it) => <li key={it.permitId}><WaitCard item={it} /></li>)}
        </Column>
        <Column id="ma-campo" title="Em campo" icon={PlayIcon} tone="ok" count={work.emCampo.length} empty="Nenhuma PT sua em campo agora." className="max-lg:order-first" more={more("ma-campo", work.emCampo.length)}>
          {shown("ma-campo", work.emCampo).map((it) => <li key={it.permitId}><FieldCard item={it} onStop={setStopId} onAct={act} /></li>)}
        </Column>
      </div>

      <AssinarDialog permitId={signId} onClose={() => setSignId(null)} />
      <StopSheet permitId={stopId} onClose={() => setStopId(null)} />
      <ResumeDialog permitId={resumeId} onClose={() => setResumeId(null)} />
    </Page>
  )
}

/**
 * One board column: heading with its tone's icon and its count, then its cards. Only "Sua vez" gets the
 * filled count (pending), like the sidebar badge.
 */
interface More { shown: number; total: number; onMore: () => void }
function Column({ id, title, icon: Icon, tone, count, strong = false, empty, className, more, children }: { id: string; title: string; icon: LucideIcon; tone: StatusTone; count: number; strong?: boolean; empty: string; className?: string; more?: More; children: ReactNode[] }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}
      className={cn("flex scroll-mt-4 flex-col gap-3 rounded-2xl bg-surface-canvas p-3 lg:min-w-52 lg:flex-1", className)}>
      <h2 id={`${id}-h`} className="flex min-h-9 items-center gap-2 px-1 type-heading">
        <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border", TONE_TEXT[tone])}><Icon className="size-4" /></span>
        {title}
        {count > 0 && (strong
          ? <span className={cn("rounded-full px-2 type-label text-background tabular-nums", TONE_SOLID[tone])}>{count}</span>
          : <span className="type-meta tabular-nums">{count}</span>)}
      </h2>
      {children.length > 0
        ? <ul className="flex flex-col gap-2">{children}</ul>
        : <p className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-input/50 px-4 text-center type-meta">{empty}</p>}
      {/* Long columns show the first cards; the rest come in steps, so the board stays quick. */}
      {more && (
        <Button variant="outline" className="min-h-11 w-full md:min-h-9" onClick={more.onMore}>
          Mostrar mais {Math.min(STEP, more.total - more.shown)}
          <span className="type-meta tabular-nums">· {more.shown} de {more.total}</span>
        </Button>
      )}
    </section>
  )
}

/**
 * Every card has the same three zones, always in this order, so cards scan like rows of one table:
 * 1. Identity: ID on the left, "Etapa n/total" on the right (where the PT is in its flow), then the
 *    description (the link to the PT, covering the whole card).
 * 2. Where: Local and Ativo, labels in a fixed column.
 * 3. Action: a footer band apart from the facts; its buttons sit above the card-wide link.
 */
function Card({ item, facts, tone, label, quiet = false, children }: { item: WorkItem; facts: Facts; tone: StatusTone; label?: string; quiet?: boolean; children: ReactNode }) {
  const { permit, local, ativo } = facts
  const title = permit.scope || permitName(permit)
  const { n, total } = item.progress
  return (
    <article className={cn("relative flex flex-col overflow-hidden rounded-lg border hover:border-ring/50", "bg-card")} aria-label={label ?? title}>
      {/* The card's tone as a 3 px bar on its left edge; the words are in the action line. */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 z-20 w-[3px]", TONE_SOLID[tone])} />
      <div className="flex flex-col gap-3 p-3 pl-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 type-meta tabular-nums">
            <span className="min-w-0 truncate">{permit.number ? permitName(permit) : "Rascunho"}</span>
            <MiniRail className="shrink-0" rail={{ n, total, statuses: Array.from({ length: total }, (_, i) => (i < n - 1 ? "feita" : i === n - 1 ? "atual" : "futura")) }} />
          </div>
          <button type="button" onClick={() => openPermit(permit.id)}
            className="card-link text-left type-section max-md:-my-3 max-md:py-3 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ring">
            {title}
          </button>
        </div>
        <dl className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 type-body">
          <dt className="pt-0.5"><LocationIcon id={permit.locationId} /><span className="sr-only">Local</span></dt><dd className="min-w-0">{local}</dd>
          <dt className="pt-0.5"><AssetIcon id={permit.assetIds[0]} /><span className="sr-only">Ativo</span></dt><dd className="min-w-0">{ativo}</dd>
        </dl>
      </div>
      {/* Above the card-wide link so its buttons get the tap, not the card. */}
      <div className={cn("relative z-10 flex flex-col gap-2 border-t p-3 pl-4", !quiet && "bg-muted/40")}>{children}</div>
    </article>
  )
}

/** The status line of the action: icon + words in the card's tone; the line under it stays quiet unless it is a stop. */
function Status({ head, sub, tone, icon: Icon, quiet = false }: { quiet?: boolean; head: string; sub?: ReactNode; tone: StatusTone; icon: LucideIcon }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className={cn("flex items-start gap-1.5", quiet ? "type-meta" : "type-body font-medium", TONE_TEXT[tone])}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />{head}
      </p>
      {sub && <div className={cn("pl-5.5 type-meta", tone === "stop" && TONE_TEXT.stop)}>{sub}</div>}
    </div>
  )
}

interface Facts { permit: Permit; local: string; ativo: string }

function usePermitFacts(permitId: string): Facts {
  const { state } = useRegistry()
  const { permits } = usePermits()
  const permit = byId(permits, permitId)!
  const local = byId(state.locations, permit.locationId)?.name ?? permit.locationId
  const assets = permit.assetIds.map((id) => byId(state.assets, id)).filter((a) => !!a)
  const first = assets[0] ? `${assets[0].code} · ${assets[0].name}` : "—"
  return { permit, local, ativo: assets.length > 1 ? `${first} +${assets.length - 1}` : first }
}

/** Sua vez: the available action is the button (same text as on the PT), with the note when the PT came back. */
function ActCard({ item, onAct }: { item: WorkItem; onAct: (it: WorkItem) => void }) {
  const sim = useSim()
  const facts = usePermitFacts(item.permitId)
  return (
    <Card item={item} facts={facts} tone="pending">
      {item.reasons.length > 0 && <Status tone="pending" icon={PenLineIcon} head={item.reasons.join(" · ")} />}
      <Button className="h-auto min-h-11 w-full whitespace-normal md:min-h-9" disabled={sim.serverDown} aria-describedby={sim.serverDown ? DOWN_ID : undefined} onClick={() => onAct(item)}>{item.cta}</Button>
    </Card>
  )
}

/** Aguardando: nothing to do yet, so the action line says why: blocked (red, with the reason), my turn later, or who is next. */
function WaitCard({ item }: { item: WaitingItem }) {
  const facts = usePermitFacts(item.permitId)
  const join = (parts: string[]) => parts.filter(Boolean).join(" · ")
  return (
    <Card item={item} facts={facts} tone={item.kind === "bloqueada" ? "stop" : "neutral"} quiet={item.kind !== "bloqueada"}>
      {item.kind === "bloqueada" ? <Status tone="stop" icon={CircleAlertIcon} head={item.holders?.length ? "Envio bloqueado: equipamento com outra PT aberta" : "Sua parte está bloqueada"} sub={<HolderText text={join(item.reasons)} holders={item.holders} />} />
        : item.kind === "depois" ? <Status tone="neutral" icon={ClockIcon} head={`Sua vez depois: ${item.label}`} sub={join(item.reasons)} />
        : <Status tone="neutral" icon={HourglassIcon} head={item.label} quiet />}
    </Card>
  )
}

/**
 * Em campo: the action line is one plain status (Em execução and the time left, or what stops it), then Parar one tap away (same rule as on the PT); Entregar for whoever hands
 * the area back, the main button once the window is over.
 */
function FieldCard({ item, onStop, onAct }: { item: WorkItem; onStop: (id: string) => void; onAct: (it: WorkItem) => void }) {
  const sim = useSim()
  const { state } = useRegistry()
  const facts = usePermitFacts(item.permitId)
  const { permit } = facts
  const me = byId(state.people, sim.personId)
  const stoppable = !!me && canStop(permit, me, sim.now).ok && !needsResume(permit)
  const remaining = minutesToEnd(permit, sim.now)
  const release = workRelease(permit, sim.now)
  const over = !sim.serverDown && !release.released && release.why === "janela_encerrada"
  // A plain line, not the authorization block: that one, with "Trabalho liberado", lives on the PT.
  // Green only while the work runs; red when stopped or the window is over; amber without the server.
  const tone: StatusTone = sim.serverDown ? "attention" : permit.holdReason !== null || over || permit.state === "suspensa" ? "stop" : "ok"
  const status = sim.serverDown ? <Status tone={tone} icon={EyeOffIcon} head="Sem confirmação do servidor" sub="Se há trabalho em andamento, pare e avise a área." />
    : permit.holdReason !== null ? <Status tone={tone} icon={PauseIcon} head="Parada registrada" sub="Aguarda Retomada." />
    : over ? <Status tone={tone} icon={TimerOffIcon} head="Janela encerrada" sub="Pare o trabalho e entregue a área." />
    : permit.state === "suspensa" ? <Status tone={tone} icon={PauseIcon} head="Suspensa · retomada feita" sub="Aguarda o novo Aceite no campo. Trabalho não liberado." />
    : <Status tone={tone} icon={PlayIcon} head="Em execução" sub={permit.state === "ativa" && remaining > 0 ? <WindowMeter permit={permit} now={sim.now} size="card" className="mt-1" /> : undefined} />
  const entregar = item.act === "entregar"
  return (
    <Card item={item} facts={facts} tone={tone}>
      {status}
      {stoppable && <Button variant={release.released ? "stop" : "outline"} className={cn("min-h-11 w-full", !release.released && "border-destructive/40 text-destructive-text hover:bg-st-stop-surface hover:text-destructive-text")} onClick={() => onStop(permit.id)}><OctagonXIcon data-icon="inline-start" />Parar</Button>}
      {entregar && <Button variant={over ? "default" : "outline"} className="min-h-11 w-full md:min-h-9" disabled={sim.serverDown} aria-describedby={sim.serverDown ? DOWN_ID : undefined} onClick={() => onAct(item)}>{item.cta}</Button>}
    </Card>
  )
}

/** What stops me from signing at all (cargo vencido, cadastro em revisão, conta expirada): above everything. */
function Bloqueios() {
  const { state } = useRegistry()
  const sim = useSim()
  const me = state.people.find((p) => p.id === sim.personId)
  const notices = useMemo(() => {
    if (!me || sim.serverDown) return []
    return personalNotices(me, rolesView(me, state.templates, sim.today), sim.today, (id) => label(state.roleTypes, id), sim.now).filter((n) => n.severity === "bloqueia")
  }, [me, state.templates, state.roleTypes, sim.today, sim.now, sim.serverDown])
  if (notices.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", TONE_BLOCK.stop)} role="status">
      {notices.map((n) => (
        <p key={n.id} className="flex items-start gap-2 type-body"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="sr-only">Bloqueia: </span>{n.text}</span></p>
      ))}
      <Button variant="outline" className="min-h-11 w-full sm:w-fit md:min-h-9" onClick={() => navigate("minha-area/eu")}>Ver seus cargos</Button>
    </div>
  )
}

function useMyRoles() {
  const { state } = useRegistry()
  const sim = useSim()
  const me = state.people.find((p) => p.id === sim.personId)
  const roles = useMemo(() => (me ? rolesView(me, state.templates, sim.today) : []), [me, state.templates, sim.today])
  return { me, roles }
}

/** A cargo about to expire: one line above the board, not a block (it does not stop me yet). */
function CargoAvisos() {
  const { state } = useRegistry()
  const sim = useSim()
  const { me, roles } = useMyRoles()
  if (!me || sim.serverDown) return null
  const avisos = personalNotices(me, roles, sim.today, (id) => label(state.roleTypes, id), sim.now).filter((n) => n.severity === "aviso")
  if (avisos.length === 0) return null
  return (
    <div className="flex flex-col gap-1" role="status">
      {avisos.map((n) => <p key={n.id} className={cn("flex items-start gap-2 type-body", TONE_TEXT.attention)}><TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{n.text}</p>)}
    </div>
  )
}

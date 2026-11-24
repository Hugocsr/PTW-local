import type { ReactNode } from "react"
import { AssetIcon, LocationIcon } from "@/components/shell/TypeIcon"
import { CircleAlertIcon, ClockIcon, EyeOffIcon, HourglassIcon, OctagonXIcon, PauseIcon, PenLineIcon, PlayIcon, TimerOffIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { WaitingItem, WorkItem } from "@/core/myWork"
import { workRelease } from "@/core/permitView"
import { canStop, needsResume } from "@/core/stopResume"
import { byId } from "@/core/indexes"
import { minutesToEnd, permitName } from "@/core/permitFormat"
import { cn } from "@/lib/utils"
import type { Permit } from "@/permit/types"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { MiniRail } from "@/components/signal/MiniRail"
import { WindowMeter } from "@/components/signal/WindowMeter"
import { TONE_SOLID, TONE_TEXT, type StatusTone } from "../../shell/Status"
import { HolderText } from "../HolderText"
import { openPermit } from "../nav"

/** Id of the server-down banner the disabled buttons point to (aria-describedby). */
export const DOWN_ID = "dash-down"

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
    <article className={cn("relative flex flex-col overflow-hidden rounded-xl border shadow-elev-2 transition-colors hover:border-ring/50", "bg-card")} aria-label={label ?? title}>
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
export function ActCard({ item, onAct }: { item: WorkItem; onAct: (it: WorkItem) => void }) {
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
export function WaitCard({ item }: { item: WaitingItem }) {
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
export function FieldCard({ item, onStop, onAct }: { item: WorkItem; onStop: (id: string) => void; onAct: (it: WorkItem) => void }) {
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


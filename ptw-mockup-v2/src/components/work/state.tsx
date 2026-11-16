import type { ReactNode } from "react"
import {
  BanIcon, CheckCircle2Icon, ClipboardCheckIcon, EyeOffIcon, FileCheckIcon, HourglassIcon, PauseIcon, PencilLineIcon, PlayIcon, TimerOffIcon, Undo2Icon, type LucideIcon,
} from "lucide-react"
import { PERMIT_STATE_LABEL, type PermitState } from "@/core/permitState"
import { PERMIT_STATE_TONE, workRelease } from "@/core/permitView"
import { cn } from "@/lib/utils"
import type { Permit } from "@/permit/types"
import { dayOf, dmHms, hms } from "@/core/time"
import { StatusBadge, TONE_BLOCK, type StatusTone } from "@/components/shell/Status"
import { WindowMeter } from "@/components/signal/WindowMeter"

const ICON: Record<PermitState, LucideIcon> = {
  rascunho: PencilLineIcon, em_analise: HourglassIcon, devolvida: Undo2Icon, emitida: FileCheckIcon, ativa: PlayIcon,
  suspensa: PauseIcon, entregue: ClipboardCheckIcon, encerrada: CheckCircle2Icon, cancelada: BanIcon, expirada: TimerOffIcon,
}

/** The state's icon alone, for cards whose title already sits beside it (the word is in the chips or the column). */
export function PermitStateIcon({ state, className }: { state: PermitState; className?: string }) {
  const Icon = ICON[state]
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />
}

/** Icon + word, never colour alone. Shows "Não verificável" instead when the server is not confirming. */
export function PermitStateBadge({ state, unverifiable = false, className }: { state: PermitState; unverifiable?: boolean; className?: string }) {
  const Icon = unverifiable ? EyeOffIcon : ICON[state]
  return (
    <StatusBadge tone={unverifiable ? "neutral" : PERMIT_STATE_TONE[state]} icon={Icon} className={className}>
      {unverifiable ? "Não verificável" : PERMIT_STATE_LABEL[state]}
    </StatusBadge>
  )
}

export { PERMIT_STATE_TONE }

/** PT state → the authorization block's tone: the state's own tone, except ativa, green only while released (below). */
const COPY: Record<PermitState, { title: string; sub: (p: Permit) => string }> = {
  rascunho: { title: "Rascunho", sub: (): string => "Ainda não enviada." },
  em_analise: { title: "Em análise", sub: () => "Aguardando assinaturas." },
  devolvida: { title: "Devolvida", sub: (p) => (p.note ? `Devolvida: ${p.note}` : "Devolvida ao solicitante.") },
  emitida: { title: "Emitida", sub: () => "Aguardando o aceite no campo." },
  ativa: { title: "Trabalho liberado", sub: (p) => `Aceite no campo na r${p.revision} · janela até ${dayOf(p.windowStart) === dayOf(p.windowEnd) ? hms(p.windowEnd) : dmHms(p.windowEnd)}` },
  suspensa: { title: "Suspensa", sub: (p) => (p.resumedReason ? `Retomada: ${p.resumedReason}. Aguarda novo aceite no campo.` : "Trabalho parado.") },
  entregue: { title: "Entregue à área", sub: () => "Aguardando o aceite da área." },
  encerrada: { title: "Encerrada", sub: () => "Ciclo concluído." },
  cancelada: { title: "Cancelada", sub: (p) => p.note ?? "Cancelada com motivo." },
  expirada: { title: "Expirada", sub: (p) => `${p.note ? p.note.replace(/[^.!?]$/, "$&.") : "A janela terminou."} Entregue a área para liberar o equipamento.` },
}


/**
 * The only place that may write "Trabalho liberado", and only when `workRelease` (core) says the work
 * is released now: ativa, no stop waiting, window still open at `now`. Every other case says the work
 * is not released; with no server confirmation it says "Não verificável" and never shows the last green.
 */
/** `subline` (compact only) replaces the line under the title while the PT is ativa, e.g. the time left. */
export function EstadoAutorizacao({ permit, serverDown, now, extra, compact = false, subline }: { permit: Permit; serverDown: boolean; now: string; extra?: ReactNode; compact?: boolean; subline?: string }) {
  const c = COPY[permit.state]
  const release = workRelease(permit, now)
  // A stop given while the permit was not ativa keeps the state but blocks the next acceptance.
  const held = !serverDown && permit.holdReason !== null
  // Ativa on paper but the window is over: the field must stop and hand over, never read green.
  const over = !serverDown && !held && !release.released && release.why === "janela_encerrada"
  // Ativa before its window opens (never by the rules, but never green either).
  const early = !serverDown && !held && !release.released && release.why === "antes_da_janela"
  // No server: grey, never the last known colour. Stopped or window over: red.
  const tone: StatusTone = serverDown ? "neutral" : held || over ? "stop" : PERMIT_STATE_TONE[permit.state]
  const Icon = serverDown ? EyeOffIcon : held ? PauseIcon : over ? TimerOffIcon : ICON[permit.state]
  const title = serverDown ? "Não verificável" : held ? "Parada registrada" : over ? "Janela encerrada" : early ? "Aguardando a janela" : c.title
  const sub = serverDown
    ? compact ? "Sem confirmação do servidor. Se há trabalho em andamento, pare e avise a área." : "Sem confirmação do servidor. Não inicie nem continue o trabalho."
    : held ? `${permit.holdReason}, às ${hms(permit.holdAt ?? now)}. Aguarda Retomada.`
    : over ? `A janela terminou às ${hms(permit.windowEnd)}. Pare o trabalho e entregue a área.`
    : early ? `A janela começa às ${hms(permit.windowStart)}.`
    : compact && permit.state === "ativa" ? subline ?? `Aceite no campo na r${permit.revision}` : c.sub(permit)
  const released = !serverDown && release.released
  // On the PT page this block is the only place the state appears: when the title says something else
  // ("Parada registrada", "Trabalho liberado", "Janela encerrada"), the state's own word goes on the last line.
  const stateWord = !compact && !serverDown && !title.startsWith(PERMIT_STATE_LABEL[permit.state]) ? `Estado: ${PERMIT_STATE_LABEL[permit.state]}` : null
  const last = [stateWord, !released && !(serverDown && compact) ? "Trabalho não liberado." : null].filter(Boolean).join(" · ")
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border", compact ? "p-3" : "p-4", TONE_BLOCK[tone])} role="status">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className={compact ? "type-section" : "type-title"}>{title}</span>
      </div>
      <span className="type-body text-foreground">{sub}</span>
      {last && <span className="type-meta text-foreground">{last}</span>}
      {released && !compact && <WindowMeter permit={permit} now={now} className="mt-2" />}
      {serverDown && !compact && <span className="type-meta text-foreground">Último estado conhecido: {PERMIT_STATE_LABEL[permit.state]}. Isto não é liberação.</span>}
      {extra}
    </div>
  )
}

/** The permit's name, or its scope while it has no number (drafts are told apart by what they are for). */
export function PermitTitle({ permit }: { permit: Permit }) {
  return permit.number
    ? <span className="font-medium">{permit.number} <span className="type-meta font-normal">r{permit.revision}</span></span>
    : <span className="min-w-0 font-medium">{permit.scope || "PT sem número"}</span>
}

/** The line screens that save (records, configuration) add under the banner: nothing is saved without the server. */
export const DOWN_SAVE_NOTE = "Nada pode ser salvo até o servidor voltar."

/**
 * One status block for "the server is not confirming": the same on every screen that shows derived facts.
 * `note` adds one line below (screens that save pass `DOWN_SAVE_NOTE`); `id` lets disabled actions point
 * to it with aria-describedby.
 */
export function DownBanner({ now, note, id }: { now: string; note?: string; id?: string }) {
  return (
    <div id={id} className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border p-3", TONE_BLOCK.attention)} role="status">
      <EyeOffIcon className="size-5 shrink-0" aria-hidden />
      <span className="type-section">Sem servidor</span>
      <span className="type-meta">Cópia de {hms(now)}</span>
      {note && <span className="w-full type-meta">{note}</span>}
    </div>
  )
}

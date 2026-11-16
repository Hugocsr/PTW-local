import { useState, type ReactNode } from "react"
import { StatusBadge, TONE_BLOCK, TONE_SOLID, type StatusTone } from "../shell/Status"
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, CircleIcon, CircleSlashIcon, LockIcon, MinusCircleIcon, PenLineIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { sectionStatus, type FormAnswers, type ItemAnswer } from "@/core/form"
import { joinWhens } from "@/core/formLayout"
import type { FormSection, Stage } from "@/registry/types"
import { FormAnswersView, FormFill, FormSectionHeader, useFormContext } from "../registry/FormFill"

/** `pulada`: left unsigned because the area is being handed back (core `handBackStage`). */
export type StageCardStatus = "feita" | "atual" | "futura" | "pulada"
/** What still stops a stage: its sections done, answers missing, answers that block it. */
export type StageGate = { done: boolean; missing: string[]; blocked: string[] }

/**
 * One stage of a permit, the same card everywhere a permit is filled in: the PT's Etapas tab and
 * the template's Testar. "Preencher" shows the stage's sections (editable when it is the viewer's
 * turn, read-only once done, only titles before it arrives); "Assinar" shows who signs. The footer
 * receives what still stops the stage so each screen puts its own button there; `signatures` may
 * take it too when the signing itself depends on the form (Testar).
 */
export function StageCard({ n, stage, stages, sections, answers, status, turn, editing, actor, onAnswer, notice, signatures, footer }: {
  n: number
  stage: Stage
  stages: Stage[]
  sections: FormSection[]
  answers: FormAnswers
  status: StageCardStatus
  /** Text of the turn badge ("Sua vez", "Em teste"); undefined when it is not the viewer's turn. */
  turn?: string
  editing: boolean
  actor: { id: string; now: string }
  onAnswer: (itemId: string, a: ItemAnswer | null) => void
  /** A line above the form while editing (e.g. no server). */
  notice?: ReactNode
  signatures: ReactNode | ((gate: StageGate) => ReactNode)
  footer?: (gate: StageGate) => ReactNode
}) {
  const ctx = useFormContext()
  const states = sections.map((s) => sectionStatus(s, answers, ctx))
  const gate: StageGate = { done: states.every((x) => x.done), missing: states.flatMap((x) => x.missing), blocked: states.flatMap((x) => x.blocked) }
  const form = { sections }
  // One tone per stage (DESIGN.md · Cor de estado): done = ok, current = pending, an answer that
  // blocks it = stop, not reached yet = neutral. Bar, marker and badge all take it.
  const blocked = status === "atual" && gate.blocked.length > 0
  const tone: StatusTone = blocked ? "stop" : status === "feita" ? "ok" : status === "atual" ? "pending" : "neutral"
  return (
    // Level 1 of the form grammar (DESIGN.md · Itens de formulário): the stage is the card. The one
    // being filled is white with a dark outline; the others sit back on the canvas tone.
    <li id={turn ? "pf-mine" : undefined} aria-labelledby={`pf-${stage.id}`}
      className={cn("@container relative flex scroll-mt-20 flex-col overflow-hidden rounded-2xl",
        status === "futura" ? "gap-2 px-4 py-3 sm:px-5" : "gap-6 border bg-background p-4 sm:p-6",
        turn && (blocked ? "border-st-stop-border shadow-lg shadow-black/5 ring-4 ring-st-stop-surface" : "border-st-pending-border shadow-lg shadow-black/5 ring-4 ring-st-pending-surface"))}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full type-meta font-medium tabular-nums",
          tone === "neutral" ? cn("border", TONE_BLOCK.neutral) : cn("text-background", TONE_SOLID[tone]))} aria-hidden>
          {status === "feita" ? <CheckIcon className="size-4" /> : n}
        </span>
        <h3 id={`pf-${stage.id}`} className={status === "futura" ? "type-section text-muted-foreground" : "type-title"}>{stage.name}</h3>
        {blocked ? <StatusBadge tone="stop" icon={CircleAlertIcon}>{turn ? `${turn} · bloqueada` : "Bloqueada"}</StatusBadge>
          : turn ? <StatusBadge tone="pending" icon={PenLineIcon}>{turn}</StatusBadge>
          : status === "feita" ? <StatusBadge tone="ok" icon={LockIcon}>Concluída</StatusBadge>
          : status === "atual" ? <StatusBadge tone="pending" icon={CircleIcon}>Em andamento</StatusBadge>
          : status === "pulada" ? <StatusBadge tone="neutral" icon={CircleSlashIcon}>Não feita</StatusBadge>
          : null}
      </div>

      {editing ? (
        // The stage being filled: the full width of the card, then who signs (a section like the others), then the button.
        <>
          {sections.length > 0 && (
            <div className="flex min-w-0 flex-col gap-6">
              {notice}
              <FormFill form={form} stages={stages} stageId={stage.id} answers={answers} actor={actor} onChange={onAnswer} />
            </div>
          )}
          <section className="flex min-w-0 flex-col gap-4" aria-labelledby={`pf-${stage.id}-sig`}>
            {sections.length > 0 && <FormSectionHeader id={`pf-${stage.id}-sig`} title="Assinaturas" />}
            {typeof signatures === "function" ? signatures(gate) : signatures}
          </section>
        </>
      ) : (
      // Not reached yet: one quiet line per section and who will sign, no headers (nothing to read yet).
      status === "futura" ? (
      <div className="flex flex-col gap-1.5 pl-10 opacity-80">
        {sections.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 type-meta" aria-label="Formulário">
            {sections.map((s) => <li key={s.id}>{s.title} · {s.items.length} {s.items.length === 1 ? "pergunta" : "perguntas"}</li>)}
          </ul>
        )}
        <div className="min-w-0" aria-label="Assinaturas">{typeof signatures === "function" ? signatures(gate) : signatures}</div>
      </div>
      ) : (
      // Read-only (done or waiting): the answers beside who signs, when wide enough.
      <div className={cn("grid gap-8", sections.length > 0 && "@2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,19rem)] @2xl:items-start @2xl:gap-10")}>
      {sections.length > 0 && (
        <div className="min-w-0"><FormAnswersView form={form} stages={stages} answers={answers} showStage={false} /></div>
      )}

      <section className="flex min-w-0 flex-col gap-4" aria-labelledby={`pf-${stage.id}-sig`}>
        {sections.length > 0 && <FormSectionHeader id={`pf-${stage.id}-sig`} title="Assinaturas" />}
        {typeof signatures === "function" ? signatures(gate) : signatures}
      </section>
      </div>
      ))}

      {/* The card's action footer (DESIGN.md): apart from the facts by a line. */}
      {footer && <div className="border-t pt-4">{footer(gate)}</div>}
    </li>
  )
}

/**
 * A conditional signature the answers do not require: nobody waits for it, so it reads muted (grey,
 * with a word and an icon, never colour alone) with the answer that would require it.
 */
export function NotRequired({ when }: { when: string }) {
  return <span className="flex items-center gap-1.5 type-meta text-muted-foreground"><MinusCircleIcon className="size-3.5 shrink-0" aria-hidden />Não exigida · {when}</span>
}

/**
 * Several conditional signatures the answers do not require, folded into one muted line ("4
 * assinaturas não exigidas · só para Classe 4, Classe 3, Classe 2 ou Classe 1"); their names stay
 * one tap away.
 */
export function NotRequiredGroup({ slots }: { slots: { meaning: string; when: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1 type-meta text-muted-foreground">
      <button type="button" className="-mx-1 flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 text-left hover:bg-muted md:min-h-8" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MinusCircleIcon className="size-3.5 shrink-0" aria-hidden />
        <span>{slots.length} assinaturas não exigidas · {joinWhens(slots.map((s) => s.when).filter(Boolean))}</span>
        <ChevronDownIcon className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <ul className="flex flex-col gap-0.5 pl-5">{slots.map((s, i) => <li key={i}>{s.meaning} · {s.when}</li>)}</ul>}
    </div>
  )
}

import { useMemo, useState } from "react"
import { CircleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EXTENSION_REASON_MAX, planExtend } from "@/core/extension"
import { maxWindowText } from "@/core/windowLimit"
import { usePermitActs } from "@/data/hooks"
import { addMinutes, instant, wallOf } from "@/core/time"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { DateInput } from "../registry/DateInput"
import { TimeInput } from "../registry/TimeInput"
import { fmtWindow as windowText, permitName } from "@/core/permitFormat"
import { TONE_TEXT } from "../shell/Status"
import { cn } from "@/lib/utils"
import { useActFeedback } from "./useActFeedback"
import { ActFeedback } from "./ActFeedback"
import { PermitActDialog } from "./PermitActDialog"

/**
 * Prorrogar: whoever may issue the permit moves the end of its window later, with a justification,
 * while it is emitida or ativa and the window has not ended; within the model's longest window
 * (counted from the original start). A bottom sheet on a phone, a centered dialog elsewhere.
 */
export function ExtendDialog({ permitId, onClose }: { permitId: string | null; onClose: () => void }) {
  return permitId ? <Form key={permitId} permitId={permitId} onClose={onClose} /> : null
}

function Form({ permitId, onClose }: { permitId: string; onClose: () => void }) {
  const { state } = useRegistry()
  const store = usePermits()
  const sim = useSim()
  const permit = store.permits.find((p) => p.id === permitId)
  const ver = state.templates.find((t) => t.id === permit?.templateId)?.versions.find((v) => v.id === permit?.versionId)
  const me = state.people.find((p) => p.id === sim.personId)
  const end = permit ? wallOf(permit.windowEnd) : ""
  // The new end starts on the current end's day; the time is typed.
  const [day, setDay] = useState<string | undefined>(end.slice(0, 10) || undefined)
  const [time, setTime] = useState<string | undefined>(undefined)
  const [reason, setReason] = useState("")
  const [dayProblem, setDayProblem] = useState<string | null>(null)
  const [timeProblem, setTimeProblem] = useState<string | null>(null)
  const acts = usePermitActs()
  const feedback = useActFeedback()
  const newEnd = day && time && !dayProblem && !timeProblem ? instant(`${day}T${time}:00`) : undefined

  const plan = useMemo(() => {
    if (!permit || !ver || !me) return null
    return planExtend({ permit, ver, signer: me, people: state.people, locations: state.locations, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, timezone: state.units[0]?.timezone, serverDown: sim.serverDown, ...(newEnd || reason ? { newEnd, reason } : {}) })
  }, [permit, ver, me, state, sim.now, sim.today, sim.serverDown, newEnd, reason])

  if (!permit || !ver || !me || !plan) return <PermitActDialog busy={feedback.busy} onClose={onClose}><DialogHeader><DialogTitle>PT não encontrada</DialogTitle></DialogHeader></PermitActDialog>

  const failures = plan.checks.filter((c) => !c.ok && c.id !== "entrada")
  const limit = ver.maxWindowHours
  const latest = limit != null ? addMinutes(permit.revalidation?.originalStart ?? permit.windowStart, limit * 60) : null
  const can = failures.length === 0 && !!newEnd && reason.trim().length > 0 && plan.ok
  const why = failures[0]?.text
    ?? dayProblem ?? timeProblem
    ?? (!newEnd ? "Informe a data e a hora do novo fim"
      : plan.checks.find((c) => c.id === "entrada" && !c.ok) ? "O novo fim precisa ser depois do fim atual"
        : !reason.trim() ? "Escreva a justificativa" : null)

  const extend = async () => {
    if (!can || !newEnd || feedback.busy) return
    if (!await feedback.run(() => acts.extend({ permitId, personId: me.id, newEnd, reason: reason.trim() }))) return
    toast.success("Janela prorrogada", { description: `${permitName(permit)} · até ${wallOf(newEnd).slice(8, 10)}/${wallOf(newEnd).slice(5, 7)} ${wallOf(newEnd).slice(11, 16)}` })
    onClose()
  }

  return (
    <PermitActDialog busy={feedback.busy} onClose={onClose}>
      <DialogHeader className="pr-10">
        <DialogTitle>Prorrogar · {permitName(permit)}</DialogTitle>
        <DialogDescription>Janela atual: {windowText(permit)}{limit != null ? ` · prazo máximo deste modelo: ${maxWindowText(limit)}` : ""}</DialogDescription>
      </DialogHeader>

      {failures.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Verificações que falharam">
          {failures.map((c) => (
            <li key={c.id} className={cn("flex items-start gap-2 type-body", TONE_TEXT.stop)}>
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span><span className="sr-only">Falha: </span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      <fieldset disabled={feedback.busy} className="flex flex-col gap-1.5">
        <legend className="mb-1.5 type-field">Novo fim</legend>
        <div className="flex flex-wrap items-start gap-2">
          <DateInput id="extend-day" label="Data do novo fim" value={day} onChange={setDay} onProblem={setDayProblem} today={sim.today} />
          <TimeInput id="extend-time" label="Hora do novo fim" value={time} onChange={setTime} onProblem={setTimeProblem} seconds={false} />
        </div>
        {latest && <p className="type-meta">No máximo até {wallOf(latest).slice(8, 10)}/{wallOf(latest).slice(5, 7)} {wallOf(latest).slice(11, 16)}.</p>}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="extend-reason">Justificativa</Label>
        <Textarea id="extend-reason" disabled={feedback.busy} value={reason} maxLength={EXTENSION_REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder="Por que o trabalho precisa de mais tempo" className="min-h-20" />
      </div>

      {/* Footer (DESIGN.md): what is missing, then Cancelar · Prorrogar on the right; stacked on a phone, primary on top. */}
      <div className="flex flex-col gap-3">
        <ActFeedback {...feedback} />
        {why && <p id="extend-help" className="type-meta">{why}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse md:flex-row md:items-center md:justify-end">
          <Button variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={feedback.busy} onClick={onClose}>Cancelar</Button>
          <Button className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={!can || feedback.busy} aria-describedby={why ? "extend-help" : undefined} onClick={() => void extend()}>{feedback.busy ? "Prorrogando…" : "Prorrogar"}</Button>
        </DialogFooter>
      </div>
    </PermitActDialog>
  )
}

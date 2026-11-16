import { useMemo, useState } from "react"
import { CheckIcon, CircleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { planResume } from "@/core/stopResume"
import { usePermitActs } from "@/data/hooks"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { permitName } from "@/core/permitFormat"
import { TONE_TEXT } from "../shell/Status"
import { cn } from "@/lib/utils"
import { useActFeedback } from "./useActFeedback"
import { ActFeedback } from "./ActFeedback"
import { PermitActDialog } from "./PermitActDialog"

/**
 * Retomar is a recorded decision by whoever may issue the permit: a reason, then the button.
 * It never lets work start by itself: a suspensa permit then waits for a new Aceite no campo.
 * A bottom sheet on a phone, a centered dialog elsewhere.
 */
export function ResumeDialog({ permitId, onClose }: { permitId: string | null; onClose: () => void }) {
  return permitId ? <Form key={permitId} permitId={permitId} onClose={onClose} /> : null
}

function Form({ permitId, onClose }: { permitId: string; onClose: () => void }) {
  const { state } = useRegistry()
  const store = usePermits()
  const sim = useSim()
  const [reason, setReason] = useState("")
  const acts = usePermitActs()
  const feedback = useActFeedback()

  const permit = store.permits.find((p) => p.id === permitId)
  const ver = state.templates.find((t) => t.id === permit?.templateId)?.versions.find((v) => v.id === permit?.versionId)
  const me = state.people.find((p) => p.id === sim.personId)
  const plan = useMemo(() => {
    if (!permit || !ver || !me) return null
    return planResume({ permit, ver, signer: me, people: state.people, locations: state.locations, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, serverDown: sim.serverDown })
  }, [permit, ver, me, state, sim.now, sim.today, sim.serverDown])

  if (!permit || !ver || !me || !plan) return <PermitActDialog busy={feedback.busy} onClose={onClose}><DialogHeader><DialogTitle>PT não encontrada</DialogTitle></DialogHeader></PermitActDialog>

  const failures = plan.checks.filter((c) => !c.ok)
  const canResume = failures.length === 0 && reason.trim().length > 0
  const why = failures[0]?.text ?? (!reason.trim() ? "Escreva o motivo da retomada" : null)

  const resume = async () => {
    if (!canResume || feedback.busy) return
    if (!await feedback.run(() => acts.resume({ permitId, personId: me.id, reason: reason.trim() }))) return
    toast.success("Retomada registrada", { description: permit.state === "suspensa" ? `${permitName(permit)} · aguarda novo aceite no campo` : permitName(permit) })
    onClose()
  }

  return (
    <PermitActDialog busy={feedback.busy} onClose={onClose}>
      <DialogHeader className="pr-10">
        <DialogTitle>Retomar · {permitName(permit)} r{permit.revision}</DialogTitle>
        <DialogDescription className="sr-only">Registre o motivo e retome.</DialogDescription>
      </DialogHeader>

      {failures.length === 0 ? (
        <p className={cn("flex items-center gap-2 type-body font-medium", TONE_TEXT.ok)}><CheckIcon className="size-4 shrink-0" aria-hidden />Verificações em ordem</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Verificações que falharam">
          {failures.map((c) => (
            <li key={c.id} className={cn("flex items-start gap-2 type-body", TONE_TEXT.stop)}>
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span><span className="sr-only">Falha: </span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-reason">Motivo da retomada</Label>
        <Input id="resume-reason" disabled={feedback.busy} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="O que foi corrigido" autoComplete="off" className="min-h-11 md:min-h-9" />
      </div>
      <p className="type-meta">{permit.state === "suspensa" ? "A retomada anula o aceite no campo: outra pessoa faz o novo aceite." : "Depois da retomada, o aceite segue o fluxo normal."}</p>

      {/* Footer (DESIGN.md): what is missing, then Cancelar · Retomar on the right; stacked on a phone, primary on top. */}
      <div className="flex flex-col gap-3">
        <ActFeedback {...feedback} />
        {why && <p id="resume-help" className="type-meta">{why}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse md:flex-row md:items-center md:justify-end">
          <Button variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={feedback.busy} onClick={onClose}>Cancelar</Button>
          <Button className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={!canResume || feedback.busy} aria-describedby={why ? "resume-help" : undefined} onClick={() => void resume()}>{feedback.busy ? "Retomando…" : "Retomar"}</Button>
        </DialogFooter>
      </div>
    </PermitActDialog>
  )
}

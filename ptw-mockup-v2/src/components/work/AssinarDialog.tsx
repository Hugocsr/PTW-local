import { useMemo, useState } from "react"
import { HoldButton } from "@/components/signal/HoldButton"
import { CheckIcon, CircleAlertIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { pathIds, railOf } from "@/core/permitView"
import { actionLabel, actionVerb, canReturn as mayReturn, planSign } from "@/core/signing"
import { usePermitActs } from "@/data/hooks"
import { equipmentOf } from "./useMyWork"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { FormAnswersView } from "../registry/FormFill"
import { permitName } from "@/core/permitFormat"
import { navigate } from "./nav"
import { HolderText } from "./HolderText"
import { TONE_TEXT } from "../shell/Status"
import { cn } from "@/lib/utils"
import { hms } from "@/core/time"
import { useActFeedback } from "./useActFeedback"
import { ActFeedback } from "./ActFeedback"
import { PermitActDialog } from "./PermitActDialog"

/**
 * Review and sign. Filling in happens on the PT's Etapas tab; this surface shows what the person
 * signs, the checks and the act itself (one button): Enviar, Reenviar, Assinar or
 * Entregar. A bottom sheet on a phone (thumb reach, clear of the keyboard), a centered dialog elsewhere.
 */
export function AssinarDialog({ permitId, returning = false, onClose }: { permitId: string | null; returning?: boolean; onClose: () => void }) {
  return permitId ? <Form key={`${permitId}${returning}`} permitId={permitId} startReturning={returning} onClose={onClose} /> : null
}

function Form({ permitId, startReturning, onClose }: { permitId: string; startReturning: boolean; onClose: () => void }) {
  const { state } = useRegistry()
  const store = usePermits()
  const sim = useSim()
  const [returning, setReturning] = useState(startReturning)
  const [reason, setReason] = useState("")
  const acts = usePermitActs()
  const feedback = useActFeedback()

  const permit = store.permits.find((p) => p.id === permitId)
  const ver = state.templates.find((t) => t.id === permit?.templateId)?.versions.find((v) => v.id === permit?.versionId)
  const me = state.people.find((p) => p.id === sim.personId)
  const plan = useMemo(() => {
    if (!permit || !ver || !me) return null
    const rail = railOf(permit, ver, store.signatures, state.people, state.locations, sim.today, sim.now)
    return planSign({ permit, ver, rail, permits: store.permits, signer: me, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, timezone: state.units[0]?.timezone, serverDown: sim.serverDown, equipment: equipmentOf(state), people: state.people, form: store.formOf(permit, ver), pathIds: pathIds(state.locations, permit.locationId), lists: state.optionLists })
  }, [permit, ver, me, store, state, sim.now, sim.today, sim.serverDown])

  if (!permit || !ver || !me || !plan) return <PermitActDialog busy={feedback.busy} onClose={onClose}><DialogHeader><DialogTitle>PT não encontrada</DialogTitle></DialogHeader></PermitActDialog>

  const verb = actionVerb(permit, plan)
  const slot = plan.slot
  const form = store.formOf(permit, ver)
  const stageSections = form.sections.filter((s) => s.stageId === plan.stageId)
  const failures = plan.checks.filter((c) => !c.ok)
  // Equipment held by another open PT: no "Preencher e enviar" shortcut, the act itself is impossible.
  const fillOpen = failures.some((c) => c.fill) && !failures.some((c) => c.holder)
  const canSign = failures.length === 0
  const canReturn = mayReturn(permit, plan, me.id)
  const canGiveBack = canReturn && !!reason.trim() && !sim.serverDown

  // Inside the PT it is a tab change (no history entry); from elsewhere it opens the PT.
  const toEtapas = () => { onClose(); navigate(`pt/${permitId}/etapas`, { replace: window.location.hash.startsWith(`#pt/${permitId}/`) }) }
  const sign = async () => {
    if (!slot || !canSign || feedback.busy) return
    // The store checks everything again (the database's rules) and refuses with the code when it must.
    if (!await feedback.run(() => acts.sign({ permitId, slotId: slot.slot.id, personId: me.id }))) return
    const done = { Enviar: "PT enviada", Reenviar: "PT reenviada: nova revisão, assinaturas anteriores anuladas", Entregar: "Área entregue", Assinar: "Assinado" }[verb]
    toast.success(done, { description: `${permit.number ? `${permit.number} · ` : ""}${hms(sim.now)}` })
    onClose()
  }
  const giveBack = async () => {
    if (!canGiveBack || feedback.busy) return
    if (!await feedback.run(() => acts.refuse({ permitId, personId: me.id, reason: reason.trim() }))) return
    toast.warning("PT devolvida", { description: reason.trim() })
    onClose()
  }

  return (
    <PermitActDialog busy={feedback.busy} onClose={onClose}
      desktopClassName="flex h-[min(42rem,90svh)] flex-col sm:max-w-lg"
      sheetClassName="data-[side=bottom]:h-[90dvh]"
      sheetInnerClassName="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <DialogHeader className="pr-10">
        <DialogTitle>{returning ? "Devolver" : verb} · {permitName(permit)}{permit.number ? ` r${permit.revision}` : ""}</DialogTitle>
        <DialogDescription className="sr-only">{returning ? "Diga o que precisa mudar e devolva." : "Revise o que vai assinar e assine."}</DialogDescription>
      </DialogHeader>

      {slot && (
        <div className="flex flex-col gap-0.5">
          <span className="type-title">{slot.slot.meaning}</span>
          <span className="type-meta">Etapa {plan.stageName}</span>
        </div>
      )}

      {stageSections.length > 0 && !fillOpen && !returning && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 type-meta">
            {plan.sealed && <LockIcon className="size-3.5" aria-hidden />}
            {plan.sealed ? "Selado na primeira assinatura desta etapa. Você assina o mesmo conteúdo." : "O que você assina:"}
          </span>
          <FormAnswersView form={{ sections: stageSections }} stages={ver.stages} answers={permit.answers} showStage={false} />
        </div>
      )}

      {returning ? null : failures.length === 0 ? (
        <p className={cn("flex items-center gap-2 type-body font-medium", TONE_TEXT.ok)}><CheckIcon className="size-4 shrink-0" aria-hidden />Verificações em ordem</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Verificações que falharam">
          {failures.map((c) => (
            <li key={c.id} className={cn("flex items-start gap-2 type-body", TONE_TEXT.stop)}>
              {c.holder ? <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span><span className="sr-only">Falha: </span><HolderText text={c.text} holders={c.holder ? [c.holder] : []} /></span>
            </li>
          ))}
        </ul>
      )}

      {returning && (
        // Devolver is a decision on record, like Assinar: the reason, then the button.
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="return-reason">Motivo da devolução</Label>
          <Input id="return-reason" autoFocus disabled={feedback.busy} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="O que precisa mudar" aria-describedby={sim.serverDown ? "return-help" : undefined} className="min-h-11 md:min-h-9" />
          {sim.serverDown && <span id="return-help" className={cn("type-meta", TONE_TEXT.stop)}>Sem servidor: não dá para devolver.</span>}
        </div>
      )}

      {/* Footer (DESIGN.md): the buttons on the right, primary last; on a phone stacked, primary on top,
          full width. Cancelar (or Voltar, back to signing) left of the primary; Devolver, a secondary, leftmost. */}
      <div className="mt-auto flex flex-col gap-3">
        <ActFeedback {...feedback} />
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse md:flex-row md:items-center md:justify-end">
          {returning ? (
            <>
              <Button variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={feedback.busy} onClick={() => (startReturning ? onClose() : setReturning(false))}>{startReturning ? "Cancelar" : "Voltar"}</Button>
              <Button variant="stop" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={!canGiveBack || feedback.busy} aria-describedby={sim.serverDown ? "return-help" : undefined} onClick={() => void giveBack()}>{feedback.busy ? "Devolvendo…" : "Devolver a PT"}</Button>
            </>
          ) : (
            <>
              {canReturn && <Button variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto md:mr-auto" disabled={feedback.busy} onClick={() => setReturning(true)}>Devolver</Button>}
              <Button variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={feedback.busy} onClick={onClose}>Cancelar</Button>
              {fillOpen
                ? <Button className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={feedback.busy} onClick={toEtapas}>{actionLabel(permit, plan, true)}</Button>
                : <HoldButton className="min-h-11 w-full md:min-h-9 md:w-auto md:min-w-44" disabled={!canSign || feedback.busy} onConfirm={() => void sign()}>{feedback.busy ? "Registrando…" : `Segure para ${verb.toLowerCase()}`}</HoldButton>}
            </>
          )}
        </DialogFooter>
      </div>
    </PermitActDialog>
  )
}

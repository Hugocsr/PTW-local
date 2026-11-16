import { rolesText } from "@/core/eligibility"
import { OctagonXIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { emissionSlot, stopEffect } from "@/core/stopResume"
import { useData, usePermitActs } from "@/data/hooks"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { permitName } from "@/core/permitFormat"
import { TONE_TEXT } from "../shell/Status"
import { TOGGLE_ON } from "../registry/common"
import { cn } from "@/lib/utils"
import { useActFeedback } from "./useActFeedback"
import { ActFeedback } from "./ActFeedback"
import { PermitActDialog } from "./PermitActDialog"

const REASONS = ["Condição insegura", "Vazamento ou falha", "Mudança no serviço", "Outro motivo"]

/**
 * Stopping only reduces authorization, so it needs no re-authentication and the first reason is
 * preselected. Bottom sheet on a phone (thumb reach), centered dialog elsewhere, like Assinar.
 */
export function StopSheet({ permitId, onClose }: { permitId: string | null; onClose: () => void }) {
  return permitId ? <Body key={permitId} permitId={permitId} onClose={onClose} /> : null
}

function Body({ permitId, onClose }: { permitId: string; onClose: () => void }) {
  const store = usePermits()
  const sim = useSim()
  const [reason, setReason] = useState(REASONS[0])
  const [chosen, setChosen] = useState(false)
  const acts = usePermitActs()
  const { session } = useData()
  const feedback = useActFeedback()
  const { state } = useRegistry()
  const permit = store.permits.find((p) => p.id === permitId)
  if (!permit) return null
  const down = sim.serverDown
  const ver = state.templates.find((t) => t.id === permit.templateId)?.versions.find((v) => v.id === permit.versionId)
  const slot = ver ? emissionSlot(ver) : null
  const who = slot && slot.kind !== "pessoa" ? (rolesText(slot.roleIds, (id) => label(state.roleTypes, id)) || "quem emite") : "quem emite"
  const effect = stopEffect(permit)
  const note = effect.state === permit.state
    ? `O estado não muda, mas o próximo aceite fica bloqueado até a Retomada por ${who}.`
    : `A PT passa a Suspensa. Retoma: ${who}; depois, novo aceite no campo.`
  return (
    <PermitActDialog busy={feedback.busy} onClose={onClose}
      desktopClassName="gap-0 p-0" sheetClassName="gap-0 p-0" sheetInnerClassName="">
    <div className="mx-auto flex w-full max-w-md flex-col">
      <SheetHeader className="border-t-[6px] border-st-stop-solid p-4 pr-14">
        <SheetTitle className="flex flex-col gap-1"><span className={cn("flex items-center gap-2 text-lg leading-6 font-bold tracking-[0.04em] uppercase", TONE_TEXT.stop)}><OctagonXIcon className="size-5 shrink-0" aria-hidden />Parar o trabalho</span><span className="type-data text-muted-foreground">{permitName(permit)}</span></SheetTitle>
        <SheetDescription className="sr-only">Escolha o motivo e confirme.</SheetDescription>
      </SheetHeader>
      <ToggleGroup type="single" variant="outline" value={reason} disabled={feedback.busy} aria-label="Motivo da parada" className="flex w-full flex-col px-4" onValueChange={(v) => { if (v) { setReason(v); setChosen(true) } }}>
        {REASONS.map((r) => <ToggleGroupItem key={r} value={r} className={cn("h-12 w-full justify-start", TOGGLE_ON)}>{r}</ToggleGroupItem>)}
      </ToggleGroup>
      {/* The preselection is a default, not a choice: say so until the person picks. */}
      {!chosen && <p className="px-4 pt-2 type-meta">Motivo padrão já marcado. Toque em outro se for o caso.</p>}
      {/* Pinned to the sheet's bottom edge so the confirm is always in thumb reach. */}
      <div className="sticky bottom-0 flex flex-col gap-2 bg-popover p-4">
        {down ? (
          <p className={cn("type-body", TONE_TEXT.stop)} role="status">Sem servidor: a parada fica guardada neste aparelho para envio quando a conexão voltar. Pare o trabalho com segurança e avise a área.</p>
        ) : (
          <p className="type-meta">{note}</p>
        )}
        <ActFeedback {...feedback} stop />
        {/* Footer (DESIGN.md): Cancelar · Parar o trabalho on the right; stacked on a phone, Parar on top, full width.
            Parar keeps 44 px at every width, like the PT's action panel (safety action). */}
        <div className="flex flex-col-reverse gap-2 pt-1 md:flex-row md:justify-end">
          <Button variant="outline" className="h-11 w-full md:w-auto" disabled={feedback.busy} onClick={onClose}>Cancelar</Button>
          <Button variant="stop" className="h-11 w-full md:w-auto" disabled={feedback.busy} onClick={async () => {
            const recorded = chosen ? reason : `${reason} (motivo padrão)`
            if (!await feedback.run(() => acts.stop({ permitId, personId: sim.personId, reason: recorded }))) return
            const queued = session.get().serverDown
            toast.error(queued ? "Parada guardada neste aparelho" : "Trabalho parado", { description: queued ? "Aguardando envio ao servidor. Pare o trabalho com segurança e avise a área." : `${permitName(permit)} · ${recorded}` })
            onClose()
          }}>{feedback.busy ? "Registrando parada…" : "Parar o trabalho"}</Button>
        </div>
      </div>
    </div>
    </PermitActDialog>
  )
}

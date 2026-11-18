import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { electricalShift, revalidationDenied, type RevalidationInput } from "@/core/electrical"
import { dmHms, instant, wallOf } from "@/core/time"
import { windowLimitDenied } from "@/core/windowLimit"
import { usePermitActs } from "@/data/hooks"
import { usePermits } from "@/permit/store"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import type { Permit } from "@/permit/types"
import type { FormSpec, TemplateVersion } from "@/registry/types"
import { PermitActDialog } from "./PermitActDialog"
import { useActFeedback } from "./useActFeedback"
import { ActFeedback } from "./ActFeedback"

export function ElectricalPanel({ permit, ver, form }: { permit: Permit; ver: TemplateVersion; form: FormSpec }) {
  const [open, setOpen] = useState(false)
  const { signatures } = usePermits()
  const sim = useSim()
  const { state } = useRegistry()
  if (!form.electrical) return null
  const newer = form.electrical.standard === "preparacao2027"
  const tz = state.units[0]?.timezone
  const shift = permit.revalidation ? { start: permit.revalidation.shiftStart, end: permit.revalidation.shiftEnd } : electricalShift(form, permit.answers, tz)
  const issuerSlots = ver.stages.filter((s) => s.kind === "emissao").flatMap((s) => s.slots.map((sl) => sl.id))
  const issuer = signatures.some((s) => s.permitId === permit.id && s.rev === permit.revision && !s.voidedAt && s.personId === sim.personId && issuerSlots.includes(s.slotId))
  const can = newer && issuer && ["emitida", "ativa", "suspensa", "expirada"].includes(permit.state)
  return <section className="flex min-w-0 flex-col gap-2 border-t pt-3" aria-label="Controles NR-10">
    <h3 className="type-section">{newer ? "NR-10 · preparação para 2027" : "NR-10 · base vigente"}</h3>
    <p className="type-meta text-muted-foreground">{newer ? "Referência com vigência em 01/06/2027. Validade limitada à atividade e ao turno." : "Procedimento e controles da redação consolidada em 2019."}</p>
    {shift && <p className="type-meta">Turno: {dmHms(shift.start, tz)} a {dmHms(shift.end, tz)}</p>}
    {permit.revalidation && <p className="type-meta">Revalidada em {dmHms(permit.revalidation.at, tz)} por {state.people.find((p) => p.id === permit.revalidation?.personId)?.name ?? "responsável"}. {permit.revalidation.reason}</p>}
    {can && <Button variant="outline" className="min-h-11 w-full md:min-h-9" disabled={sim.serverDown || !!permit.holdReason} onClick={() => setOpen(true)}>Revalidar para turno</Button>}
    {can && permit.holdReason && <p className="type-meta">Revalidação bloqueada pela parada registrada.</p>}
    {open && <RevalidateForm permit={permit} ver={ver} form={form} onClose={() => setOpen(false)} />}
  </section>
}

function RevalidateForm({ permit, ver, form, onClose }: { permit: Permit; ver: TemplateVersion; form: FormSpec; onClose: () => void }) {
  const sim = useSim()
  const { state } = useRegistry()
  const { signatures } = usePermits()
  const acts = usePermitActs()
  const feedback = useActFeedback()
  const tz = state.units[0]?.timezone
  const [values, setValues] = useState({ start: wallOf(sim.now, tz).slice(0, 16), end: "", activity: "", reason: "" })
  const [confirmed, setConfirmed] = useState({ conditionsUnchanged: false, teamUnchanged: false, assessmentConfirmed: false })
  const iso = (v: string) => v ? instant(v, tz) : ""
  const input: RevalidationInput = { shiftStart: iso(values.start), shiftEnd: iso(values.end), newEnd: iso(values.activity), reason: values.reason, ...confirmed }
  const emitterSlots = ver.stages.filter((s) => s.kind === "emissao").flatMap((s) => s.slots.map((sl) => sl.id))
  const error = revalidationDenied(permit, form, signatures, emitterSlots, sim.personId ?? "", input, sim.now)
    ?? (input.newEnd ? windowLimitDenied(ver, permit.revalidation?.originalStart ?? permit.windowStart, input.newEnd) : null)
  const send = async () => {
    if (error || feedback.busy || sim.serverDown) return
    if (await feedback.run(() => acts.revalidate({ permitId: permit.id, personId: sim.personId!, ...input }))) {
      toast.success("PT revalidada", { description: "Aguarda novo aceite no campo." })
      onClose()
    }
  }
  return <PermitActDialog busy={feedback.busy} onClose={onClose}>
    <DialogHeader><DialogTitle>Revalidar para turno</DialogTitle><DialogDescription>Confirme a avaliação no local. Alterações de equipe, escopo ou condições exigem uma nova PT neste processo. Horários no fuso {tz}.</DialogDescription></DialogHeader>
    <div className="flex flex-col gap-4 py-3">
      {([["start", "Início do turno"], ["end", "Fim do turno"], ["activity", "Novo fim da atividade"]] as const).map(([key, label]) => <div key={key} className="min-w-0 space-y-1"><Label htmlFor={`reval-${key}`}>{label}</Label><Input className="min-h-11 min-w-0 w-full" id={`reval-${key}`} type="datetime-local" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} disabled={feedback.busy} /></div>)}
      <div className="space-y-1"><Label htmlFor="reval-reason">Justificativa</Label><Textarea id="reval-reason" maxLength={500} value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} disabled={feedback.busy} /></div>
      {([["conditionsUnchanged", "Condições, escopo, ativo e controles permanecem iguais"], ["teamUnchanged", "Todos os integrantes e suas autorizações permanecem válidos"], ["assessmentConfirmed", "Realizei nova avaliação no local e não identifiquei impeditivas"]] as const).map(([key, label]) => <Label key={key} className="flex min-h-11 items-start gap-2 type-body"><Checkbox checked={confirmed[key]} onCheckedChange={(v) => setConfirmed({ ...confirmed, [key]: v === true })} disabled={feedback.busy} /><span>{label}</span></Label>)}
      <ActFeedback {...feedback} />
      {error && <p className="type-meta" role="status">{error.message}</p>}
    </div>
    <DialogFooter><Button variant="outline" disabled={feedback.busy} onClick={onClose}>Cancelar</Button><Button disabled={!!error || sim.serverDown || feedback.busy} onClick={() => void send()}>{feedback.busy ? "Revalidando…" : "Revalidar"}</Button></DialogFooter>
  </PermitActDialog>
}

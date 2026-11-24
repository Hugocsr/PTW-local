import { rolesText } from "@/core/eligibility"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckIcon, CircleAlertIcon, CircleIcon, CircleSlashIcon, EyeOffIcon, LockIcon, PenLineIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { needSuffix, slotNeed } from "@/core/form"
import type { FormSpec } from "@/registry/types"
import { FillContext, FormFilesContext, type FormFiles } from "../registry/FormFill"
import { pathIds } from "@/core/permitView"
import { toastFor } from "@/core/ptwErrors"
import { equipmentOf } from "./useMyWork"
import type { SlotView, StageView } from "@/core/permitView"
import { cn } from "@/lib/utils"
import { TONE_TEXT, type StatusTone } from "../shell/Status"
import { actionLabel, actionVerb, planSign } from "@/core/signing"
import type { Permit } from "@/permit/types"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import type { TemplateVersion } from "@/registry/types"
import { fmtDateTime, useSim } from "@/sim/SimProvider"
import { msOf } from "@/core/time"
import { NotRequired, NotRequiredGroup, StageCard } from "./StageCard"
import { AssinarDialog } from "./AssinarDialog"
import { HolderText } from "./HolderText"

/**
 * Etapas: the permit's flow, the same shape as the template's Fluxo. Each stage shows what is filled
 * in and who signs it. The stage where it is this person's turn is filled in right here (answers
 * save as they are given) and ends with the sign button; every other stage reads only.
 */
export function PermitFormTab({ permit, ver, rail }: { permit: Permit; ver: TemplateVersion; rail: StageView[] }) {
  const { state } = useRegistry()
  const store = usePermits()
  const sim = useSim()
  const [open, setOpen] = useState<string | null>(null)
  const me = state.people.find((p) => p.id === sim.personId)
  const form = store.formOf(permit, ver)
  const path = useMemo(() => pathIds(state.locations, permit.locationId), [state.locations, permit.locationId])
  const plan = me ? planSign({ permit, ver, rail, permits: store.permits, signer: me, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, timezone: state.units[0]?.timezone, serverDown: sim.serverDown, equipment: equipmentOf(state), people: state.people, form, pathIds: path, lists: state.optionLists }) : null
  // The PT's files: answers keep attachment ids; a capture is stored (SHA-256 of its bytes) before it is answered.
  const files = useMemo<FormFiles>(() => ({
    attachments: store.attachments.filter((a) => a.permitId === permit.id),
    urlOf: store.urlOf,
    capture: async (itemId, kind, file) => {
      const att = await store.capture(permit.id, sim.personId, itemId, kind, file)
      if (!att) toast.error("Arquivo não guardado", { description: "Tipo de arquivo não aceito ou sem servidor." })
      return att
    },
  }), [store, permit.id, sim.personId])
  const submit = permit.state === "rascunho" || permit.state === "devolvida"
  // A draft or a returned PT is only ever filled in by its requester: anyone else sees it read-only,
  // never "Sua vez" (the top of the PT already says "Só o solicitante envia esta PT").
  const mine = !!me && !!plan?.slot && plan.slot.eligible.some((e) => e.person.id === me.id) && !plan.slot.signed.some((g) => g.personId === me.id)
    && (!submit || me.id === permit.authorId)
  const myStage = mine && plan ? plan.stageId : null
  // Open the tab right at this person's part.
  useEffect(() => {
    if (!myStage) return
    const t = window.setTimeout(() => document.getElementById("pf-mine")?.scrollIntoView({ block: "start" }), 120)
    return () => window.clearTimeout(t)
  }, [myStage])
  if (!me || !plan) return null

  const verb = actionVerb(permit, plan)
  // Enviar on equipment another open PT holds: filling stays possible, sending does not.
  const held = plan.checks.filter((c) => !c.ok && c.holder)
  const statusOf = (stageId: string) => rail.find((r) => r.stage.id === stageId)?.status ?? "futura"

  return (
    <div className="flex flex-col gap-4">
      <FormFilesContext.Provider value={files}>
      <FillContext.Provider value={{ assetIds: permit.assetIds, pathIds: path }}>
      <ol className="flex flex-col gap-4">
        {ver.stages.map((st, i) => {
          const view = rail.find((r) => r.stage.id === st.id)
          const isMine = st.id === myStage
          // Whoever has the turn fills in their part, unless a parallel signer already sealed it.
          // Without the server nothing saves (only Parar does): the answers read only.
          const editing = isMine && !plan.sealed && !sim.serverDown
          const status = submit && st.kind === "solicitacao" ? "atual" : statusOf(st.id)
          const sections = form.sections.filter((s) => s.stageId === st.id)
          return (
            <StageCard key={st.id} n={i + 1} stage={st} stages={ver.stages} sections={sections} answers={permit.answers}
              status={status} turn={isMine ? "Sua vez" : undefined} editing={editing} actor={{ id: me.id, now: sim.now }}
              onAnswer={(itemId, value) => {
                // Refused on save (e.g. a person not eligible, PTW08): nothing is written and the reason shows.
                const denied = store.answer({ permitId: permit.id, personId: me.id, itemId, value })
                if (denied) { const t = toastFor(denied); toast.error(t.title, { description: denied.message }) }
              }}
              signatures={view && <StageSignatures permit={permit} view={view} form={form} />}
              footer={isMine ? ({ done, missing, blocked }) => (
                <div className="flex flex-col gap-1.5">
                  {sim.serverDown && <p id="pf-down" className={cn("flex items-center gap-2 type-meta", TONE_TEXT.attention)}><EyeOffIcon className="size-4 shrink-0" aria-hidden />Sem servidor: preencher e {verb.toLowerCase()} voltam com o servidor.</p>}
                  {held.map((c, i) => (
                    <p key={c.id} id={i === 0 ? "pf-held" : undefined} className={cn("flex items-start gap-1.5 type-meta font-medium", TONE_TEXT.stop)}>
                      <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>Não dá para {verb.toLowerCase()}: <HolderText text={c.text} holders={c.holder ? [c.holder] : []} /></span>
                    </p>
                  ))}
                  {/* The disabled button says why, beside it: what blocks (stop, naming the item) or how many answers are missing. */}
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
                    <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal py-2 text-left md:w-fit" disabled={(editing && !done) || sim.serverDown || held.length > 0} aria-describedby={sim.serverDown ? "pf-down" : held.length ? "pf-held" : editing && !done ? "pf-why" : undefined} onClick={() => setOpen(permit.id)}>
                      {actionLabel(permit, plan)}
                    </Button>
                    {editing && !done && (blocked.length
                      ? <p id="pf-why" className={cn("flex items-start gap-1.5 type-meta font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />Bloqueada por {blocked.length === 1 ? "uma resposta" : `${blocked.length} respostas`}: {blocked[0]}{blocked.length > 1 ? "…" : ""}</p>
                      : <p id="pf-why" className="type-meta tabular-nums">{missing.length === 1 ? "Falta 1 resposta" : `Faltam ${missing.length} respostas`}</p>)}
                  </div>
                </div>
              ) : undefined} />
          )
        })}
      </ol>
      </FillContext.Provider>
      </FormFilesContext.Provider>
      <AssinarDialog permitId={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** The signatures of one stage: who signed and when, signatures a change invalidated, who may still sign. */
export function StageSignatures({ permit, view, form }: { permit: Permit; view: StageView; form: FormSpec }) {
  const { state } = useRegistry()
  const who = (id: string) => state.people.find((p) => p.id === id)?.name ?? id
  const sim = useSim()
  // A signature made in the last seconds lands as a stamp.
  const fresh = (at: string) => Math.abs(msOf(sim.now) - msOf(at)) < 6000
  const rows = view.slots.map((v) => ({ v, need: slotNeed(v.slot, permit.answers, form, state.optionLists) }))
  // Signatures nobody waits for (not required by the answers, nothing on record): one muted line when several.
  const idle = rows.filter(({ v, need }) => need.need === "nao_exigida" && v.signed.length === 0 && v.struck.length === 0)
  const folded = idle.length >= 2
  return (
    <div className="@container flex flex-col gap-2">
      {/* Who signs reads as text, never a box: a white box would look like a field to fill. */}
      <div className="grid gap-x-8 gap-y-4 @xl:grid-cols-2">
        {rows.filter((r) => !folded || !idle.includes(r)).map(({ v, need }) => {
          const off = need.need === "nao_exigida" && v.signed.length === 0
          return (
          <div key={v.slot.id} className="flex min-w-0 flex-col gap-1">
            <span className={cn("type-body font-medium", off && "text-muted-foreground")}>{v.slot.meaning}<span className="type-meta font-normal"> · {v.slot.kind === "pessoa" ? "pessoa indicada" : rolesText(v.slot.roleIds, (id) => label(state.roleTypes, id))}{needSuffix(need)}</span></span>
            {v.signed.map((g) => (
              <span key={g.id} className={cn("stamp my-1.5 w-fit max-w-full", TONE_TEXT.ok, fresh(g.signedAt) && "stamp-in")}>
                <span className="flex items-center gap-1 text-[0.625rem] leading-3 font-bold tracking-[0.14em] uppercase"><CheckIcon className="size-3 shrink-0" strokeWidth={3} aria-hidden />Assinado</span>
                <span className="type-section break-words">{who(g.personId)}</span>
                {g.representedPersonId && <span className="type-meta">Em nome de {who(g.representedPersonId)} · delegação registrada</span>}
                <span className="type-data">{fmtDateTime(g.signedAt)} · r{g.rev}</span>
              </span>
            ))}
            {/* A voided signature stays on record, struck, with the word "Anulada" and its reason (never colour alone). */}
            {v.struck.map((g) => (
              <span key={g.id} className={cn("flex flex-col gap-0.5 type-meta", TONE_TEXT.attention)}>
                <span className="flex flex-wrap items-center gap-x-1.5"><CircleSlashIcon className="size-3.5 shrink-0" aria-hidden /><span className="font-medium">Anulada</span><span className="line-through">{who(g.personId)} · {fmtDateTime(g.signedAt)} · r{g.rev}</span></span>
                {g.voidedReason && <span className="pl-5 text-muted-foreground">{g.voidedReason}{g.voidedAt ? ` (${fmtDateTime(g.voidedAt)})` : ""}</span>}
                {g.representedPersonId && <span className="pl-5">Em nome de {who(g.representedPersonId)}</span>}
              </span>
            ))}
            {off ? <NotRequired when={need.when} /> : !v.satisfied && <Waiting v={v} current={view.status === "atual"} />}
          </div>
          )
        })}
      </div>
      {folded && <NotRequiredGroup slots={idle.map(({ v, need }) => ({ meaning: v.slot.meaning ?? "", when: need.need === "nao_exigida" ? need.when : "" }))} />}
    </div>
  )
}

/**
 * A signature still open, in one tone: yours now (pending), nobody can sign it in the current stage
 * (stop), or waiting for someone else / a later stage (neutral). Each eligible person on a line; a
 * person who is not eligible reads red with the reason.
 */
function Waiting({ v, current }: { v: SlotView; current: boolean }) {
  const sim = useSim()
  const mine = v.eligible.some((e) => e.ok && e.person.id === sim.personId)
  const none = !v.eligible.some((e) => e.ok)
  const tone: StatusTone = current && mine ? "pending" : current && none ? "stop" : "neutral"
  const Icon = tone === "pending" ? PenLineIcon : tone === "stop" ? CircleAlertIcon : CircleIcon
  // A stage not reached yet: the roles above already say who signs; the names come when it is their turn.
  // Only the stage in progress names who is (or is not) able to sign; later stages stay quiet.
  if (!current) return null
  const head = tone === "pending" ? "Sua assinatura" : tone === "stop" ? "Ninguém pode assinar agora" : "Aguardando assinatura"
  return (
    <div className="flex flex-col gap-0.5 type-meta">
      <span className={cn("flex items-center gap-1.5 font-medium", TONE_TEXT[tone])}><Icon className="size-3.5 shrink-0" aria-hidden />{head}</span>
      {v.eligible.length === 0 && <span className="pl-5">Ninguém elegível.</span>}
      {v.eligible.map((e) => (
        <span key={e.person.id} className={cn("pl-5", !e.ok && TONE_TEXT.stop)}>
          {e.person.name}{e.person.id === sim.personId ? " (você)" : ""}{e.delegation ? " · por delegação administrativa" : ""}{e.ok ? "" : ` · não elegível: ${e.reasons.join(", ")}`}
        </span>
      ))}
    </div>
  )
}

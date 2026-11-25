import { useId, useMemo, useState } from "react"
import type { Delegation, DelegationInput } from "@/core/delegation"
import { approvalsOf, delegateCandidates, delegators, lastDay, MAX_DAYS, plantScopes, windowOf } from "@/core/delegationView"
import { pathIds } from "@/core/permitView"
import { DEFAULT_TZ, dayOf } from "@/core/time"
import { uuidv7 } from "@/lib/id"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { dateBr } from "@/core/form"
import { FormDialog, SelectField, TextField } from "./forms"
import { DateInput } from "./DateInput"

const ALL = "todas"
/** "AAAA-MM-DD" plus n days (calendar arithmetic, no time zone involved). */
const addDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10) }
const grid = "grid gap-x-4 gap-y-4 sm:grid-cols-2"

/**
 * SGI · Nova delegação: Delegante, Delegado, Início, Fim, Escopo (planta) e Observação. O PTW acrescenta a
 * aprovação (todas as do delegante, por padrão) e só oferece como delegado quem o banco aceitaria:
 * conta e cargo válidos no escopo para ao menos uma das aprovações cobertas.
 * SPEC 003: com `existing` (agendada), é "Editar delegação": tudo preenchido, delegante só leitura.
 */
export function NewDelegationDialog({ existing, busy, error, onSave, onClose }: { existing?: Delegation; busy: boolean; error?: string; onSave: (d: DelegationInput) => Promise<void>; onClose: () => void }) {
  const { state } = useRegistry(), sim = useSim()
  const tz = state.units[0]?.timezone ?? DEFAULT_TZ
  const today = dayOf(sim.now, tz)
  const [id] = useState(() => existing?.id ?? uuidv7())
  const [delegatorId, setDelegator] = useState(existing?.delegatorId ?? "")
  const [delegateId, setDelegate] = useState(existing?.delegateId ?? "")
  const [scope, setScope] = useState(existing?.scopeLocationId ?? ALL)
  const [slot, setSlot] = useState(existing?.slotId ?? ALL)
  const [start, setStart] = useState(existing ? dayOf(existing.startsAt, tz) : today)
  const [end, setEnd] = useState(existing ? lastDay(existing.endsAt, tz) : "")
  const [reason, setReason] = useState(existing?.reason ?? "")
  const [startProblem, setStartProblem] = useState<string | null>(null)
  const [endProblem, setEndProblem] = useState<string | null>(null)
  const startId = useId(), endId = useId()

  const owners = useMemo(() => delegators(state.people, state.templates), [state.people, state.templates])
  const approvals = useMemo(() => (delegatorId ? approvalsOf(state.templates, delegatorId) : []), [state.templates, delegatorId])
  const covered = slot === ALL ? approvals : approvals.filter((a) => a.slot.id === slot)
  const path = scope === ALL ? [] : pathIds(state.locations, scope)
  const candidates = delegatorId ? delegateCandidates(state.people, covered, delegatorId, path, today, sim.now) : []
  const plants = plantScopes(state.locations)
  const window = start && end ? windowOf(start, end, sim.now, tz) : null
  const windowError = window && "error" in window ? window.error : undefined
  const missing = [
    !delegatorId && "delegante", !candidates.some((c) => c.id === delegateId) && "delegado", !start && "início", !end && "fim", !reason.trim() && "observação",
  ].filter(Boolean) as string[]
  const valid = !missing.length && !!window && !windowError && !startProblem && !endProblem && !busy

  const save = async () => {
    if (!window || "error" in window) return
    await onSave({ id, slotId: slot === ALL ? null : slot, delegatorId, delegateId, scopeLocationId: scope === ALL ? null : scope, startsAt: window.startsAt, endsAt: window.endsAt, reason: reason.trim() })
  }
  const noCandidates = !!delegatorId && !candidates.length

  return (
    <FormDialog open wide onOpenChange={(o) => !o && onClose()} title={existing ? "Editar delegação" : "Nova delegação"} description="Transferência temporária de aprovação"
      meta={existing ? `Agendada · começa em ${dateBr(dayOf(existing.startsAt, tz))} · até ${MAX_DAYS} dias corridos` : `Transferência temporária de aprovação · até ${MAX_DAYS} dias corridos`}
      valid={valid} missing={missing} submitLabel={existing ? "Salvar alterações" : "Criar delegação"} savingLabel={existing ? "Salvando…" : "Criando…"} onSubmit={save}>
      <div className={grid}>
        {existing ? (
          <Field>
            <FieldLabel>Delegante</FieldLabel>
            <p className="flex min-h-11 items-center rounded-md border bg-muted/50 px-3 type-body md:min-h-9">{state.people.find((p) => p.id === delegatorId)?.name ?? "—"}</p>
            <FieldDescription>Não muda na edição: para outro delegante, revogue e crie outra.</FieldDescription>
          </Field>
        ) : (
          <SelectField label="Delegante" value={delegatorId} placeholder="Selecione…" onChange={(v) => { setDelegator(v); setDelegate(""); setSlot(ALL) }}
            options={owners.map((p) => ({ value: p.id, label: p.name }))}
            description={owners.length ? undefined : "Nenhum aprovador nominal em aprovação delegável. Configure no modelo."} />
        )}
        <SelectField label="Delegado" value={delegateId} placeholder={delegatorId ? "Selecione…" : "Escolha o delegante primeiro"} onChange={setDelegate}
          options={candidates.map((p) => ({ value: p.id, label: p.name }))}
          error={noCandidates ? "Ninguém mais tem o cargo dessa aprovação neste escopo." : undefined}
          description={noCandidates ? undefined : "Precisa ter o cargo da aprovação no escopo"} />
        <Field>
          <FieldLabel htmlFor={startId}>Início</FieldLabel>
          <DateInput id={startId} label="Início" value={start || undefined} onChange={(v) => setStart(v ?? "")} onProblem={setStartProblem} today={today} min={today} />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>Fim</FieldLabel>
          <DateInput id={endId} label="Fim" value={end || undefined} onChange={(v) => setEnd(v ?? "")} onProblem={setEndProblem} invalid={!!windowError}
            min={start && start > today ? start : today} max={addDays(start && start > today ? start : today, MAX_DAYS - 1)} rangeFrom={start || undefined} />
          {windowError ? <p role="alert" className="type-meta text-st-stop-fg">{windowError}</p> : <FieldDescription>Inclusive: vale até o fim do dia</FieldDescription>}
        </Field>
        <div className="sm:col-span-2">
          <SelectField label="Escopo (planta)" value={scope} onChange={(v) => { setScope(v); setDelegate("") }}
            options={[{ value: ALL, label: "Todas as plantas" }, ...plants.map((p) => ({ value: p.id, label: p.name }))]}
            description={scope === ALL ? "Toda a unidade: as duas pessoas precisam de cargo sem restrição de local" : undefined} />
        </div>
        {approvals.length > 1 && (
          <div className="sm:col-span-2">
            <SelectField label="Aprovação" value={slot} onChange={(v) => { setSlot(v); setDelegate("") }}
              options={[{ value: ALL, label: `Todas as aprovações do delegante (${approvals.length})` }, ...approvals.map((a) => ({ value: a.slot.id, label: a.label }))]} />
          </div>
        )}
        {approvals.length === 1 && <p className="type-meta sm:col-span-2">Aprovação coberta: {approvals[0].label}</p>}
        <div className="sm:col-span-2">
          <TextField label="Observação" value={reason} onChange={setReason} placeholder="Ex.: Férias julho" maxLength={500} />
        </div>
      </div>
      {error && <p role="alert" className="type-body text-st-stop-fg">{error}</p>}
    </FormDialog>
  )
}

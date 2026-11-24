import { useState } from "react"
import { PlusIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { delegationStatus, type Delegation, type DelegationInput } from "@/core/delegation"
import { checkRoleAt } from "@/core/eligibility"
import { pathIds } from "@/core/permitView"
import { addMinutes, dmHms, instant, wallOf } from "@/core/time"
import { uuidv7 } from "@/lib/id"
import { useDelegations } from "@/data/hooks"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataTable } from "./DataTable"

const selectClass = "min-h-11 w-full min-w-0 rounded-md border bg-background px-3 type-body md:min-h-9"
const STATUS = { ativa: "Ativa", agendada: "Agendada", expirada: "Expirada", revogada: "Revogada" }

export function DelegationsView() {
  const data = useDelegations(), sim = useSim(), { state } = useRegistry()
  const [adding, setAdding] = useState(false)
  const [revoking, setRevoking] = useState<Delegation | null>(null)
  const fmtDateTime = (at: string) => dmHms(at, state.units[0]?.timezone)
  const who = new Map(state.people.map((p) => [p.id, p.name]))
  const slots = new Map(state.templates.flatMap((t) => t.versions.flatMap((v) => v.stages.flatMap((s) => s.slots.map((sl) => [sl.id, `${t.name} · v${v.number} · ${sl.meaning ?? s.name}`] as const)))))
  return <Page>
    <PageHeader title="Delegações" count={data.items?.length} meta="Substituições temporárias de aprovação administrativa. Assinaturas técnicas permanecem indelegáveis."
      actions={{ ...(sim.canEditRegistry ? { primary: { label: "Nova delegação", icon: PlusIcon, disabled: sim.serverDown || data.busy, onClick: () => setAdding(true) } } : {}), secondary: [{ label: "Atualizar", icon: RefreshCwIcon, disabled: data.busy, onClick: () => void data.reload() }] }} />
    {data.error && <p role="alert" className="type-body">{data.error.message}</p>}
    {!data.items && !data.error && <p role="status" className="type-body">Carregando delegações…</p>}
    {data.items && <DataTable<Delegation> rows={data.items} rowKey={(d) => d.id} noun={["delegação", "delegações"]} searchLabel="Buscar pessoa, aprovação ou motivo" searchText={(d) => `${who.get(d.delegatorId)} ${who.get(d.delegateId)} ${slots.get(d.slotId)} ${d.reason}`} columns={[
      { id: "people", header: "Representação", cell: (d) => <div className="min-w-0"><p className="type-body font-medium">{who.get(d.delegateId) ?? d.delegateId}</p><p className="type-meta">Em nome de {who.get(d.delegatorId) ?? d.delegatorId}</p><p className="type-meta break-words">{slots.get(d.slotId) ?? "Aprovação preservada"}</p></div> },
      { id: "window", header: "Vigência", className: "hidden md:table-cell", cell: (d) => <div className="type-meta">{fmtDateTime(d.startsAt)}<br />até {fmtDateTime(d.endsAt)}</div> },
      { id: "status", header: "Situação", cell: (d) => <div><p>{STATUS[delegationStatus(d, sim.now)]}</p>{sim.canEditRegistry && !d.revokedAt && <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={sim.serverDown || data.busy} onClick={() => setRevoking(d)}>Revogar</Button>}</div> },
    ]} />}
    <Dialog open={adding} onOpenChange={(v) => { if (!data.busy) setAdding(v) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Nova delegação administrativa</DialogTitle><DialogDescription>Até sete dias, com cargo e escopo válidos para as duas pessoas. O delegante continua podendo aprovar.</DialogDescription></DialogHeader>{adding && <DelegationEditor busy={data.busy || sim.serverDown} error={data.error?.message} onSave={async (input) => { if (await data.create(input)) { setAdding(false); toast.success("Delegação registrada.") } }} />}</DialogContent></Dialog>
    <Dialog open={!!revoking} onOpenChange={(v) => { if (!v && !data.busy) setRevoking(null) }}><DialogContent><DialogHeader><DialogTitle>Revogar delegação?</DialogTitle><DialogDescription>Novos usos serão recusados. Assinaturas anteriores continuam identificadas e preservadas.</DialogDescription></DialogHeader>{revoking && <RevokeForm key={revoking.id} busy={data.busy || sim.serverDown} error={data.error?.message} onSave={async (reason, key) => { if (await data.revoke(revoking, reason, key)) { setRevoking(null); toast.success("Delegação revogada.") } }} />}</DialogContent></Dialog>
  </Page>
}

function DelegationEditor({ busy, error, onSave }: { busy: boolean; error?: string; onSave: (d: DelegationInput) => Promise<void> }) {
  const { state } = useRegistry(), sim = useSim(), tz = state.units[0]?.timezone
  const options = state.templates.flatMap((t) => t.versions.filter((v) => v.status !== "rascunho").flatMap((v) => v.stages.filter((st) => !st.kind).flatMap((st) => st.slots.filter((sl) => sl.delegable).map((sl) => ({ slot: sl, label: `${t.name} · v${v.number} · ${sl.meaning}` })))))
  const [draft, setDraft] = useState(() => ({ id: uuidv7(), slotId: "", delegateId: "", scopeLocationId: "", start: wallOf(sim.now, tz).slice(0, 16), end: wallOf(addMinutes(sim.now, 480, tz), tz).slice(0, 16), reason: "" }))
  const slot = options.find((o) => o.slot.id === draft.slotId)?.slot
  const scope = draft.scopeLocationId ? pathIds(state.locations, draft.scopeLocationId) : []
  const candidates = slot ? checkRoleAt(state.people, slot.roleIds, scope, true, sim.today, sim.now).filter((p) => p.ok && p.person.id !== slot.personId) : []
  const disabled = busy || !slot?.personId || !candidates.some((p) => p.person.id === draft.delegateId) || !draft.start || !draft.end || !draft.reason.trim()
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!disabled && slot?.personId) void onSave({ id: draft.id, slotId: slot.id, delegatorId: slot.personId, delegateId: draft.delegateId, scopeLocationId: draft.scopeLocationId || null, startsAt: instant(draft.start, tz), endsAt: instant(draft.end, tz), reason: draft.reason }) }}>
    {!options.length && <p role="status" className="type-body">Nenhuma versão possui aprovação administrativa delegável. Configure uma etapa livre nominal com cargo e ative uma nova versão do modelo.</p>}
    <fieldset disabled={busy} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="delegation-slot">Aprovação</Label><select id="delegation-slot" className={selectClass} value={draft.slotId} onChange={(e) => setDraft({ ...draft, slotId: e.target.value, delegateId: "" })}><option value="">Selecione a aprovação</option>{options.map((o) => <option key={o.slot.id} value={o.slot.id}>{o.label}</option>)}</select></div>
      {slot && <p className="type-meta">Delegante: {state.people.find((p) => p.id === slot.personId)?.name}</p>}
      <div className="space-y-2"><Label htmlFor="delegation-scope">Escopo</Label><select id="delegation-scope" className={selectClass} value={draft.scopeLocationId} onChange={(e) => setDraft({ ...draft, scopeLocationId: e.target.value, delegateId: "" })}><option value="">Toda a unidade (exige cargo sem restrição local)</option>{state.locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="delegation-person">Delegado</Label><select id="delegation-person" className={selectClass} value={draft.delegateId} onChange={(e) => setDraft({ ...draft, delegateId: e.target.value })}><option value="">Selecione uma pessoa elegível</option>{candidates.map((p) => <option key={p.person.id} value={p.person.id}>{p.person.name}</option>)}</select></div>
      <div className="grid gap-4 sm:grid-cols-2">{([['start', 'Início'], ['end', 'Fim']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`delegation-${key}`}>{label} · {tz}</Label><Input className="min-h-11 min-w-0 md:min-h-9" id={`delegation-${key}`} type="datetime-local" required value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>)}</div>
      <div className="space-y-2"><Label htmlFor="delegation-reason">Motivo</Label><Textarea id="delegation-reason" required maxLength={500} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></div>
    </fieldset>
    {error && <p role="alert" className="type-body">{error}</p>}
    <Button className="min-h-11 md:min-h-9" type="submit" disabled={disabled}>Registrar delegação</Button>
  </form>
}

function RevokeForm({ busy, error, onSave }: { busy: boolean; error?: string; onSave: (reason: string, key: string) => Promise<void> }) {
  const [reason, setReason] = useState(""), [key] = useState(uuidv7)
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void onSave(reason, key) }}><Label htmlFor="revoke-reason">Motivo da revogação</Label><Textarea id="revoke-reason" disabled={busy} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />{error && <p role="alert" className="type-body">{error}</p>}<Button className="min-h-11 md:min-h-9" type="submit" disabled={busy || !reason.trim()}>Confirmar revogação</Button></form>
}

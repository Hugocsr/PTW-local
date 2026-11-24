import { useMemo, useState } from "react"
import { ArrowRightIcon, PlusIcon, RefreshCwIcon, UserXIcon } from "lucide-react"
import { toast } from "sonner"
import { delegationStatus, type Delegation, type DelegationStatus } from "@/core/delegation"
import { canRevoke, filterDelegations, initials, NO_FILTER, periodLabel, STATUS_LABEL, type DelegationFilter } from "@/core/delegationView"
import { DEFAULT_TZ, dmHms } from "@/core/time"
import { uuidv7 } from "@/lib/id"
import { cn } from "@/lib/utils"
import { useDelegations } from "@/data/hooks"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DateInput } from "./DateInput"
import { NewDelegationDialog } from "./NewDelegationDialog"

const PILL: Record<DelegationStatus, { box: string; dot: string }> = {
  ativa: { box: "bg-st-ok-surface text-st-ok-fg", dot: "bg-st-ok-solid" },
  agendada: { box: "bg-primary-soft text-primary", dot: "bg-primary" },
  expirada: { box: "bg-st-neutral-surface text-st-neutral-fg", dot: "bg-st-neutral-solid" },
  revogada: { box: "bg-st-stop-surface text-st-stop-fg", dot: "bg-st-stop-solid" },
}
const STATUS_OPTIONS: { value: DelegationStatus | ""; label: string }[] = [
  { value: "", label: "Todos os status" }, { value: "ativa", label: "Ativa" }, { value: "agendada", label: "Agendada" },
  { value: "expirada", label: "Expirada" }, { value: "revogada", label: "Revogada" },
]
const th = "px-4 py-3 text-left type-label whitespace-nowrap"
const td = "px-4 py-3 align-middle"

/**
 * Aprovação › Delegações (SGI Forces): transferência temporária de poderes de aprovação. Lista com filtro
 * de situação e período, nova delegação em modal e revogação (o mandato nunca é apagado: a revogação
 * recusa novos usos e preserva as assinaturas já feitas em nome do delegante).
 */
export function DelegationsView() {
  const data = useDelegations(), sim = useSim(), { state } = useRegistry()
  const tz = state.units[0]?.timezone ?? DEFAULT_TZ
  const [adding, setAdding] = useState(false)
  const [revoking, setRevoking] = useState<Delegation | null>(null)
  const [filter, setFilter] = useState<DelegationFilter>(NO_FILTER)
  const people = useMemo(() => new Map(state.people.map((p) => [p.id, p.name])), [state.people])
  const places = useMemo(() => new Map(state.locations.map((l) => [l.id, l.name])), [state.locations])
  const slots = useMemo(() => new Map(state.templates.flatMap((t) => t.versions.flatMap((v) => v.stages.flatMap((s) => s.slots.map((sl) => [sl.id, `${t.name} · v${v.number} · ${sl.meaning ?? s.name}`] as const))))), [state.templates])
  const all = useMemo(() => data.items ?? [], [data.items])
  const rows = useMemo(() => filterDelegations(all, filter, sim.now, tz), [all, filter, sim.now, tz])
  const canEdit = sim.canEditRegistry
  const down = sim.serverDown || data.busy
  const filtering = filter.status !== "" || !!filter.from || !!filter.to
  const name = (id: string) => people.get(id) ?? "Pessoa removida"

  return (
    <Page className="max-w-[80rem]">
      <PageHeader title="Delegações" meta="Transferência temporária de poderes de aprovação"
        actions={{
          ...(canEdit ? { primary: { label: "Nova delegação", icon: PlusIcon, disabled: down, onClick: () => setAdding(true) } } : {}),
          secondary: [{ label: "Atualizar", icon: RefreshCwIcon, disabled: data.busy, onClick: () => void data.reload() }],
        }} />
      {data.error && <p role="alert" className="mb-3 rounded-md border border-st-stop-solid/30 bg-st-stop-surface px-3 py-2 type-body text-st-stop-fg">{data.error.message}</p>}
      <section aria-label="Delegações" className="overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <select aria-label="Situação" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as DelegationStatus | "" })}
            className="min-h-11 rounded-md border bg-background px-3 text-sm md:min-h-9">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-meta font-medium">Período de</span>
            <DateInput id="deleg-from" label="Período de" value={filter.from || undefined} onChange={(v) => setFilter({ ...filter, from: v ?? "" })} className="w-36" />
            <span className="type-meta font-medium">até</span>
            <DateInput id="deleg-to" label="Período até" value={filter.to || undefined} onChange={(v) => setFilter({ ...filter, to: v ?? "" })} className="w-36" />
          </div>
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={!filtering} onClick={() => setFilter(NO_FILTER)}>Limpar</Button>
          <span role="status" className="ml-auto type-meta">{data.items ? `${rows.length} de ${all.length}` : ""}</span>
        </div>
        {!data.items && !data.error && <p role="status" className="p-6 type-body text-muted-foreground">Carregando delegações…</p>}
        {data.items && !rows.length && (
          <p className="p-8 text-center type-body text-muted-foreground">{all.length ? "Nenhuma delegação no filtro." : "Nenhuma delegação registrada."}</p>
        )}
        {!!rows.length && (
          <ul className="divide-y md:hidden" aria-label="Lista de delegações">
            {rows.map((d) => {
              const st = delegationStatus(d, sim.now)
              return (
                <li key={d.id} className="flex flex-col gap-2 p-4" data-status={st}>
                  <div className="flex items-center gap-2">
                    <PersonCell name={name(d.delegatorId)} tone="primary" />
                    <ArrowRightIcon aria-label="delega para" className="size-4 shrink-0 text-muted-foreground" />
                    <PersonCell name={name(d.delegateId)} tone="navy" />
                  </div>
                  <p className="text-sm">{periodLabel(d, tz)} · {d.scopeLocationId ? places.get(d.scopeLocationId) ?? "Local removido" : "Todas as plantas"}</p>
                  <p className="type-meta">{d.slotId ? `Só: ${slots.get(d.slotId) ?? "aprovação preservada"}` : "Todas as aprovações"} · {d.reason}</p>
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill status={st} reason={d.revokedReason} />
                    {canEdit && canRevoke(d, sim.now) && (
                      <Button variant="outline" disabled={down} className="min-h-11 border-st-stop-solid/40 text-st-stop-fg" onClick={() => setRevoking(d)}><UserXIcon data-icon="inline-start" />Revogar</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!!rows.length && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[60rem] border-collapse text-sm">
              <thead><tr className="border-b">
                <th className={th}>Delegante</th><th className="w-10" aria-hidden /><th className={th}>Delegado</th><th className={th}>Período</th>
                <th className={th}>Escopo</th><th className={th}>Motivo</th><th className={th}>Status</th><th className={cn(th, "border-l text-center")}>Ações</th>
              </tr></thead>
              <tbody>
                {rows.map((d) => {
                  const st = delegationStatus(d, sim.now)
                  return (
                    <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/40" data-status={st}>
                      <td className={td}><PersonCell name={name(d.delegatorId)} tone="primary" /></td>
                      <td className="text-muted-foreground"><ArrowRightIcon aria-label="delega para" className="size-4" /></td>
                      <td className={td}><PersonCell name={name(d.delegateId)} tone="navy" /></td>
                      <td className={cn(td, "whitespace-nowrap")} title={`${dmHms(d.startsAt, tz)} até ${dmHms(d.endsAt, tz)} (${tz})`}>{periodLabel(d, tz)}</td>
                      <td className={td}>
                        <p>{d.scopeLocationId ? places.get(d.scopeLocationId) ?? "Local removido" : "Todas as plantas"}</p>
                        <p className="type-meta">{d.slotId ? `Só: ${slots.get(d.slotId) ?? "aprovação preservada"}` : "Todas as aprovações"}</p>
                      </td>
                      <td className={cn(td, "max-w-56 break-words text-muted-foreground")}>{d.reason}</td>
                      <td className={td}>
                        <StatusPill status={st} reason={d.revokedReason} />
                      </td>
                      <td className={cn(td, "border-l text-center")}>
                        {canEdit && canRevoke(d, sim.now) ? (
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="outline" size="icon" aria-label={`Revogar delegação de ${name(d.delegatorId)} para ${name(d.delegateId)}`} disabled={down}
                              className="size-11 border-st-stop-solid/40 text-st-stop-fg hover:bg-st-stop-surface md:size-8" onClick={() => setRevoking(d)}>
                              <UserXIcon />
                            </Button>
                          </TooltipTrigger><TooltipContent>Revogar</TooltipContent></Tooltip>
                        ) : <span className="type-meta" aria-label="Sem ações">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-3 type-meta">Até 7 dias corridos. Só aprovações administrativas nominais são delegáveis; emissão, aceites e entrega continuam com quem tem o cargo. O delegante continua podendo aprovar.</p>
      {adding && <NewDelegationDialog busy={down} error={data.error?.message} onClose={() => setAdding(false)}
        onSave={async (input) => { if (await data.create(input)) { setAdding(false); toast.success("Delegação criada.") } }} />}
      <Dialog open={!!revoking} onOpenChange={(v) => { if (!v && !data.busy) setRevoking(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar delegação?</DialogTitle>
            <DialogDescription>
              {revoking && `${name(revoking.delegatorId)} → ${name(revoking.delegateId)}, ${periodLabel(revoking, tz)}. `}
              Novos usos serão recusados. Assinaturas anteriores continuam identificadas e preservadas.
            </DialogDescription>
          </DialogHeader>
          {revoking && <RevokeForm key={revoking.id} busy={down} error={data.error?.message} onCancel={() => setRevoking(null)}
            onSave={async (reason, key) => { if (await data.revoke(revoking, reason, key)) { setRevoking(null); toast.success("Delegação revogada.") } }} />}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function StatusPill({ status, reason }: { status: DelegationStatus; reason: string | null }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-meta font-semibold", PILL[status].box)} title={reason ? `Revogada: ${reason}` : undefined}>
      <span aria-hidden className={cn("size-1.5 rounded-full", PILL[status].dot)} />{STATUS_LABEL[status]}
    </span>
  )
}

function PersonCell({ name, tone }: { name: string; tone: "primary" | "navy" }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white", tone === "primary" ? "bg-primary" : "bg-brand-navy")}>{initials(name)}</span>
      <span className="truncate font-semibold text-foreground">{name}</span>
    </div>
  )
}

function RevokeForm({ busy, error, onSave, onCancel }: { busy: boolean; error?: string; onSave: (reason: string, key: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState(""), [key] = useState(uuidv7)
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) void onSave(reason, key) }}>
      <Label htmlFor="revoke-reason">Motivo da revogação</Label>
      <Textarea id="revoke-reason" disabled={busy} required maxLength={500} placeholder="Ex.: Retorno antecipado das férias" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p role="alert" className="type-body text-st-stop-fg">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="stop" className="min-h-11 md:min-h-9" disabled={busy || !reason.trim()}>Revogar delegação</Button>
      </DialogFooter>
    </form>
  )
}

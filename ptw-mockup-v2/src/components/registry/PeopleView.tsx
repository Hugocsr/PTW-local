import { useState, type ReactNode } from "react"
import { runAsUndo } from "@/audit/store"
import { InfoIcon, KeyRoundIcon, PlusIcon, ShieldAlertIcon, UserRoundIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { accountStateAt, ACCOUNT_LABEL, type AccountState } from "@/core/eligibility"
import { accountExpiresFromLastDay, accountLastDay, LOGIN_RE } from "@/core/registryRules"
import { F } from "@/registry/adMap"
import { fmtDate, label, locationPath, newId, suggestLogin, useRegistry } from "@/registry/store"
import type { Person, Status } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "@/components/work/state"
import { StatusBadge, TONE_TEXT, type StatusTone } from "@/components/shell/Status"
import { Page, PageHeader, PageSection } from "@/components/shell/Page"
import { Flags, PersonAvatar, useRecordBack } from "./common"
import { RecordHeader } from "./AssetsView"
import { navigate } from "@/components/work/nav"
import { DataTable } from "./DataTable"
import { FormDialog, SelectField, STATUS_OPTIONS, TextField } from "./forms"
import { Validity } from "./HierarchyView"

const NONE = "__none"

/** Conta: ativa = ok, sem login = neutral (não assina no sistema), vencida = attention (revisar), desativada = stop. */
const ACCOUNT_ICON: Record<AccountState, { icon: typeof KeyRoundIcon; tone: StatusTone }> = {
  ativa: { icon: KeyRoundIcon, tone: "ok" },
  sem_login: { icon: UserRoundIcon, tone: "neutral" },
  desativada: { icon: ShieldAlertIcon, tone: "stop" },
  vencida: { icon: ShieldAlertIcon, tone: "attention" },
}

function AccountMark({ state, badge = false }: { state: AccountState; badge?: boolean }) {
  const a = ACCOUNT_ICON[state]
  if (badge) return <StatusBadge tone={a.tone} icon={a.icon}>{ACCOUNT_LABEL[state]}</StatusBadge>
  return (
    <span className={cn("inline-flex items-center gap-1 type-meta whitespace-nowrap", TONE_TEXT[a.tone])}>
      <a.icon className="size-3.5 shrink-0" aria-hidden />{ACCOUNT_LABEL[state]}
    </span>
  )
}

const open = (id: string) => navigate(`pessoas/${id}`)

/** Model A (Lista): every person in one table; a row opens that person's page (`#pessoas/<id>`), like Ativos and Locais. */
export function PeopleView() {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const { now: simNow, today } = sim
  const down = sim.serverDown
  const { people } = state
  const [adding, setAdding] = useState(false)
  const companies = [...new Set(people.map((p) => p.company))]

  return (
    <Page>
      <PageHeader title="Pessoas" count={people.length}
        actions={sim.canEditRegistry ? { primary: { label: "Nova pessoa", icon: PlusIcon, disabled: down, onClick: () => setAdding(true) } } : undefined} />
      {down && <DownBanner now={sim.now} />}
      <DataTable<Person>
        rows={people}
        rowKey={(p) => p.id}
        noun={["pessoa", "pessoas"]}
        pageSizes={[25, 50, 100]}
        selectFilter={{ label: "Filtrar por empresa", allLabel: "Todas as empresas", options: companies.map((c) => ({ value: c, label: c })), test: (p, v) => p.company === v }}
        searchLabel="Buscar por nome, login ou matrícula"
        searchText={(p) => [p.name, p.login ?? "", p.employeeId, p.company].join(" ")}
        onRowClick={(p) => open(p.id)}
        defaultSort={{ id: "name", dir: "asc" }}
        empty={<Empty><EmptyHeader><EmptyTitle>Nenhuma pessoa cadastrada</EmptyTitle></EmptyHeader></Empty>}
        columns={[
          {
            id: "name", header: "Pessoa", className: "whitespace-normal", sort: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
            cell: (p) => (
              <button type="button" onClick={(e) => { e.stopPropagation(); open(p.id) }}
                className="flex min-h-11 w-full items-center gap-2 text-left hover:underline focus-visible:underline focus-visible:outline-none">
                <PersonAvatar name={p.name} className="size-8 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="type-body font-medium md:whitespace-nowrap">{p.name}</span>
                  <span className="type-meta md:hidden">{p.company}</span>
                  {/* Below sm the Conta column is hidden: the exception shows under the name. */}
                  {accountStateAt(p, simNow) !== "ativa" && <span className="sm:hidden"><AccountMark state={accountStateAt(p, simNow)} /></span>}
                </span>
              </button>
            ),
          },
          { id: "company", header: "Empresa", className: "hidden md:table-cell", sort: (a, b) => a.company.localeCompare(b.company, "pt-BR"), cell: (p) => p.company },
          { id: "login", header: "Login", className: "hidden lg:table-cell", cell: (p) => (p.login ? <span className="type-data text-foreground/80">{p.login}</span> : <span className="text-muted-foreground">—</span>) },
          {
            id: "roles", header: "Cargos", className: "hidden whitespace-normal lg:table-cell",
            // The names, not a count: who can sign what is why this list exists. Expired ones read amber, with the word.
            cell: (p) => {
              // One name per cargo, however many places it covers; "vencido" only when every grant of it has expired.
              const names = [...new Set(p.roles.map((r) => r.roleId))].map((id) => ({ id, name: label(state.roleTypes, id), expired: p.roles.filter((r) => r.roleId === id).every((r) => r.validUntil < today) }))
              if (names.length === 0) return <span className="text-muted-foreground">—</span>
              return (
                <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {names.map((n, i) => <span key={n.id} className={cn(n.expired && TONE_TEXT.attention)}>{n.name}{n.expired ? " (vencido)" : ""}{i < names.length - 1 ? "," : ""}</span>)}
                </span>
              )
            },
          },
          {
            id: "account", header: "Conta", className: "hidden sm:table-cell",
            sort: (a, b) => ACCOUNT_LABEL[accountStateAt(a, simNow)].localeCompare(ACCOUNT_LABEL[accountStateAt(b, simNow)], "pt-BR"),
            // Only the exception shows in the list; "Conta ativa" lives on the person's page.
            cell: (p) => (accountStateAt(p, simNow) === "ativa" ? null : <AccountMark state={accountStateAt(p, simNow)} />),
          },
        ]}
      />
      {adding && (
        <PersonDialog existing={null} now={now()} onClose={() => setAdding(false)}
          onSaved={async (p) => { if (!await upsert("people", p)) return; toast.success("Pessoa criada", { description: p.name }); setAdding(false); open(p.id) }} />
      )}
    </Page>
  )
}

/** Model C (Registro) for one person: `#pessoas/<id>`. */
export function PersonDetailView({ id }: { id: string }) {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const back = useRecordBack("pessoas")
  const [editing, setEditing] = useState(false)
  const p = state.people.find((x) => x.id === id)
  if (!p) return <Page><PageHeader back={back} title="Pessoa não encontrada" meta="O endereço não corresponde a nenhuma pessoa." /></Page>
  const scopeName = (loc: string | null) => (loc ? locationPath(state.locations, loc).map((l) => l.name).join(" › ") : "Sem restrição de local")
  return (
    <Page>
      {sim.serverDown && <DownBanner now={sim.now} />}
      <PersonDetail p={p} today={sim.today} now={sim.now} down={sim.serverDown} scopeName={scopeName} onBack={back.onClick} backLabel={back.label} onEdit={() => setEditing(true)} />
      {editing && (
        <PersonDialog existing={p} now={now()} onClose={() => setEditing(false)}
          onSaved={async (np) => { if (!await upsert("people", np)) return; toast.success("Pessoa atualizada", { description: np.name }); setEditing(false) }} />
      )}
    </Page>
  )
}

/**
 * PropertyList (DESIGN.md) whose labels can name the AD field they come from (tooltip). Same grid as the
 * shared PropertyList, which takes plain-string labels only.
 */
function AdPropertyList({ items }: { items: { label: string; value: ReactNode; ad?: string }[] }) {
  return (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2">
      {items.map((r) => (
        <div key={r.label} className="contents">
          <dt className="pt-0.5 type-label">
            {r.ad ? (
              <Tooltip>
                <TooltipTrigger asChild><span className="inline-flex cursor-help items-center gap-1">{r.label}<InfoIcon className="size-3 text-muted-foreground" aria-hidden /></span></TooltipTrigger>
                <TooltipContent>Campo no AD: {r.ad}</TooltipContent>
              </Tooltip>
            ) : r.label}
          </dt>
          <dd className="min-w-0 break-words type-body">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PersonDetail({ p, today, now, down, scopeName, onBack, backLabel, onEdit }: { p: Person; today: string; now: string; down: boolean; scopeName: (id: string | null) => string; onBack: () => void; backLabel: string; onEdit: () => void }) {
  const { state, upsert, update } = useRegistry()
  const { canEditRegistry } = useSim()
  const acc = accountStateAt(p, now)
  const tz = state.units[0]?.timezone
  const fromAD = p.origin === "ad"
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordHeader
        back={{ label: backLabel, onClick: onBack }}
        media={<PersonAvatar name={p.name} className="size-12 shrink-0" />}
        title={p.name}
        meta={<>{p.company}<AccountMark state={acc} badge /><Flags origin={p.origin} status={p.status} /></>}
        edit={fromAD || !canEditRegistry ? undefined : { disabled: down, onClick: onEdit }}
      />

      <PageSection title="Identificação">
        <AdPropertyList items={[
          { label: F.company.label, value: p.company, ad: F.company.ad },
          { label: F.employeeId.label, value: p.employeeId || "—", ad: F.employeeId.ad },
          { label: F.login.label, value: p.login ? <span className="font-mono">{p.login}</span> : "—", ad: F.login.ad },
          { label: F.accountExpires.label, value: p.accountExpires ? fmtDate(accountLastDay(p.accountExpires, tz)) : "—", ad: F.accountExpires.ad },
          ...(p.adObjectGuid ? [{ label: F.adObjectGuid.label, value: <span className="font-mono break-all">{p.adObjectGuid}</span>, ad: F.adObjectGuid.ad }] : []),
        ]} />
      </PageSection>

      <PageSection title="Cargos" action={canEditRegistry && <AddRole key={p.id} p={p} disabled={down} />}>
        {p.roles.length === 0 ? (
          <p className="type-meta">Nenhum cargo atribuído.</p>
        ) : (
          <ul className="flex flex-col divide-y border-y">
            {p.roles.map((r, i) => {
              const roleName = label(state.roleTypes, r.roleId)
              return (
                <li key={r.id} className="flex items-center gap-2 py-1">
                  <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="secondary">{roleName}</Badge>
                      <Validity until={r.validUntil} today={today} />
                    </span>
                    <span className="type-meta">{scopeName(r.scopeLocationId)}</span>
                  </div>
                  {canEditRegistry && <Button variant="ghost" size="icon" aria-label={`Remover ${roleName}`} className="size-11 shrink-0 md:size-9" disabled={down}
                    onClick={async () => {
                      if (!await upsert("people", { ...p, roles: p.roles.filter((_, j) => j !== i) })) return
                      // Undo puts this cargo back in the same place without undoing anything done since.
                      toast("Cargo removido", {
                        description: roleName,
                        action: { label: "Desfazer", onClick: () => runAsUndo(() => update<Person>("people", p.id, (cur) => ({ ...cur, roles: [...cur.roles.slice(0, i), r, ...cur.roles.slice(i)] }))) },
                      })
                    }}><XIcon /></Button>}
                </li>
              )
            })}
          </ul>
        )}
      </PageSection>
    </div>
  )
}


const DEFAULT_UNTIL = "2026-12-31"

function AddRole({ p, disabled }: { p: Person; disabled?: boolean }) {
  const { state, upsert } = useRegistry()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState("")
  const [scope, setScope] = useState(NONE)
  const [until, setUntil] = useState(DEFAULT_UNTIL)
  const scopeId = scope === NONE ? null : scope
  const dup = !!role && p.roles.some((r) => r.roleId === role && r.scopeLocationId === scopeId)
  // An inactive place takes no new cargos.
  const places = state.locations.filter((l) => l.status !== "inativo")
  return (
    <>
      <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={disabled} onClick={() => setOpen(true)}><PlusIcon data-icon="inline-start" />Cargo</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Novo cargo de ${p.name}`}
        description="Cargo, local e validade."
        valid={!!role && !!until && !dup}
        missing={[!role && "Cargo", !until && "Válido até"].filter((x): x is string => !!x)}
        submitLabel="Adicionar"
        onSubmit={async () => {
          if (!await upsert("people", { ...p, roles: [...p.roles, { id: newId(), roleId: role, scopeLocationId: scopeId, validUntil: until }] })) return
          toast.success("Cargo adicionado")
          setRole(""); setScope(NONE); setUntil(DEFAULT_UNTIL); setOpen(false)
        }}
      >
        <SelectField label="Cargo" value={role} onChange={setRole} options={state.roleTypes.map((r) => ({ value: r.id, label: r.label }))}
          error={dup ? "Esta pessoa já tem este cargo neste local." : undefined} />
        <SelectField label="Local (opcional)" value={scope} onChange={setScope} options={[{ value: NONE, label: "Sem restrição de local" }, ...places.map((l) => ({ value: l.id, label: locationPath(state.locations, l.id).map((x) => x.name).join(" › ") }))]} />
        <TextField label="Válido até" type="date" value={until} onChange={setUntil} />
      </FormDialog>
    </>
  )
}

function PersonDialog({ existing, now, onClose, onSaved }: { existing: Person | null; now: string; onClose: () => void; onSaved: (p: Person, isNew: boolean) => Promise<void> }) {
  const { state } = useRegistry()
  const [name, setName] = useState(existing?.name ?? "")
  const [company, setCompany] = useState(existing?.company ?? "")
  const tz = state.units[0]?.timezone
  const [empId, setEmpId] = useState(existing?.employeeId ?? "")
  const [login, setLogin] = useState(existing?.login ?? "")
  // The screen picks the last day the account works; the record keeps the instant it stops.
  const [expires, setExpires] = useState(existing?.accountExpires ? accountLastDay(existing.accountExpires, tz) : "")
  const [status, setStatus] = useState<Status>(existing?.status ?? "ativo")
  const companies = [...new Set(state.people.map((p) => p.company))]
  const loginFinal = login.trim().toLowerCase()
  const taken = !!loginFinal && state.people.some((p) => p.login?.toLowerCase() === loginFinal && p.id !== existing?.id)
  const badLogin = !!loginFinal && !LOGIN_RE.test(loginFinal)
  // The database takes up to 104; an AD account name (sAMAccountName) only 20. A warning, not a block.
  const adWarning = !badLogin && loginFinal.length > 20 ? "Mais de 20 caracteres: não serve como login do AD." : undefined
  const id = "company-list"

  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={existing ? "Editar pessoa" : "Nova pessoa"} description="Pessoa do cadastro." valid={!!name.trim() && !!company.trim() && !!empId.trim() && !taken && !badLogin}
      missing={[!name.trim() && F.name.label, !company.trim() && F.company.label, !empId.trim() && F.employeeId.label].filter((x): x is string => !!x)}
      onSubmit={async () => {
        const f = { name: name.trim(), company: company.trim(), employeeId: empId.trim(), login: loginFinal || null, accountExpires: loginFinal && expires ? accountExpiresFromLastDay(expires, tz) : null, status }
        await onSaved(existing ? { ...existing, ...f } : { id: newId(), unitId: state.units[0].id, revision: 1, updatedAt: now, origin: "manual", enabled: true, adObjectGuid: null, roles: [], ...f }, !existing)
      }}>
      <TextField label={F.name.label} value={name} onChange={setName} />
      <Field>
        <FieldLabel htmlFor="company">{F.company.label}</FieldLabel>
        <Input id="company" list={id} value={company} onChange={(e) => setCompany(e.target.value)} className="min-h-11 md:min-h-9" />
        <datalist id={id}>{companies.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <TextField label={F.employeeId.label} value={empId} onChange={setEmpId} />
      <TextField label={F.login.label} value={login} onChange={setLogin} placeholder={suggestLogin(name) || "vazio = sem login"} error={taken ? "Este login já existe." : badLogin ? "Use letras sem acento, números e . _ @ - (até 104)." : undefined} description={adWarning} />
      {loginFinal && <TextField label={F.accountExpires.label} type="date" value={expires} onChange={setExpires} description="Último dia em que a conta funciona. Vazio = sem prazo." />}
      {existing && <SelectField label="Situação" value={status} onChange={(v) => setStatus(v as Status)} options={STATUS_OPTIONS} />}
    </FormDialog>
  )
}


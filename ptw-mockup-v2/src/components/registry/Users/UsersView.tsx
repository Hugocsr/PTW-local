import { useMemo, useState } from "react"
import { PlusIcon, UserCogIcon } from "lucide-react"
import { toast } from "sonner"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { accountStateAt } from "@/core/eligibility"
import { userAccess, type UserAccess } from "@/core/userAccess"
import type { AccessProfile } from "@/core/governance"
import { useGroups, useProfiles } from "@/data/hooks"
import { label, locationPath, useRegistry } from "@/registry/store"
import type { Person } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "@/components/work/state"
import { TONE_TEXT } from "@/components/shell/Status"
import { Page, PageHeader } from "@/components/shell/Page"
import { navigate } from "@/components/work/nav"
import { PersonAvatar } from "../common"
import { DataTable } from "../DataTable"
import { AccountMark, PersonDialog } from "../PeopleView"
import { PlantPill, ProfilePill } from "../Groups/shared"
import { AccessDialog } from "./AccessDialog"

const open = (id: string) => navigate(`pessoas/${id}`)

/**
 * SPEC 007 · Usuários (protótipo SGI, seção Acesso): uma linha por pessoa com Ativo, Usuário, Login,
 * Plantas, Perfis, Cargos e "Editar acesso". Perfis vêm só dos grupos (SPEC 002); o modal muda grupos e
 * cargos de uma vez. Clicar no nome abre a página da pessoa (`#pessoas/<id>`).
 */
export function UsersView() {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const groups = useGroups(), profiles = useProfiles()
  const down = sim.serverDown
  const canEdit = sim.canEditRegistry
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Person | null>(null)
  const [confirm, setConfirm] = useState<Person | null>(null)
  const { people, locations } = state
  const allGroups = useMemo(() => groups.items ?? [], [groups.items])
  const allProfiles = useMemo<AccessProfile[]>(() => profiles.items ?? [], [profiles.items])
  const access = useMemo(() => {
    const rootOf = (id: string) => locationPath(locations, id)[0]?.id ?? null
    return new Map(people.map((p) => [p.id, userAccess(p, allGroups, allProfiles, rootOf)]))
  }, [people, locations, allGroups, allProfiles])
  const plants = locations.filter((l) => l.parentId === null).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const plantById = new Map(plants.map((l) => [l.id, l]))
  const of = (p: Person): UserAccess<AccessProfile> => access.get(p.id) ?? { groupIds: [], profiles: [], grants: [], plantIds: [] }
  const groupsUnavailable = groups.error?.code === "PTA13" ? groups.error.message : undefined

  const plantPills = (p: Person) => {
    const ls = of(p).plantIds.map((id) => plantById.get(id)).filter((l) => !!l).sort((a, b) => a.code.localeCompare(b.code))
    return ls.length ? <span className="flex flex-wrap gap-1">{ls.map((l) => <PlantPill key={l.id} code={l.code} name={l.name} />)}</span> : null
  }
  const profilePills = (p: Person) => {
    const ps = of(p).profiles
    return ps.length ? <span className="flex flex-wrap gap-1">{ps.map((x) => <ProfilePill key={x.id} profile={x} />)}</span> : null
  }
  const roleNames = (p: Person) => {
    const names = [...new Set(p.roles.map((r) => r.roleId))].map((id) => ({ id, name: label(state.roleTypes, id), expired: p.roles.filter((r) => r.roleId === id).every((r) => r.validUntil < sim.today) }))
    if (names.length === 0) return null
    return (
      <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
        {names.map((n, i) => <span key={n.id} className={cn(n.expired && TONE_TEXT.attention)}>{n.name}{n.expired ? " (vencido)" : ""}{i < names.length - 1 ? "," : ""}</span>)}
      </span>
    )
  }
  const dash = <span className="text-muted-foreground">—</span>

  return (
    <Page>
      <PageHeader title="Usuários" count={people.length} meta="Quem entra no PTW, com seus grupos, perfis de acesso e cargos de assinatura"
        actions={canEdit ? { primary: { label: "Nova pessoa", icon: PlusIcon, disabled: down, onClick: () => setAdding(true) } } : undefined} />
      {down && <DownBanner now={sim.now} />}
      {canEdit && groups.error && !groupsUnavailable && <p role="alert" className="type-meta text-st-stop-fg">Perfis indisponíveis: {groups.error.message}</p>}
      <DataTable<Person>
        rows={people}
        rowKey={(p) => p.id}
        noun={["resultado", "resultados"]}
        pageSizes={[25, 50, 100]}
        stateKey="usuarios"
        selectFilter={{ label: "Filtrar por planta", allLabel: "Todas as plantas", options: plants.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` })), test: (p, v) => of(p).plantIds.includes(v) }}
        filter={{ label: "Situação", options: [{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }, { value: "sem_login", label: "Sem login" }],
          test: (p, v) => (v === "sem_login" ? !p.login : p.status === v) }}
        searchLabel="Buscar por nome, login ou matrícula"
        searchText={(p) => [p.name, p.login ?? "", p.employeeId, p.company].join(" ")}
        onRowClick={(p) => open(p.id)}
        defaultSort={{ id: "name", dir: "asc" }}
        empty={<Empty><EmptyHeader><EmptyTitle>Nenhum usuário no filtro</EmptyTitle></EmptyHeader></Empty>}
        columns={[
          ...(canEdit ? [{
            id: "active", header: "Ativo", className: "w-16",
            cell: (p: Person) => {
              const fromAD = p.origin === "ad"
              return (
                <span onClick={(e) => e.stopPropagation()} className="flex min-h-11 items-center" title={fromAD ? "Situação vem do AD" : undefined}>
                  <Switch checked={p.status !== "inativo"} disabled={down || fromAD} aria-label={`${p.status === "inativo" ? "Reativar" : "Desativar"} ${p.name}`} onCheckedChange={() => setConfirm(p)} />
                </span>
              )
            },
          }] : []),
          {
            id: "name", header: "Usuário", className: "whitespace-normal", sort: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
            cell: (p) => {
              const acc = accountStateAt(p, sim.now)
              return (
                <button type="button" onClick={(e) => { e.stopPropagation(); open(p.id) }}
                  className={cn("flex min-h-11 w-full items-center gap-2.5 text-left hover:underline focus-visible:underline focus-visible:outline-none", p.status === "inativo" && "opacity-60")}>
                  <PersonAvatar name={p.name} className="size-8 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="type-body font-semibold md:whitespace-nowrap">{p.name}</span>
                    <span className="type-meta">{p.company}</span>
                    {acc !== "ativa" && <span className={cn(acc === "sem_login" && "md:hidden")}><AccountMark state={acc} /></span>}
                    {/* Abaixo de lg, plantas, perfis e cargos vêm para baixo do nome. */}
                    <span className="flex flex-col gap-1 lg:hidden">{plantPills(p)}{profilePills(p)}<span className="type-meta">{roleNames(p)}</span></span>
                  </span>
                </button>
              )
            },
          },
          { id: "login", header: "Login", className: "hidden md:table-cell", cell: (p) => (p.login ? <span className="type-data text-foreground/80">{p.login}</span> : <span className="type-meta">sem login</span>) },
          { id: "plants", header: "Plantas", className: "hidden lg:table-cell", cell: (p) => plantPills(p) ?? dash },
          { id: "profiles", header: "Perfis", className: "hidden whitespace-normal lg:table-cell", cell: (p) => profilePills(p) ?? dash },
          { id: "roles", header: "Cargos", className: "hidden whitespace-normal xl:table-cell", cell: (p) => roleNames(p) ?? dash },
          ...(canEdit ? [{
            id: "actions", header: "Ações", className: "w-20 text-center",
            cell: (p: Person) => (
              <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label={`Editar acesso de ${p.name}`} title="Editar acesso" disabled={down || (!groups.items && !groupsUnavailable)}
                onClick={(e) => { e.stopPropagation(); setEditing(p) }}><UserCogIcon /></Button>
            ),
          }] : []),
        ]}
      />
      {editing && (
        <AccessDialog person={state.people.find((p) => p.id === editing.id) ?? editing} groups={allGroups} profiles={allProfiles} groupsUnavailable={groupsUnavailable}
          onClose={() => setEditing(null)} />
      )}
      {adding && (
        <PersonDialog existing={null} now={now()} onClose={() => setAdding(false)}
          onSaved={async (p) => { if (!await upsert("people", p)) return; toast.success("Pessoa criada", { description: p.name }); setAdding(false); setEditing(p) }} />
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <DialogContent>
          {confirm && (() => {
            const off = confirm.status !== "inativo"
            return <>
              <DialogHeader>
                <DialogTitle>{off ? `Desativar “${confirm.name}”?` : `Reativar “${confirm.name}”?`}</DialogTitle>
                <DialogDescription>{off
                  ? "Ela não entra mais no PTW e não pode assinar. Grupos, cargos e histórico são preservados."
                  : "Ela volta a entrar no PTW, com os grupos e cargos que já tinha."}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setConfirm(null)}>Cancelar</Button>
                <Button variant={off ? "stop" : "default"} className="min-h-11 md:min-h-9" disabled={down}
                  onClick={async () => {
                    const p = confirm
                    if (!await upsert("people", { ...p, status: off ? "inativo" : "ativo" })) return
                    toast.success(off ? "Usuário desativado" : "Usuário reativado", { description: p.name })
                    setConfirm(null)
                  }}>{off ? "Desativar usuário" : "Reativar usuário"}</Button>
              </DialogFooter>
            </>
          })()}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

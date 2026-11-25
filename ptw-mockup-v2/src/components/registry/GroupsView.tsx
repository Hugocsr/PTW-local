import { useMemo, useState } from "react"
import { ArrowLeftIcon, BanIcon, PencilIcon, PlusIcon, RotateCcwIcon, UsersIcon, UsersRoundIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { groupGrants, missingGrants, type GroupInput, type PersonGroup } from "@/core/governance"
import { useGroups, useProfiles } from "@/data/hooks"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { navigate } from "@/components/work/nav"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { AddMembersDialog, GroupDialog, groupInput } from "./Groups/GroupDialog"
import { GrantPill, PlantPill, ProfilePill, initialsOf } from "./Groups/shared"

type Filter = "ativos" | "inativos" | "todos"
type Confirm = { kind: "status"; group: PersonGroup } | { kind: "member"; group: PersonGroup; personId: string }

/**
 * Grupos (SPEC 002, protótipo SGI "Grupos SGI"): lista à esquerda (ícone, nome, nº de membros, perfil),
 * detalhe à direita (perfis, plantas, permissões concedidas, membros com "+ Adicionar"). Os perfis ativos
 * do grupo dão aos membros as permissões de sessão. Nada é apagado: grupo é desativado. Abaixo de lg,
 * lista → detalhe. `#grupos/<id>` abre um grupo.
 */
export function GroupsView({ tab }: { tab?: string }) {
  const groups = useGroups(), profiles = useProfiles()
  const { state } = useRegistry()
  const sim = useSim()
  const [filter, setFilter] = useState<Filter>("ativos")
  const [editing, setEditing] = useState<PersonGroup | "new" | null>(null)
  const [adding, setAdding] = useState<PersonGroup | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const canEdit = sim.canEditRegistry
  const down = sim.serverDown || groups.busy
  const all = useMemo(() => groups.items ?? [], [groups.items])
  const list = all.filter((g) => filter === "todos" || (filter === "ativos") === g.active)
  const selected = all.find((g) => g.id === tab) ?? null
  const profileById = new Map((profiles.items ?? []).map((p) => [p.id, p]))
  const open = (id: string | null) => navigate(id ? `grupos/${id}` : "grupos")
  const save = async (input: GroupInput, revision: number | null, message: string) => {
    const r = await groups.save(input, revision)
    if (r) { toast.success(message); setEditing(null); setAdding(null); setConfirm(null); profiles.reload(); if (revision === null) open(r.id) }
  }
  const locked = (g: PersonGroup) => missingGrants(groupGrants(g.profileIds, profiles.items ?? []), sim.grants).length > 0

  const listPanel = (
    <section aria-label="Lista de grupos" className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2) lg:sticky lg:top-20", selected && "max-lg:hidden")}>
      <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2">
        <span className="type-label">Grupos ({list.length})</span>
        <select aria-label="Situação" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="min-h-11 rounded-md border bg-background px-2 text-sm text-muted-foreground md:min-h-8">
          <option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option>
        </select>
      </div>
      <ul className="flex max-h-[calc(100svh-16rem)] flex-col gap-1 overflow-y-auto p-2">
        {groups.items && list.length === 0 && <li className="p-4 text-center type-meta">Nenhum grupo no filtro.</li>}
        {list.map((g) => {
          const first = profileById.get(g.profileIds[0])
          return (
            <li key={g.id}>
              <button type="button" onClick={() => open(g.id)} aria-current={selected?.id === g.id ? "true" : undefined}
                className={cn("flex min-h-16 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                  selected?.id === g.id && "border-primary/30 bg-primary-soft", !g.active && "opacity-60")}>
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white"><UsersRoundIcon className="size-[1.125rem]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-body font-semibold">{g.name}</span>
                  <span className="block type-meta">{g.memberIds.length} membro(s){g.active ? "" : " · inativo"}</span>
                </span>
                {first && <span className="flex shrink-0 items-center gap-1"><ProfilePill profile={first} className="max-w-32" />{g.profileIds.length > 1 && <span className="type-meta">+{g.profileIds.length - 1}</span>}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )

  return (
    <Page className="max-w-[80rem]">
      <PageHeader title="Grupos SGI" meta="Agrupamento de usuários por papel — base para perfis de acesso e notificações"
        actions={canEdit ? { primary: { label: "Novo grupo", icon: PlusIcon, disabled: down || !groups.items, onClick: () => setEditing("new") } } : undefined} />
      {groups.error && !editing && !adding && <p role="alert" className="rounded-md border border-st-stop-border bg-st-stop-surface px-3 py-2 type-body text-st-stop-fg">{groups.error.message}</p>}
      {!groups.items && !groups.error && <p role="status" className="type-body">Carregando grupos…</p>}
      {groups.items && all.length === 0 ? (
        <Empty className="rounded-lg border bg-card py-12">
          <EmptyHeader><EmptyMedia variant="icon"><UsersIcon /></EmptyMedia><EmptyTitle>Nenhum grupo</EmptyTitle><EmptyDescription>Crie um grupo para organizar pessoas e conceder perfis de acesso.</EmptyDescription></EmptyHeader>
          {canEdit && <EmptyContent><Button disabled={down} onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />Novo grupo</Button></EmptyContent>}
        </Empty>
      ) : groups.items && (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          {listPanel}
          {selected ? (
            <GroupDetail group={selected} canEdit={canEdit} down={down} locked={locked(selected)} profileById={profileById}
              onBack={() => open(null)} onEdit={() => setEditing(selected)} onAdd={() => setAdding(selected)}
              onToggle={() => setConfirm({ kind: "status", group: selected })} onRemove={(personId) => setConfirm({ kind: "member", group: selected, personId })} />
          ) : (
            <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed bg-card/50 p-6 text-center type-meta max-lg:hidden">Escolha um grupo na lista.</p>
          )}
        </div>
      )}
      {editing && <GroupDialog group={editing === "new" ? null : editing} profiles={profiles.items ?? []} error={groups.error?.message} busy={down}
        onClose={() => { setEditing(null); groups.clearError() }} onSave={(g, rev) => save(g, rev, rev === null ? "Grupo criado." : "Grupo salvo.")} />}
      {adding && <AddMembersDialog group={adding} error={groups.error?.message} busy={down} onClose={() => { setAdding(null); groups.clearError() }}
        onAdd={(ids) => save({ ...groupInput(adding), memberIds: [...adding.memberIds, ...ids] }, adding.revision, ids.length === 1 ? "Membro adicionado." : "Membros adicionados.")} />}
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !groups.busy) { setConfirm(null); groups.clearError() } }}>
        <DialogContent>
          {confirm && (() => {
            const g = confirm.group
            const person = confirm.kind === "member" ? state.people.find((p) => p.id === confirm.personId) : null
            const title = confirm.kind === "member" ? `Remover ${person?.name ?? "a pessoa"} do grupo?` : g.active ? `Desativar “${g.name}”?` : `Reativar “${g.name}”?`
            const desc = confirm.kind === "member" ? "Ela deixa de receber as permissões deste grupo na próxima ação." : g.active ? "O grupo deixa de conceder permissões. Membros e histórico continuam e ele pode ser reativado." : "Os membros voltam a receber as permissões dos perfis do grupo."
            const input = confirm.kind === "member" ? { ...groupInput(g), memberIds: g.memberIds.filter((id) => id !== confirm.personId) } : { ...groupInput(g), active: !g.active }
            return <>
              <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
              {groups.error && <p role="alert" className="type-body text-st-stop-fg">{groups.error.message}</p>}
              <DialogFooter>
                <Button variant="outline" className="min-h-11 md:min-h-9" disabled={groups.busy} onClick={() => { setConfirm(null); groups.clearError() }}>Cancelar</Button>
                <Button variant={confirm.kind === "status" && !g.active ? "default" : "stop"} className="min-h-11 md:min-h-9" disabled={down}
                  onClick={() => void save(input, g.revision, confirm.kind === "member" ? "Membro removido." : g.active ? "Grupo desativado." : "Grupo reativado.")}>
                  {confirm.kind === "member" ? "Remover" : g.active ? "Desativar" : "Reativar"}
                </Button>
              </DialogFooter>
            </>
          })()}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function GroupDetail({ group: g, canEdit, down, locked, profileById, onBack, onEdit, onAdd, onToggle, onRemove }: {
  group: PersonGroup; canEdit: boolean; down: boolean; locked: boolean; profileById: Map<string, import("@/core/governance").AccessProfile>
  onBack: () => void; onEdit: () => void; onAdd: () => void; onToggle: () => void; onRemove: (personId: string) => void
}) {
  const { state } = useRegistry()
  const grants = groupGrants(g.profileIds, [...profileById.values()])
  const plants = g.plantIds.map((id) => state.locations.find((l) => l.id === id)).filter((l) => !!l)
  const members = g.memberIds.map((id) => state.people.find((p) => p.id === id)).filter((p) => !!p).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const writable = canEdit && !locked
  return (
    <section aria-labelledby="grupo-h" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">
      <header className="flex flex-col gap-3 border-b p-4 md:p-5">
        <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground lg:hidden" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Grupos SGI</Button>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <h2 id="grupo-h" className="text-xl leading-7 font-semibold break-words">{g.name}</h2>
            {g.profileIds.map((id) => profileById.get(id)).filter((p) => !!p).map((p) => <ProfilePill key={p.id} profile={p} />)}
            {!g.active && <span className="rounded-full border bg-st-neutral-surface px-2 py-0.5 text-[0.6875rem] font-semibold text-st-neutral-fg uppercase">inativo</span>}
          </div>
          {canEdit && (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" size="sm" className="min-h-11 flex-1 md:min-h-9 sm:flex-none" disabled={down || !writable} onClick={onEdit}><PencilIcon data-icon="inline-start" />Editar grupo</Button>
              <Button variant="outline" size="sm" disabled={down || !writable} onClick={onToggle}
                className={cn("min-h-11 flex-1 md:min-h-9 sm:flex-none", g.active ? "border-st-stop-solid text-st-stop-fg hover:bg-st-stop-surface" : "border-st-ok-solid text-st-ok-fg hover:bg-st-ok-surface")}>
                {g.active ? <BanIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}{g.active ? "Desativar" : "Reativar"}
              </Button>
            </div>
          )}
        </div>
        {g.description && <p className="type-body text-muted-foreground">{g.description}</p>}
        {plants.length > 0 && <div className="flex flex-wrap gap-1.5" aria-label="Plantas">{plants.map((l) => <PlantPill key={l.id} code={l.code} name={l.name} />)}</div>}
        {canEdit && locked && <p className="type-meta text-st-attention-fg">Este grupo concede permissões que você não tem: só quem as tem pode alterá-lo.</p>}
      </header>
      <div className="flex flex-col gap-2 border-b px-4 py-3 md:px-5">
        <h3 className="type-label">Permissões concedidas</h3>
        {grants.length && g.active ? <div className="flex flex-wrap gap-1.5">{grants.map((x) => <GrantPill key={x} grant={x} />)}</div>
          : <p className="type-meta">{g.active ? "Este grupo não concede permissões de acesso." : "Grupo inativo: não concede permissões."}</p>}
      </div>
      <div className="flex flex-col gap-3 p-4 md:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="type-label">Membros</h3>
          {canEdit && <Button variant="outline" size="sm" className="min-h-11 text-primary hover:text-primary md:min-h-8" disabled={down || !writable} onClick={onAdd}><PlusIcon data-icon="inline-start" />Adicionar membro</Button>}
        </div>
        {members.length === 0 ? <p className="rounded-md bg-muted/60 p-4 text-center type-meta">Nenhum membro.</p> : (
          <ul className="flex flex-col gap-1.5">
            {members.map((p) => (
              <li key={p.id} className="flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2.5">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{initialsOf(p.name)}</span>
                <a href={`#pessoas/${p.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate type-body font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.login ?? "contato · não entra no sistema"}</span>
                </a>
                {canEdit && <Button variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground hover:text-st-stop-fg md:size-8" aria-label={`Remover ${p.name} do grupo`} title="Remover do grupo" disabled={down || !writable} onClick={() => onRemove(p.id)}><XIcon /></Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

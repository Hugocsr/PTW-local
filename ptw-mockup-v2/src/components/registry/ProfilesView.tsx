import { useId, useMemo, useState } from "react"
import { ArrowLeftIcon, BanIcon, KeyRoundIcon, PencilIcon, PlusIcon, RotateCcwIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { GRANTS, GRANT_INFO, missingGrants, profileProblems, type AccessProfile, type AccessProfileInput, type Grant } from "@/core/governance"
import { useGroups, useProfiles } from "@/data/hooks"
import { uuidv7 } from "@/lib/id"
import { cn } from "@/lib/utils"
import { useSim } from "@/sim/SimProvider"
import { navigate } from "@/components/work/nav"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { FormDialog, TextField } from "./forms"
import { GrantPill, ProfilePill } from "./Groups/shared"

type Filter = "ativos" | "inativos" | "todos"
const toInput = (p: AccessProfile): AccessProfileInput => ({ id: p.id, name: p.name, description: p.description, permissions: [...p.permissions], active: p.active })

/**
 * Perfis de acesso (SPEC 002): conjuntos nomeados das permissões de sessão. Um perfil só vale por um grupo
 * ativo; quem tem Gestão de cadastros cria e edita, e só concede o que já tem (regra 9). Todos consultam.
 * Nada é apagado: perfil é desativado. `#perfis/<id>` abre um perfil.
 */
export function ProfilesView({ tab }: { tab?: string }) {
  const profiles = useProfiles(), groups = useGroups()
  const sim = useSim()
  const [filter, setFilter] = useState<Filter>("ativos")
  const [editing, setEditing] = useState<AccessProfile | "new" | null>(null)
  const [toggling, setToggling] = useState<AccessProfile | null>(null)
  const canEdit = sim.canEditRegistry
  const down = sim.serverDown || profiles.busy
  const all = useMemo(() => profiles.items ?? [], [profiles.items])
  const list = all.filter((p) => filter === "todos" || (filter === "ativos") === p.active)
  const selected = all.find((p) => p.id === tab) ?? null
  const open = (id: string | null) => navigate(id ? `perfis/${id}` : "perfis")
  const save = async (input: AccessProfileInput, revision: number | null, message: string) => {
    const r = await profiles.save(input, revision)
    if (r) { toast.success(message); setEditing(null); setToggling(null); void groups.reload(); if (revision === null) open(r.id) }
  }
  const groupName = (id: string) => groups.items?.find((g) => g.id === id)?.name

  return (
    <Page className="max-w-[80rem]">
      <PageHeader title="Perfis de acesso" meta="Conjuntos de permissões concedidos às pessoas pelos grupos"
        actions={canEdit ? { primary: { label: "Novo perfil", icon: PlusIcon, disabled: down || !profiles.items, onClick: () => setEditing("new") } } : undefined} />
      {profiles.error && !editing && !toggling && <p role="alert" className="rounded-md border border-st-stop-border bg-st-stop-surface px-3 py-2 type-body text-st-stop-fg">{profiles.error.message}</p>}
      {!profiles.items && !profiles.error && <p role="status" className="type-body">Carregando perfis…</p>}
      {profiles.items && all.length === 0 ? (
        <Empty className="rounded-lg border bg-card py-12">
          <EmptyHeader><EmptyMedia variant="icon"><ShieldCheckIcon /></EmptyMedia><EmptyTitle>Nenhum perfil</EmptyTitle><EmptyDescription>Crie um perfil e associe-o a um grupo para conceder permissões.</EmptyDescription></EmptyHeader>
          {canEdit && <EmptyContent><Button disabled={down} onClick={() => setEditing("new")}><PlusIcon data-icon="inline-start" />Novo perfil</Button></EmptyContent>}
        </Empty>
      ) : profiles.items && (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
          <section aria-label="Lista de perfis" className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2) lg:sticky lg:top-20", selected && "max-lg:hidden")}>
            <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2">
              <span className="type-label">Perfis ({list.length})</span>
              <select aria-label="Situação" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="min-h-11 rounded-md border bg-background px-2 text-sm text-muted-foreground md:min-h-8">
                <option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option>
              </select>
            </div>
            <ul className="flex max-h-[calc(100svh-16rem)] flex-col gap-1 overflow-y-auto p-2">
              {list.length === 0 && <li className="p-4 text-center type-meta">Nenhum perfil no filtro.</li>}
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => open(p.id)} aria-current={selected?.id === p.id ? "true" : undefined}
                    className={cn("flex min-h-16 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
                      selected?.id === p.id && "border-primary/30 bg-primary-soft", !p.active && "opacity-60")}>
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-white"><ShieldCheckIcon className="size-[1.125rem]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate type-body font-semibold">{p.name}</span>
                      <span className="block type-meta">{p.permissions.length} permissão(ões) · {p.peopleCount} pessoa(s){p.active ? "" : " · inativo"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected ? (
            <ProfileDetail profile={selected} canEdit={canEdit} down={down} grants={sim.grants} groupName={groupName}
              onBack={() => open(null)} onEdit={() => setEditing(selected)} onToggle={() => setToggling(selected)} />
          ) : (
            <p className="flex min-h-40 items-center justify-center rounded-lg border border-dashed bg-card/50 p-6 text-center type-meta max-lg:hidden">Escolha um perfil na lista.</p>
          )}
        </div>
      )}
      {editing && <ProfileDialog profile={editing === "new" ? null : editing} error={profiles.error?.message} busy={down}
        onClose={() => { setEditing(null); profiles.clearError() }} onSave={(p, rev) => save(p, rev, rev === null ? "Perfil criado." : "Perfil salvo.")} />}
      <Dialog open={!!toggling} onOpenChange={(o) => { if (!o && !profiles.busy) { setToggling(null); profiles.clearError() } }}>
        <DialogContent>
          {toggling && <>
            <DialogHeader>
              <DialogTitle>{toggling.active ? `Desativar “${toggling.name}”?` : `Reativar “${toggling.name}”?`}</DialogTitle>
              <DialogDescription>{toggling.active
                ? `${toggling.peopleCount} ${toggling.peopleCount === 1 ? "pessoa perde" : "pessoas perdem"} as permissões deste perfil na próxima ação, salvo se as tiverem por outro caminho. O perfil continua nos grupos e pode ser reativado.`
                : `Os membros dos ${toggling.groupIds.length} grupos que usam o perfil voltam a receber as permissões dele.`}</DialogDescription>
            </DialogHeader>
            {profiles.error && <p role="alert" className="type-body text-st-stop-fg">{profiles.error.message}</p>}
            <DialogFooter>
              <Button variant="outline" className="min-h-11 md:min-h-9" disabled={profiles.busy} onClick={() => { setToggling(null); profiles.clearError() }}>Cancelar</Button>
              <Button variant={toggling.active ? "stop" : "default"} className="min-h-11 md:min-h-9" disabled={down}
                onClick={() => void save({ ...toInput(toggling), active: !toggling.active }, toggling.revision, toggling.active ? "Perfil desativado." : "Perfil reativado.")}>
                {toggling.active ? "Desativar" : "Reativar"}
              </Button>
            </DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </Page>
  )
}

function ProfileDetail({ profile: p, canEdit, down, grants, groupName, onBack, onEdit, onToggle }: {
  profile: AccessProfile; canEdit: boolean; down: boolean; grants: readonly string[]; groupName: (id: string) => string | undefined
  onBack: () => void; onEdit: () => void; onToggle: () => void
}) {
  const missing = missingGrants(p.permissions, grants)
  const writable = canEdit && missing.length === 0
  return (
    <section aria-labelledby="perfil-h" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">
      <header className="flex flex-col gap-2 border-b p-4 md:p-5">
        <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground lg:hidden" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Perfis de acesso</Button>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="perfil-h" className="text-xl leading-7 font-semibold break-words">{p.name}</h2>
          <ProfilePill profile={p} />
          {!p.active && <span className="rounded-full bg-st-neutral-surface px-2.5 py-0.5 type-meta font-semibold text-st-neutral-fg">inativo</span>}
          {canEdit && (
            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
              <Button variant="outline" size="sm" className="min-h-11 flex-1 md:min-h-9 sm:flex-none" disabled={down || !writable} onClick={onEdit}><PencilIcon data-icon="inline-start" />Editar perfil</Button>
              <Button variant="outline" size="sm" disabled={down || !writable} onClick={onToggle}
                className={cn("min-h-11 flex-1 md:min-h-9 sm:flex-none", p.active ? "border-st-stop-solid text-st-stop-fg hover:bg-st-stop-surface" : "border-st-ok-solid text-st-ok-fg hover:bg-st-ok-surface")}>
                {p.active ? <BanIcon data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}{p.active ? "Desativar" : "Reativar"}
              </Button>
            </div>
          )}
        </div>
        {p.description && <p className="type-body text-muted-foreground">{p.description}</p>}
        {canEdit && missing.length > 0 && <p className="type-meta text-st-attention-fg">Este perfil concede {missing.map((g) => GRANT_INFO[g].label).join(", ")}, que você não tem: só quem tem pode alterá-lo.</p>}
      </header>
      <div className="flex flex-col gap-2 border-b p-4 md:px-5">
        <h3 className="type-label">Permissões</h3>
        <ul className="flex flex-col gap-1.5">
          {p.permissions.map((g) => (
            <li key={g} className="flex flex-col gap-0.5 rounded-md border px-3 py-2">
              <GrantPill grant={g} className="w-fit" />
              <span className="type-meta">{GRANT_INFO[g].unlocks}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 p-4 md:p-5">
        <h3 className="type-label">Usado por {p.groupIds.length} {p.groupIds.length === 1 ? "grupo" : "grupos"} · {p.peopleCount} {p.peopleCount === 1 ? "pessoa" : "pessoas"}</h3>
        {p.groupIds.length === 0 ? <p className="rounded-md bg-muted/60 p-4 text-center type-meta">Nenhum grupo usa este perfil: ele não concede nada a ninguém.</p> : (
          <ul className="flex flex-wrap gap-1.5">
            {p.groupIds.map((id) => <li key={id}><a href={`#grupos/${id}`} className="inline-flex min-h-9 items-center rounded-md border px-3 type-body hover:bg-muted/50">{groupName(id) ?? "Grupo"}</a></li>)}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Novo perfil / Editar perfil: nome, descrição, as 4 permissões (só as que a pessoa tem podem mudar) e, ao editar, ativo. */
function ProfileDialog({ profile, error, busy, onSave, onClose }: {
  profile: AccessProfile | null; error?: string; busy: boolean
  onSave: (p: AccessProfileInput, revision: number | null) => Promise<void>; onClose: () => void
}) {
  const { grants } = useSim()
  const [draft, setDraft] = useState<AccessProfileInput>(() => profile ? toInput(profile) : { id: uuidv7(), name: "", description: "", permissions: [], active: true })
  const descId = useId(), activeId = useId()
  const problems = profileProblems(draft)
  const toggle = (g: Grant, on: boolean) => setDraft({ ...draft, permissions: GRANTS.filter((x) => x === g ? on : draft.permissions.includes(x)) })
  const removed = profile ? profile.permissions.filter((g) => !draft.permissions.includes(g)) : []
  return (
    <FormDialog open wide onOpenChange={(o) => !o && onClose()} title={profile ? "Editar perfil" : "Novo perfil"} description="Conjunto de permissões de acesso"
      meta={profile ? `Usado por ${profile.groupIds.length} grupo(s) · ${profile.peopleCount} pessoa(s)` : "Associe o perfil a um grupo para conceder as permissões"}
      valid={!problems.length && !busy} missing={[...(draft.name.trim() ? [] : ["nome"]), ...(draft.permissions.length ? [] : ["ao menos uma permissão"])]}
      submitLabel={profile ? "Salvar alterações" : "Criar perfil"} onSubmit={() => onSave(draft, profile?.revision ?? null)}>
      <TextField label="Nome do perfil" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="Ex.: Gestor de cadastros" maxLength={80} />
      <Field>
        <FieldLabel>Permissões</FieldLabel>
        <ul className="flex flex-col gap-1.5" aria-label="Permissões">
          {GRANTS.map((g) => {
            const mine = grants.includes(g)
            return (
              <li key={g}>
                <label className={cn("flex min-h-12 items-start gap-3 rounded-md border px-3 py-2", mine ? "cursor-pointer hover:bg-muted/40" : "opacity-60")}>
                  <Checkbox checked={draft.permissions.includes(g)} disabled={!mine} onCheckedChange={(v) => toggle(g, !!v)} aria-label={GRANT_INFO[g].label} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 type-body font-semibold"><KeyRoundIcon className="size-3.5 text-primary" aria-hidden />{GRANT_INFO[g].label}</span>
                    <span className="block type-meta">{GRANT_INFO[g].unlocks}{mine ? "" : " · você não tem esta permissão"}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </Field>
      <Field>
        <FieldLabel htmlFor={descId}>Descrição</FieldLabel>
        <Textarea id={descId} maxLength={500} placeholder="Para quem é este perfil…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      {profile && (
        <div className="flex items-start gap-3">
          <Switch id={activeId} checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} className="mt-0.5" />
          <label htmlFor={activeId} className="text-sm font-semibold">Perfil ativo<span className="block type-meta font-normal">Inativo não concede permissões; continua nos grupos.</span></label>
        </div>
      )}
      {profile && profile.peopleCount > 0 && (removed.length > 0 || (profile.active && !draft.active)) && (
        <p role="note" className="flex gap-2 rounded-md border border-st-attention-border bg-st-attention-surface px-3 py-2 type-body text-st-attention-fg">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {profile.peopleCount} {profile.peopleCount === 1 ? "pessoa perde" : "pessoas perdem"} {!draft.active ? "as permissões deste perfil" : removed.map((g) => GRANT_INFO[g].label).join(", ")} na próxima ação, salvo se tiverem por outro caminho.
        </p>
      )}
      {error && <p role="alert" className="type-body text-st-stop-fg">{error}</p>}
    </FormDialog>
  )
}

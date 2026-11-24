import { useState } from "react"
import { PlusIcon, RefreshCwIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"
import { groupProblems, type GroupInput, type PersonGroup } from "@/core/governance"
import { uuidv7 } from "@/lib/id"
import { useGroups } from "@/data/hooks"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DataTable } from "./DataTable"

export function GroupsView() {
  const groups = useGroups(), { serverDown } = useSim()
  const [editing, setEditing] = useState<PersonGroup | "new" | null>(null)
  return <Page>
    <PageHeader title="Grupos de pessoas" count={groups.items?.length} meta="Organize participantes. Grupos não concedem cargos técnicos nem permissões administrativas."
      actions={{ primary: { label: "Novo grupo", icon: PlusIcon, disabled: serverDown || groups.busy || !groups.items, onClick: () => setEditing("new") }, secondary: [{ label: "Atualizar", icon: RefreshCwIcon, disabled: groups.busy, onClick: () => void groups.reload() }] }} />
    {groups.error && <p role="alert" className="type-body">{groups.error.message}</p>}
    {!groups.items && !groups.error && <p role="status" className="type-body">Carregando grupos…</p>}
    {groups.items && <DataTable<PersonGroup> rows={groups.items} rowKey={(g) => g.id} noun={["grupo", "grupos"]} searchLabel="Buscar grupo" searchText={(g) => `${g.name} ${g.description}`} onRowClick={setEditing} columns={[
      { id: "name", header: "Grupo", cell: (g) => <button className="min-h-11 text-left font-medium hover:underline" onClick={() => setEditing(g)}>{g.name}</button> },
      { id: "members", header: "Membros", cell: (g) => g.memberIds.length },
      { id: "active", header: "Situação", cell: (g) => g.active ? "Ativo" : "Inativo" },
      { id: "revision", header: "Revisão", className: "hidden md:table-cell", cell: (g) => g.revision },
    ]} />}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !groups.busy) setEditing(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editing === "new" ? "Novo grupo" : "Editar grupo"}</DialogTitle><DialogDescription>Membros são associados dentro desta unidade. As alçadas e os cargos continuam nos modelos e no cadastro de pessoas.</DialogDescription></DialogHeader>
      {editing !== null && <GroupEditor key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`} group={editing === "new" ? null : editing} error={groups.error?.message} busy={groups.busy || serverDown} onSave={async (g, revision) => { if (await groups.save(g, revision)) { toast.success("Grupo salvo."); setEditing(null) } }} />}
    </DialogContent></Dialog>
  </Page>
}

function GroupEditor({ group, error, busy, onSave }: { group: PersonGroup | null; error?: string; busy: boolean; onSave: (g: GroupInput, revision: number | null) => Promise<void> }) {
  const { state } = useRegistry()
  const [draft, setDraft] = useState<GroupInput>(() => group ? { id: group.id, name: group.name, description: group.description, active: group.active, memberIds: [...group.memberIds] } : { id: uuidv7(), name: "", description: "", active: true, memberIds: [] })
  const [search, setSearch] = useState("")
  const problems = groupProblems(draft), selected = new Set(draft.memberIds)
  const people = state.people.filter((p) => `${p.name} ${p.login ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
  return <form className="space-y-4 [&_button]:min-h-11 [&_input]:min-h-11 md:[&_button]:min-h-9 md:[&_input]:min-h-9" onSubmit={(e) => { e.preventDefault(); if (!problems.length) void onSave(draft, group?.revision ?? null) }}>
    <fieldset disabled={busy} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="group-name">Nome</Label><Input id="group-name" required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="group-description">Descrição</Label><Textarea id="group-description" maxLength={500} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
      <label className="flex min-h-11 items-center gap-3 type-body"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Grupo ativo</label>
      <div className="space-y-2"><Label htmlFor="group-person-search">Membros · {draft.memberIds.length} selecionados</Label><Input id="group-person-search" placeholder="Buscar pessoa ou login" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="max-h-64 overflow-y-auto rounded-lg border p-2">{people.length ? people.map((p) => <label key={p.id} className="flex min-h-11 items-center gap-3 px-2 py-1 type-body"><input type="checkbox" checked={selected.has(p.id)} onChange={(e) => setDraft({ ...draft, memberIds: e.target.checked ? [...draft.memberIds, p.id] : draft.memberIds.filter((id) => id !== p.id) })} /><span>{p.name}<span className="block type-meta">{p.login ?? "Sem conta"} · {p.enabled ? "Conta habilitada" : "Conta desabilitada"}</span></span></label>) : <p className="p-2 type-meta">Nenhuma pessoa encontrada.</p>}</div>
    </fieldset>
    {error && <p role="alert" className="type-body">{error}</p>}
    {draft.name && problems.map((p) => <p key={p} role="alert" className="type-meta">{p}</p>)}
    <Button type="submit" disabled={busy || problems.length > 0}><SaveIcon />Salvar grupo</Button>
  </form>
}

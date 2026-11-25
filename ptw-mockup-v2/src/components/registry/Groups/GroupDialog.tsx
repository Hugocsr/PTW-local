import { useId, useState } from "react"
import { SearchIcon } from "lucide-react"
import { GRANT_INFO, groupGrants, groupProblems, missingGrants, type AccessProfile, type GroupInput, type PersonGroup } from "@/core/governance"
import { uuidv7 } from "@/lib/id"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormDialog, TextField } from "../forms"
import { PickList } from "../PickList"
import { GrantPill, initialsOf } from "./shared"

const toInput = (g: PersonGroup): GroupInput => ({ id: g.id, name: g.name, description: g.description, active: g.active, memberIds: [...g.memberIds], profileIds: [...g.profileIds], plantIds: [...g.plantIds] })
export { toInput as groupInput }

/**
 * SGI · Novo grupo / Editar grupo: Nome, Perfis (vários), Plantas (várias), Descrição e, ao editar, Ativo.
 * Perfis que a pessoa não pode conceder (faltam permissões dela) não são oferecidos; a lista diz por quê.
 * A prévia mostra o que os membros passam a ter.
 */
export function GroupDialog({ group, profiles, error, busy, onSave, onClose }: {
  group: PersonGroup | null; profiles: AccessProfile[]; error?: string; busy: boolean
  onSave: (g: GroupInput, revision: number | null) => Promise<void>; onClose: () => void
}) {
  const { state } = useRegistry()
  const { grants } = useSim()
  const [draft, setDraft] = useState<GroupInput>(() => group ? toInput(group) : { id: uuidv7(), name: "", description: "", active: true, memberIds: [], profileIds: [], plantIds: [] })
  const descId = useId(), activeId = useId()
  const usable = profiles.filter((p) => p.active && missingGrants(p.permissions, grants).length === 0)
  const blocked = profiles.filter((p) => p.active && missingGrants(p.permissions, grants).length > 0 && !draft.profileIds?.includes(p.id))
  const plants = state.locations.filter((l) => l.parentId === null && l.status !== "inativo")
  const preview = groupGrants(draft.profileIds ?? [], profiles)
  const problems = groupProblems(draft)
  return (
    <FormDialog open wide onOpenChange={(o) => !o && onClose()} title={group ? "Editar grupo" : "Novo grupo"} description="Agrupamento de pessoas por papel"
      meta={group ? "Altere nome, perfis, plantas e descrição" : "Agrupamento de pessoas por papel"} valid={!problems.length && !busy}
      missing={draft.name.trim() ? [] : ["nome"]} submitLabel={group ? "Salvar alterações" : "Criar grupo"} onSubmit={() => onSave(draft, group?.revision ?? null)}>
      <TextField label="Nome do grupo" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="Ex.: Aprovadores Leste" maxLength={80} />
      <Field>
        <FieldLabel>Perfis de acesso</FieldLabel>
        <PickList ariaLabel="Perfis de acesso" addLabel="Adicionar perfil" empty="Sem perfil: o grupo só organiza pessoas"
          options={[...usable, ...profiles.filter((p) => draft.profileIds?.includes(p.id) && !usable.includes(p))].map((p) => ({ id: p.id, label: p.name, detail: p.permissions.map((g) => GRANT_INFO[g].label).join(", "), ...(p.active ? {} : { note: "inativo" }) }))}
          value={draft.profileIds ?? []} onChange={(profileIds) => setDraft({ ...draft, profileIds })} />
        {blocked.length > 0 && <FieldDescription>Não disponíveis para você: {blocked.map((p) => `${p.name} (falta ${missingGrants(p.permissions, grants).map((g) => GRANT_INFO[g].label).join(", ")})`).join("; ")}.</FieldDescription>}
      </Field>
      <Field>
        <FieldLabel>Plantas</FieldLabel>
        <PickList ariaLabel="Plantas" addLabel="Adicionar planta" empty="Nenhuma planta" options={plants.map((l) => ({ id: l.id, label: l.name, detail: l.code }))}
          value={draft.plantIds ?? []} onChange={(plantIds) => setDraft({ ...draft, plantIds })} />
        <FieldDescription>Onde o grupo atua. As permissões valem para a unidade inteira.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={descId}>Descrição</FieldLabel>
        <Textarea id={descId} maxLength={500} placeholder="Finalidade do grupo…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      {group && (
        <div className="flex items-start gap-3">
          <Switch id={activeId} checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} className="mt-0.5" />
          <label htmlFor={activeId} className="text-sm font-semibold">Grupo ativo<span className="block type-meta font-normal">Inativo não concede permissões; membros e histórico continuam.</span></label>
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-md bg-surface-well p-3">
        <p className="type-label">Membros deste grupo passam a ter</p>
        {preview.length ? <div className="flex flex-wrap gap-1.5">{preview.map((g) => <GrantPill key={g} grant={g} />)}</div> : <p className="type-meta">Nenhuma permissão de acesso (só organização).</p>}
      </div>
      {error && <p role="alert" className="type-body text-st-stop-fg">{error}</p>}
    </FormDialog>
  )
}

/** "+ Adicionar membro": busca e seleção de pessoas ativas que ainda não estão no grupo. */
export function AddMembersDialog({ group, error, busy, onAdd, onClose }: { group: PersonGroup; error?: string; busy: boolean; onAdd: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const { state } = useRegistry()
  const [q, setQ] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const people = state.people.filter((p) => p.status !== "inativo" && !group.memberIds.includes(p.id))
    .filter((p) => `${p.name} ${p.login ?? ""} ${p.company}`.toLocaleLowerCase("pt-BR").includes(q.trim().toLocaleLowerCase("pt-BR")))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Adicionar membros" description="Selecione pessoas para incluir no grupo"
      meta={`Grupo ${group.name}`} valid={picked.length > 0 && !busy} missing={["ao menos uma pessoa"]}
      submitLabel={picked.length ? `Adicionar ${picked.length}` : "Adicionar"} onSubmit={() => onAdd(picked)}>
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Buscar pessoa ou login" placeholder="Buscar pessoa ou login" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 pl-9 md:min-h-9" />
      </div>
      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-md border" aria-label="Pessoas">
        {people.length === 0 && <li className="p-4 text-center type-meta">Ninguém para adicionar.</li>}
        {people.map((p) => (
          <li key={p.id} className="border-b last:border-b-0">
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
              <Checkbox checked={picked.includes(p.id)} onCheckedChange={(v) => setPicked((x) => v ? [...x, p.id] : x.filter((id) => id !== p.id))} aria-label={p.name} />
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[0.6875rem] font-semibold text-white">{initialsOf(p.name)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate type-body font-medium">{p.name}</span><span className="block truncate type-meta">{p.login ?? "contato · não entra no sistema"}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="type-body text-st-stop-fg">{error}</p>}
    </FormDialog>
  )
}

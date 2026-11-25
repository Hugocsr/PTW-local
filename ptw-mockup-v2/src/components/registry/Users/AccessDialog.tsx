import { useMemo, useState } from "react"
import { CheckIcon, LockIcon, PlusIcon, UserCogIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { GRANT_INFO, type AccessProfile, type PersonGroup } from "@/core/governance"
import { accessOfGroups, groupLocked, membershipChanges } from "@/core/userAccess"
import { useAccessAssignments } from "@/data/hooks"
import { cn } from "@/lib/utils"
import { label, locationPath, newId, useRegistry } from "@/registry/store"
import type { Person, RoleAssignment } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { FormDialog, SelectField, TextField } from "../forms"
import { Validity } from "../HierarchyView"
import { GrantPill, PlantPill, ProfilePill } from "../Groups/shared"

const NONE = "__none"
const DEFAULT_UNTIL = "2026-12-31"

/**
 * SPEC 007 · "Acesso do usuário" (o "Editar usuário" do SGI): grupos (que dão os perfis) e cargos da pessoa
 * num modal só, com o resumo do que ela passa a ter. Nada é gravado antes de "Salvar alterações"; com a
 * API, grupos e cargos vão juntos (`PUT /people/{id}/access-assignments`, tudo ou nada). Sem a API (memória)
 * os grupos não existem e só os cargos são gravados, como na página da pessoa.
 */
export function AccessDialog({ person, groups, profiles, groupsUnavailable, onClose }: {
  person: Person; groups: PersonGroup[]; profiles: AccessProfile[]; groupsUnavailable?: string; onClose: () => void
}) {
  const { state, upsert } = useRegistry()
  const sim = useSim()
  const assignments = useAccessAssignments()
  const initialGroups = useMemo(() => new Set(groups.filter((g) => g.memberIds.includes(person.id)).map((g) => g.id)), [groups, person.id])
  const [chosen, setChosen] = useState<Set<string>>(initialGroups)
  const [roles, setRoles] = useState<RoleAssignment[]>(person.roles)
  const [discarding, setDiscarding] = useState(false)
  const [role, setRole] = useState("")
  const [scope, setScope] = useState(NONE)
  const [until, setUntil] = useState(DEFAULT_UNTIL)

  const changes = membershipChanges(person.id, groups, chosen)
  const rolesChanged = JSON.stringify(roles) !== JSON.stringify(person.roles)
  const dirty = changes.length > 0 || rolesChanged
  const rootOf = (id: string) => locationPath(state.locations, id)[0]?.id ?? null
  const preview = accessOfGroups(chosen, groups, profiles)
  const plantOf = (id: string) => state.locations.find((l) => l.id === id)
  // Inativo só aparece se a pessoa ainda está nele (para poder tirá-la); não se entra em grupo inativo.
  const shown = groups.filter((g) => g.active || initialGroups.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const places = state.locations.filter((l) => l.status !== "inativo")
  const scopeName = (loc: string | null) => (loc ? locationPath(state.locations, loc).map((l) => l.name).join(" › ") : "Sem restrição de local")
  const scopeId = scope === NONE ? null : scope
  const dup = !!role && roles.some((r) => r.roleId === role && r.scopeLocationId === scopeId)

  const toggle = (id: string) => setChosen((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const addRole = () => {
    if (!role || !until || dup) return
    setRoles([...roles, { id: newId(), roleId: role, scopeLocationId: scopeId, validUntil: until }])
    setRole(""); setScope(NONE); setUntil(DEFAULT_UNTIL)
  }
  const save = async () => {
    if (groupsUnavailable) {
      if (await upsert("people", { ...person, roles })) { toast.success("Acesso salvo", { description: person.name }); onClose() }
      return
    }
    const r = await assignments.save(person.id, person.revision, { groups: changes, ...(rolesChanged ? { roles } : {}) })
    if (r) { toast.success("Acesso salvo", { description: person.name }); onClose() }
  }

  return (
    <FormDialog open wide onOpenChange={(o) => { if (!o) { if (dirty && !discarding) setDiscarding(true); else onClose() } }}
      title="Acesso do usuário" description={`Grupos, perfis e cargos de ${person.name}`}
      meta={<span className="flex items-center gap-2"><UserCogIcon className="size-4 text-primary" aria-hidden /><span className="font-medium text-foreground">{person.name}</span>{person.login ? <span className="font-mono">{person.login}</span> : <span>sem login</span>}</span>}
      valid={dirty && !assignments.busy} submitLabel="Salvar alterações" missing={dirty ? [] : ["alguma alteração"]} onSubmit={save}>
      {discarding && (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-st-attention-border bg-st-attention-surface p-3 sm:flex-row sm:items-center">
          <p className="flex-1 type-body text-st-attention-fg">Há alterações não salvas.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setDiscarding(false)}>Continuar editando</Button>
            <Button type="button" variant="stop" size="sm" className="min-h-11 md:min-h-8" onClick={onClose}>Descartar</Button>
          </div>
        </div>
      )}

      <Field>
        <FieldLabel id="acesso-grupos">Grupos</FieldLabel>
        {groupsUnavailable ? <FieldDescription>{groupsUnavailable}</FieldDescription>
          : !person.login ? <FieldDescription>Defina um login para dar perfis: perfil só vale numa sessão do PTW.</FieldDescription>
          : shown.length === 0 ? <FieldDescription>Nenhum grupo ativo. Crie em Acesso › Grupos SGI.</FieldDescription>
          : (
            <div role="group" aria-labelledby="acesso-grupos" className="flex flex-wrap gap-2">
              {shown.map((g) => {
                const on = chosen.has(g.id)
                const missing = groupLocked(g, profiles, sim.grants)
                const blockedJoin = !g.active && !on
                const locked = missing.length > 0 || blockedJoin
                const why = missing.length ? `Seu acesso não permite conceder este perfil (falta ${missing.map((x) => GRANT_INFO[x].label).join(", ")})` : blockedJoin ? "Grupo inativo" : undefined
                const firstProfile = g.profileIds.map((id) => profileById.get(id)).find((p) => !!p)
                return (
                  <button key={g.id} type="button" aria-pressed={on} disabled={locked} title={why}
                    onClick={() => toggle(g.id)}
                    className={cn("inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring md:min-h-9",
                      on ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      locked && "cursor-not-allowed opacity-60")}>
                    {on ? <CheckIcon className="size-3.5 shrink-0" aria-hidden /> : locked ? <LockIcon className="size-3.5 shrink-0" aria-hidden /> : null}
                    <span className="truncate">{g.name}</span>
                    {firstProfile && <><span aria-hidden>·</span><ProfilePill profile={firstProfile} className="max-w-32" /></>}
                    {g.profileIds.length > 1 && <span className="type-meta">+{g.profileIds.length - 1}</span>}
                    {!g.active && <span className="type-meta">(inativo)</span>}
                    {why && <span className="sr-only">: {why}</span>}
                  </button>
                )
              })}
            </div>
          )}
      </Field>

      {!groupsUnavailable && person.login && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-well p-3" aria-live="polite">
          <p className="type-label">Com isso, terá</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-meta">Perfis:</span>
            {preview.profiles.length ? preview.profiles.map((p) => <ProfilePill key={p.id} profile={p} />) : <span className="type-meta">nenhum</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-meta">Permissões:</span>
            {preview.grants.length ? preview.grants.map((g) => <GrantPill key={g} grant={g} />) : <span className="type-meta">nenhuma (emite e assina conforme os cargos)</span>}
          </div>
          {preview.plantIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-meta">Plantas dos grupos:</span>
              {preview.plantIds.map((id) => plantOf(id)).filter((l) => !!l).map((l) => <PlantPill key={l.id} code={l.code} name={l.name} />)}
            </div>
          )}
        </div>
      )}

      <Field>
        <FieldLabel>Cargos</FieldLabel>
        <FieldDescription>O cargo diz o que a pessoa assina, onde e até quando.</FieldDescription>
        {roles.length === 0 ? <p className="type-meta">Nenhum cargo.</p> : (
          <ul className="flex flex-col divide-y rounded-md border" aria-label="Cargos">
            {roles.map((r, i) => {
              const name = label(state.roleTypes, r.roleId)
              const plant = r.scopeLocationId ? plantOf(rootOf(r.scopeLocationId) ?? "") : undefined
              return (
                <li key={r.id ?? `${r.roleId}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="type-body font-medium">{name}</span>
                      {plant && <PlantPill code={plant.code} name={plant.name} />}
                      <Validity until={r.validUntil} today={sim.today} />
                    </span>
                    <span className="type-meta">{scopeName(r.scopeLocationId)}</span>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${name}`} className="size-11 shrink-0 md:size-9" onClick={() => setRoles(roles.filter((_, j) => j !== i))}><XIcon /></Button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-[1fr_1.4fr_10rem_auto] md:items-end">
          <SelectField label="Cargo" value={role} onChange={setRole} options={state.roleTypes.filter((t) => t.active !== false).map((t) => ({ value: t.id, label: t.label }))}
            error={dup ? "Já tem este cargo neste local." : undefined} />
          <SelectField label="Local" value={scope} onChange={setScope} options={[{ value: NONE, label: "Sem restrição de local" }, ...places.map((l) => ({ value: l.id, label: locationPath(state.locations, l.id).map((x) => x.name).join(" › ") }))]} />
          <TextField label="Válido até" type="date" value={until} onChange={setUntil} />
          <Button type="button" variant="outline" className="min-h-11 text-primary md:min-h-9" disabled={!role || !until || dup} onClick={addRole}><PlusIcon data-icon="inline-start" />Cargo</Button>
        </div>
      </Field>

      {assignments.error && <p role="alert" className="type-body text-st-stop-fg">{assignments.error.message}</p>}
    </FormDialog>
  )
}

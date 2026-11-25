// @ts-nocheck — cópia de ptw-mockup-v2/src/core/governance.ts; não edite (node scripts/sync-shared.mjs)
/** The session permissions (`api_session.grants`); a profile is a named set of them (SPEC 002). */
export const GRANTS = ["cadastro", "modelos", "auditoria", "exportacao"] as const
export type Grant = (typeof GRANTS)[number]

/** How each permission reads on screen and what it unlocks. */
export const GRANT_INFO: Record<Grant, { label: string; unlocks: string }> = {
  cadastro: { label: "Gestão de cadastros", unlocks: "Gestão de Ativos, Pessoas, Tipos, Listas, Grupos, Perfis e Delegações" },
  modelos: { label: "Gestão de modelos", unlocks: "Modelos de PT (criar, importar, ativar) e Identidade visual" },
  auditoria: { label: "Auditoria", unlocks: "Tela de Auditoria e verificação da trilha" },
  exportacao: { label: "Exportação de auditoria", unlocks: "Gerar e baixar exportações da trilha" },
}

export interface PersonGroup {
  id: string
  name: string
  description: string
  active: boolean
  memberIds: string[]
  /** Access profiles granted to the members (SPEC 002). */
  profileIds: string[]
  /** Plants the group works in (root locations); shown, permissions stay unit-wide. */
  plantIds: string[]
  revision: number
}

export type GroupInput = Omit<PersonGroup, "revision" | "profileIds" | "plantIds"> & { profileIds?: string[]; plantIds?: string[] }

export interface AccessProfile {
  id: string
  name: string
  description: string
  permissions: Grant[]
  active: boolean
  revision: number
  /** Groups using the profile and people receiving it (unique members of active groups). */
  groupIds: string[]
  peopleCount: number
}
export type AccessProfileInput = Pick<AccessProfile, "id" | "name" | "description" | "permissions" | "active">

/** Where one permission of a person comes from: the directory (LDAP) or a group's profile. */
export interface GrantSource { grant: Grant; from: "diretorio" | "grupo"; groupId?: string; profileId?: string; groupName?: string; profileName?: string }

/** Groups organise people; their active profiles grant session permissions to the members (SPEC 002). */
export function groupProblems(g: GroupInput): string[] {
  const errors: string[] = []
  if (!g.name.trim() || g.name.trim().length > 80) errors.push("Informe um nome com até 80 caracteres.")
  if (g.description.length > 500) errors.push("A descrição aceita até 500 caracteres.")
  if (g.memberIds.length > 1000) errors.push("Um grupo aceita até mil pessoas.")
  if (new Set(g.memberIds).size !== g.memberIds.length) errors.push("A mesma pessoa não pode aparecer duas vezes.")
  if ((g.profileIds?.length ?? 0) > 10) errors.push("Um grupo aceita até 10 perfis.")
  return errors
}

export function profileProblems(p: AccessProfileInput): string[] {
  const errors: string[] = []
  if (!p.name.trim() || p.name.trim().length > 80) errors.push("Informe um nome com até 80 caracteres.")
  if (p.description.length > 500) errors.push("A descrição aceita até 500 caracteres.")
  if (!p.permissions.length) errors.push("Escolha ao menos uma permissão.")
  if (p.permissions.some((g) => !GRANTS.includes(g))) errors.push("Permissão desconhecida.")
  return errors
}

/** Permissions a group grants: the union of its active profiles. */
export function groupGrants(profileIds: readonly string[], profiles: readonly Pick<AccessProfile, "id" | "permissions" | "active">[]): Grant[] {
  const ids = new Set(profileIds)
  const out = new Set<Grant>()
  for (const p of profiles) if (ids.has(p.id) && p.active) for (const g of p.permissions) out.add(g)
  return GRANTS.filter((g) => out.has(g))
}

/** What the actor may not grant or take away: the permissions in `need` the actor does not hold (rule 9). */
export function missingGrants(need: readonly Grant[], actor: readonly string[]): Grant[] {
  return GRANTS.filter((g) => need.includes(g) && !actor.includes(g))
}

/** Sorted union of directory permissions and the ones from groups. */
export function effectiveGrants(directory: readonly string[], sources: readonly GrantSource[]): Grant[] {
  const all = new Set<string>([...directory, ...sources.map((s) => s.grant)])
  return GRANTS.filter((g) => all.has(g))
}

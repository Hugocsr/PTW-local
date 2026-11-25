/**
 * SPEC 007: o acesso de uma pessoa visto na tela de Usuários (formato SGI). Perfis só vêm de grupos ativos
 * (SPEC 002); as plantas somam as dos grupos ativos e a raiz dos locais dos cargos.
 */
import { groupGrants, missingGrants, type AccessProfile, type Grant, type PersonGroup } from "./governance"

type Group = Pick<PersonGroup, "id" | "active" | "memberIds" | "profileIds" | "plantIds">
type Profile = Pick<AccessProfile, "id" | "name" | "permissions" | "active">

export interface UserAccess<P extends Profile = Profile> {
  /** Grupos ativos dos quais a pessoa é membro. */
  groupIds: string[]
  /** Perfis ativos desses grupos, sem repetição, por nome. */
  profiles: P[]
  grants: Grant[]
  /** Plantas: dos grupos ativos e dos cargos (raiz do local; cargo sem local não conta). */
  plantIds: string[]
}

/** O acesso que um conjunto de grupos dá (o resumo "Com isso, terá" do modal usa o mesmo cálculo). */
export function accessOfGroups<P extends Profile>(groupIds: Iterable<string>, groups: readonly Group[], profiles: readonly P[], rolePlantIds: readonly string[] = []): UserAccess<P> {
  const ids = new Set(groupIds)
  const mine = groups.filter((g) => g.active && ids.has(g.id))
  const profileIds = new Set(mine.flatMap((g) => g.profileIds))
  const own = profiles.filter((p) => p.active && profileIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const plants = new Set([...mine.flatMap((g) => g.plantIds), ...rolePlantIds])
  return { groupIds: mine.map((g) => g.id), profiles: own, grants: groupGrants([...profileIds], profiles), plantIds: [...plants] }
}

/** O acesso atual de uma pessoa. `rootOf` dá a planta (local raiz) de um local. */
export function userAccess<P extends Profile>(person: { id: string; roles: readonly { scopeLocationId: string | null }[] }, groups: readonly Group[], profiles: readonly P[], rootOf: (locationId: string) => string | null): UserAccess<P> {
  const member = groups.filter((g) => g.memberIds.includes(person.id)).map((g) => g.id)
  const rolePlants = person.roles.map((r) => (r.scopeLocationId ? rootOf(r.scopeLocationId) : null)).filter((x): x is string => !!x)
  return accessOfGroups(member, groups, profiles, rolePlants)
}

/** Quem edita só mexe na participação em grupos cujos perfis não dão o que ele não tem (42501 no banco). */
export function groupLocked(group: Pick<PersonGroup, "profileIds">, profiles: readonly Profile[], actorGrants: readonly string[]): Grant[] {
  return missingGrants(groupGrants(group.profileIds, profiles), actorGrants)
}

/** O que muda: só os grupos cuja participação mudou, com a revisão lida (corpo da rota da SPEC 007). */
export function membershipChanges(personId: string, groups: readonly Pick<PersonGroup, "id" | "revision" | "memberIds">[], wanted: ReadonlySet<string>): { id: string; revision: number; member: boolean }[] {
  return groups.filter((g) => g.memberIds.includes(personId) !== wanted.has(g.id)).map((g) => ({ id: g.id, revision: g.revision, member: wanted.has(g.id) }))
}


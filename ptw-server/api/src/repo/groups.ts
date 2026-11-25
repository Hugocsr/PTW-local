import type { AccessProfile, AccessProfileInput, GrantSource, GroupInput, PersonGroup } from "../shared/core/governance.js"
import type { Tx } from "../db.js"
import { ApiError, pta } from "../errors/apiError.js"
import type { Schemas } from "../contract/types.js"
import { getPerson, updatePerson } from "./registry/people.js"
import type { SessionInfo } from "../http/state.js"

export async function listGroups(tx: Tx): Promise<PersonGroup[]> {
  return tx<PersonGroup[]>`select g.id, g.name, g.description, g.active, g.revision,
    coalesce((select jsonb_agg(m.person_id order by m.person_id) from ptw.person_group_member m
      where m.unit_id = g.unit_id and m.group_id = g.id), '[]'::jsonb) as "memberIds",
    coalesce((select jsonb_agg(p.profile_id order by p.profile_id) from ptw.person_group_profile p
      where p.unit_id = g.unit_id and p.group_id = g.id), '[]'::jsonb) as "profileIds",
    coalesce((select jsonb_agg(s.location_id order by s.location_id) from ptw.person_group_scope s
      where s.unit_id = g.unit_id and s.group_id = g.id), '[]'::jsonb) as "plantIds"
    from ptw.person_group g where g.unit_id = ptw.current_unit() order by lower(g.name), g.id limit 5000`
}

/** Replaces a join table's set for one group: deletes what left, inserts what arrived (each row audited). */
async function syncSet(tx: Tx, table: "person_group_member" | "person_group_profile" | "person_group_scope", col: "person_id" | "profile_id" | "location_id", groupId: string, ids: string[]) {
  const json = JSON.stringify(ids)
  await tx.unsafe(`delete from ptw.${table} where unit_id = ptw.current_unit() and group_id = $1::uuid
    and ${col} not in (select value::uuid from jsonb_array_elements_text($2::jsonb))`, [groupId, json])
  await tx.unsafe(`insert into ptw.${table} (unit_id, group_id, ${col})
    select ptw.current_unit(), $1::uuid, value::uuid from jsonb_array_elements_text($2::jsonb)
    on conflict do nothing`, [groupId, json])
}

/**
 * SPEC 002, regra 12: quem age sem Gestão de cadastros pelo diretório não pode deixar a unidade sem
 * ninguém com essa permissão por grupo (o diretório é a outra fonte, e ela não muda aqui).
 */
export async function keepAnAdmin(tx: Tx, session: SessionInfo | null | undefined): Promise<void> {
  if (!session || session.directoryGrants.includes("cadastro")) return
  const rows = await tx<{ ok: boolean }[]>`select exists(select 1 from ptw.person p
    where p.unit_id = ptw.current_unit() and exists(select 1 from ptw.person_access_sources(p.unit_id, p.id) s where s.grant_key = 'cadastro')) as ok`
  if (!rows[0]?.ok) throw pta.lastAdmin()
}

export async function saveGroup(tx: Tx, g: GroupInput, revision: number | null, session?: SessionInfo | null): Promise<PersonGroup> {
  if (revision === null) {
    await tx`insert into ptw.person_group (unit_id, id, name, description, active)
      values (ptw.current_unit(), ${g.id}::uuid, ${g.name.trim()}::text, ${g.description}::text, ${g.active}::boolean)`
  } else {
    const rows = await tx<{ revision: number }[]>`select revision from ptw.person_group where unit_id = ptw.current_unit() and id = ${g.id}::uuid for update`
    if (!rows[0]) throw pta.notFound()
    if (rows[0].revision !== revision) throw pta.staleRevision(rows[0].revision)
  }
  // Ordem: perfis antes dos membros (quem entra no grupo é conferido contra os perfis finais);
  // a desativação por último (confere as permissões do grupo como ficou).
  await syncSet(tx, "person_group_scope", "location_id", g.id, g.plantIds ?? [])
  await syncSet(tx, "person_group_profile", "profile_id", g.id, g.profileIds ?? [])
  await syncSet(tx, "person_group_member", "person_id", g.id, g.memberIds)
  if (revision !== null) {
    await tx`update ptw.person_group set name = ${g.name.trim()}::text, description = ${g.description}::text, active = ${g.active}::boolean
      where unit_id = ptw.current_unit() and id = ${g.id}::uuid`
  }
  await keepAnAdmin(tx, session)
  const rows = await listGroups(tx), found = rows.find((x) => x.id === g.id)
  if (!found) throw pta.notFound()
  return found
}

export async function listProfiles(tx: Tx): Promise<AccessProfile[]> {
  return tx<AccessProfile[]>`select p.id, p.name, p.description, p.permissions, p.active, p.revision,
    coalesce((select jsonb_agg(gp.group_id order by gp.group_id) from ptw.person_group_profile gp
      where gp.unit_id = p.unit_id and gp.profile_id = p.id), '[]'::jsonb) as "groupIds",
    (select count(distinct m.person_id)::int from ptw.person_group_profile gp
       join ptw.person_group g on g.unit_id = gp.unit_id and g.id = gp.group_id and g.active
       join ptw.person_group_member m on m.unit_id = g.unit_id and m.group_id = g.id
      where gp.unit_id = p.unit_id and gp.profile_id = p.id) as "peopleCount"
    from ptw.access_profile p where p.unit_id = ptw.current_unit() order by lower(p.name), p.id limit 1000`
}

export async function saveProfile(tx: Tx, p: AccessProfileInput, revision: number | null, session?: SessionInfo | null): Promise<AccessProfile> {
  if (revision === null) {
    await tx`insert into ptw.access_profile (unit_id, id, name, description, permissions, active)
      values (ptw.current_unit(), ${p.id}::uuid, ${p.name.trim()}::text, ${p.description}::text, ${p.permissions}::text[], ${p.active}::boolean)`
  } else {
    const rows = await tx<{ revision: number }[]>`select revision from ptw.access_profile where unit_id = ptw.current_unit() and id = ${p.id}::uuid for update`
    if (!rows[0]) throw pta.notFound()
    if (rows[0].revision !== revision) throw pta.staleRevision(rows[0].revision)
    await tx`update ptw.access_profile set name = ${p.name.trim()}::text, description = ${p.description}::text,
      permissions = ${p.permissions}::text[], active = ${p.active}::boolean where unit_id = ptw.current_unit() and id = ${p.id}::uuid`
  }
  await keepAnAdmin(tx, session)
  const found = (await listProfiles(tx)).find((x) => x.id === p.id)
  if (!found) throw pta.notFound()
  return found
}

export async function personAccess(tx: Tx, personId: string): Promise<GrantSource[]> {
  // Com os nomes: quem vê o próprio acesso pode não ter cadastro para ler grupos e perfis.
  const rows = await tx<{ grant_key: GrantSource["grant"]; group_id: string; profile_id: string; group_name: string; profile_name: string }[]>`
    select s.grant_key, s.group_id, s.profile_id, g.name as group_name, p.name as profile_name
      from ptw.person_access_sources(ptw.current_unit(), ${personId}::uuid) s
      join ptw.person_group g on g.unit_id = ptw.current_unit() and g.id = s.group_id
      join ptw.access_profile p on p.unit_id = ptw.current_unit() and p.id = s.profile_id
     order by 1, 4, 5`
  return rows.map((r) => ({ grant: r.grant_key, from: "grupo", groupId: r.group_id, profileId: r.profile_id, groupName: r.group_name, profileName: r.profile_name }))
}

export interface AssignmentGroup { id: string; revision: number; member: boolean }

/**
 * SPEC 007: o acesso de uma pessoa num só passo. Cada grupo listado é conferido pela revisão lida e só
 * muda se a pessoa entrar ou sair; os cargos (se vierem) passam pela mesma `updatePerson`. Tudo na
 * transação de quem chama: uma recusa (42501, 409, última pessoa com cadastro) não grava nada.
 */
export async function saveAccessAssignments(tx: Tx, personId: string, personRevision: number,
  groups: readonly AssignmentGroup[], roles: Schemas["RoleAssignment"][] | undefined, session?: SessionInfo | null): Promise<{ person: Schemas["Person"]; groups: PersonGroup[] }> {
  const person = await getPerson(tx, personId)
  if (person.revision !== personRevision) throw pta.staleRevision(person.revision)
  if (new Set(groups.map((g) => g.id)).size !== groups.length) throw pta.badRequest("Grupo repetido")
  const current = new Map((await listGroups(tx)).map((g) => [g.id, g]))
  for (const want of groups) {
    const g = current.get(want.id)
    if (!g) throw pta.notFound(`O grupo ${want.id} não existe nesta unidade`)
    const isMember = g.memberIds.includes(personId)
    if (isMember === want.member) continue
    if (g.revision !== want.revision) throw new ApiError(409, "PTA06", `O grupo «${g.name}» mudou: reabra para ver a versão atual`, { detail: String(g.revision) })
    if (want.member && !g.active) throw pta.badRequest(`O grupo «${g.name}» está inativo`)
    if (want.member && !person.login) throw pta.badRequest("Pessoa sem login não recebe grupo: defina um login para dar perfis")
    const memberIds = want.member ? [...g.memberIds, personId] : g.memberIds.filter((m) => m !== personId)
    await saveGroup(tx, { id: g.id, name: g.name, description: g.description, active: g.active, memberIds, profileIds: g.profileIds, plantIds: g.plantIds }, g.revision, null)
  }
  const saved = roles === undefined ? person : await updatePerson(tx, personId, personRevision, { name: person.name, roles })
  await keepAnAdmin(tx, session)
  return { person: saved, groups: await listGroups(tx) }
}

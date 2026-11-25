/**
 * Permissões efetivas (SPEC 002): as do diretório (LDAP, gravadas na sessão ao entrar) mais as dos perfis
 * ativos dos grupos ativos da pessoa, lidas do banco em cada chamada. Retirar alguém de um grupo, ou
 * desativar o grupo ou o perfil, vale na chamada seguinte.
 */
import type { Tx } from "../db.js"
import { effectiveGrants, type GrantSource } from "../shared/core/governance.js"
import type { Grant } from "./ldap.js"

export async function groupSources(tx: Tx, unitId: string, personId: string): Promise<GrantSource[]> {
  const rows = await tx<{ grant_key: Grant; group_id: string; profile_id: string }[]>`
    select grant_key, group_id, profile_id from ptw.person_access_sources(${unitId}::uuid, ${personId}::uuid)
     order by grant_key, group_id, profile_id`
  return rows.map((r) => ({ grant: r.grant_key, from: "grupo", groupId: r.group_id, profileId: r.profile_id }))
}

export function grantView(directory: readonly Grant[], groups: readonly GrantSource[]): { grants: Grant[]; grantSources: GrantSource[] } {
  const grantSources: GrantSource[] = [...directory.map((grant) => ({ grant, from: "diretorio" as const })), ...groups]
  return { grants: effectiveGrants(directory, groups) as Grant[], grantSources }
}

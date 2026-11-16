/** Leituras que a sessão precisa: a unidade, a pessoa (com os cargos) e a situação da conta. */
import type { Tx } from "../db.js"
import type { Schemas } from "../contract/types.js"

export type PersonBody = Schemas["Person"]
export type UnitBody = Schemas["Unit"]

interface PersonRow {
  id: string
  unit_id: string
  name: string
  company: string
  employee_id: string
  login: string | null
  enabled: boolean
  account_expires: Date | null
  ad_object_guid: string | null
  origin: PersonBody["origin"]
  status: PersonBody["status"]
  revision: number
  updated_at: Date
  roles: { id: string; roleId: string; scopeLocationId: string | null; validUntil: string }[]
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString())

function personBody(r: PersonRow): PersonBody {
  return {
    id: r.id,
    unitId: r.unit_id,
    revision: r.revision,
    updatedAt: iso(r.updated_at),
    origin: r.origin,
    status: r.status,
    name: r.name,
    company: r.company,
    employeeId: r.employee_id,
    login: r.login,
    enabled: r.enabled,
    accountExpires: r.account_expires === null ? null : iso(r.account_expires),
    adObjectGuid: r.ad_object_guid,
    roles: r.roles ?? [],
  }
}

export async function loadPerson(tx: Tx, by: { id: string } | { login: string }): Promise<PersonBody | null> {
  const id = "id" in by ? by.id : null
  const login = "login" in by ? by.login : null
  const rows = await tx<PersonRow[]>`
    select p.id, p.unit_id, p.name, p.company, p.employee_id, p.login, p.enabled, p.account_expires, p.ad_object_guid,
           p.origin, p.status, p.revision, p.updated_at,
           coalesce((select json_agg(json_build_object('id', r.id, 'roleId', r.role_id, 'scopeLocationId', r.scope_location_id,
                                                       'validUntil', r.valid_until::text) order by r.id)
                       from ptw.person_role r where r.unit_id = p.unit_id and r.person_id = p.id), '[]'::json) as roles
      from ptw.person p
     where p.unit_id = ptw.current_unit()
       and (${id}::uuid is null or p.id = ${id}::uuid)
       and (${login}::text is null or lower(p.login) = lower(${login}::text))
     limit 1`
  const r = rows[0]
  return r ? personBody(r) : null
}

export async function loadUnit(tx: Tx): Promise<UnitBody | null> {
  const rows = await tx<UnitBody[]>`select id, code, name, timezone from ptw.unit where id = ptw.current_unit()`
  return rows[0] ?? null
}

/** Por que a conta não pode ter sessão agora (nulo = pode): sem login, desativada, vencida ou cadastro fora de "ativo". */
export function accountProblem(p: Pick<PersonBody, "login" | "enabled" | "accountExpires" | "status">, now: Date): string | null {
  if (p.login === null || p.login === undefined) return "Pessoa sem login"
  if (p.status !== "ativo") return "Cadastro da pessoa não está ativo"
  if (p.enabled === false) return "Conta desativada"
  if (p.accountExpires && new Date(p.accountExpires).getTime() <= now.getTime()) return "Conta vencida"
  return null
}

/** A situação da conta de quem está na sessão, conferida a cada requisição. */
export async function accountState(tx: Tx, personId: string): Promise<Pick<PersonBody, "login" | "enabled" | "accountExpires" | "status"> | null> {
  const rows = await tx<{ login: string | null; enabled: boolean; account_expires: Date | null; status: PersonBody["status"] }[]>`
    select login, enabled, account_expires, status from ptw.person where unit_id = ptw.current_unit() and id = ${personId}::uuid`
  const r = rows[0]
  if (!r) return null
  return { login: r.login, enabled: r.enabled, accountExpires: r.account_expires === null ? null : iso(r.account_expires), status: r.status }
}

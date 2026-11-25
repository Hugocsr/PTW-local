import type { Tx } from "../db.js"
import { pta } from "../errors/apiError.js"
import type { Delegation, DelegationInput, DelegationUpdate } from "../shared/core/delegation.js"
import { iso, isoOrNull } from "./registry/sql.js"

export async function listDelegations(tx: Tx, admin = false): Promise<Delegation[]> {
  const rows = await tx<Delegation[]>`select id, slot_id as "slotId",delegator_id as "delegatorId",delegate_id as "delegateId",scope_location_id as "scopeLocationId",
    starts_at as "startsAt",ends_at as "endsAt",reason,created_by as "createdBy",created_at as "createdAt",revoked_at as "revokedAt",
    revoked_by as "revokedBy",revoked_reason as "revokedReason",revision from ptw.delegation
    where unit_id=ptw.current_unit() and (${admin}::boolean or delegator_id=ptw.current_person() or delegate_id=ptw.current_person())
    order by starts_at desc,id`
  return rows.map((d) => ({ ...d, startsAt: iso(d.startsAt), endsAt: iso(d.endsAt), createdAt: iso(d.createdAt), revokedAt: isoOrNull(d.revokedAt) }))
}

export async function createDelegation(tx: Tx, d: DelegationInput): Promise<Delegation> {
  await tx`insert into ptw.delegation (unit_id,id,slot_id,delegator_id,delegate_id,scope_location_id,starts_at,ends_at,reason,created_by)
    values(ptw.current_unit(),${d.id}::uuid,${d.slotId}::uuid,${d.delegatorId}::uuid,${d.delegateId}::uuid,${d.scopeLocationId}::uuid,
      ${d.startsAt}::timestamptz,${d.endsAt}::timestamptz,${d.reason.trim()}::text,ptw.current_person())`
  const result = (await listDelegations(tx, true)).find((x) => x.id === d.id)
  if (!result) throw pta.notFound()
  return result
}

export async function revokeDelegation(tx: Tx, id: string, rev: number, reason: string): Promise<Delegation> {
  const rows = await tx<{ revision: number }[]>`select revision from ptw.delegation where unit_id=ptw.current_unit() and id=${id}::uuid for update`
  if (!rows[0]) throw pta.notFound()
  if (rows[0].revision !== rev) throw pta.staleRevision(rows[0].revision)
  await tx`update ptw.delegation set revoked_at=clock_timestamp(),revoked_by=ptw.current_person(),revoked_reason=${reason.trim()}::text
    where unit_id=ptw.current_unit() and id=${id}::uuid`
  const result = (await listDelegations(tx, true)).find((x) => x.id === id)
  if (!result) throw pta.notFound()
  return result
}

/** SPEC 003: só agendada; o banco confere tudo de novo (início futuro, cargos, escopo, 7 dias, sobreposição). */
export async function updateDelegation(tx: Tx, id: string, rev: number, d: DelegationUpdate): Promise<Delegation> {
  const rows = await tx<{ revision: number }[]>`select revision from ptw.delegation where unit_id=ptw.current_unit() and id=${id}::uuid for update`
  if (!rows[0]) throw pta.notFound()
  if (rows[0].revision !== rev) throw pta.staleRevision(rows[0].revision)
  await tx`update ptw.delegation set slot_id=${d.slotId}::uuid,delegate_id=${d.delegateId}::uuid,scope_location_id=${d.scopeLocationId}::uuid,
      starts_at=${d.startsAt}::timestamptz,ends_at=${d.endsAt}::timestamptz,reason=${d.reason.trim()}::text
    where unit_id=ptw.current_unit() and id=${id}::uuid`
  const result = (await listDelegations(tx, true)).find((x) => x.id === id)
  if (!result) throw pta.notFound()
  return result
}

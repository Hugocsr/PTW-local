/** Pessoas e cargos (`person`, `person_role`). Elegibilidade é `ptw.person_ineligible` do banco. */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { staleOrMissing } from "../../http/ifMatch.js"
import { Q, currentRevision, iso, isoOrNull, orderBy, pagingOf, run, searchLike, selectPage, sinceFilter, statusFilter, type PageOut } from "./sql.js"

type Person = Schemas["Person"]
type Role = Schemas["RoleAssignment"]

const ROLES = `coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'roleId', pr.role_id, 'scopeLocationId', pr.scope_location_id, 'validUntil', pr.valid_until::text)
                                         order by pr.valid_until, pr.id)
                           from ptw.person_role pr where pr.unit_id = p.unit_id and pr.person_id = p.id), '[]'::jsonb)`
const BASE = `p.id, p.unit_id, p.name, p.company, p.employee_id, p.login, p.enabled, p.account_expires, p.ad_object_guid, p.origin, p.status, p.revision, p.updated_at, ${ROLES} as roles`

interface Row {
  id: string
  unit_id: string
  name: string
  company: string
  employee_id: string
  login: string | null
  enabled: boolean
  account_expires: Date | null
  ad_object_guid: string | null
  origin: Person["origin"]
  status: Person["status"]
  revision: number
  updated_at: Date
  roles: Role[]
  ineligible?: string | null
}
const mapPerson = (r: Row, withEligibility: boolean): Person => ({
  id: r.id, unitId: r.unit_id, revision: Number(r.revision), updatedAt: iso(r.updated_at), origin: r.origin, status: r.status,
  name: r.name, company: r.company, employeeId: r.employee_id, login: r.login, enabled: r.enabled,
  accountExpires: isoOrNull(r.account_expires), adObjectGuid: r.ad_object_guid, roles: r.roles,
  ...(withEligibility ? { ineligible: r.ineligible ?? null } : {}),
})

const SORT = { name: "lower(p.name)", company: "lower(p.company)", updatedAt: "p.updated_at" }

export async function listPeople(tx: Tx, query: OpQuery<"listPeople">): Promise<PageOut<Person>> {
  const q = new Q()
  const where = [`p.unit_id = ptw.current_unit()`]
  const like = searchLike(q, "p.search", query.q)
  if (like) where.push(like)
  if (query.roleId !== undefined) where.push(`exists (select 1 from ptw.person_role pr where pr.unit_id = p.unit_id and pr.person_id = p.id and pr.role_id = ${q.p(query.roleId, "uuid")})`)
  if (query.hasLogin !== undefined) where.push(query.hasLogin ? `p.login is not null` : `p.login is null`)
  const st = statusFilter(q, "p.status", query.status)
  if (st) where.push(st)
  const since = sinceFilter(q, "p.updated_at", query.updatedSince)
  if (since) where.push(since)
  let columns = BASE
  const eligible = query.eligibleAt !== undefined
  if (eligible) {
    const c = new Q()
    const exists = await run(tx, `select 1 from ptw.location where unit_id = ptw.current_unit() and id = ${c.p(query.eligibleAt, "uuid")}`, c.params)
    if (exists.length === 0) throw pta.notFound("O local de eligibleAt não existe nesta unidade")
    columns += `, ptw.person_ineligible(p.unit_id, p.id, ${q.p(query.roleId, "uuid")},
        (now() at time zone (select u.timezone from ptw.unit u where u.id = p.unit_id))::date,
        (select l.path from ptw.location l where l.unit_id = p.unit_id and l.id = ${q.p(query.eligibleAt, "uuid")})) as ineligible`
  }
  return selectPage(tx, q, { columns, from: "ptw.person p", where, order: orderBy(query.sort, "name", SORT, "p.id"), paging: pagingOf(query) }, (r: Row) => mapPerson(r, eligible))
}

export async function getPerson(tx: Tx, id: string): Promise<Person> {
  const q = new Q()
  const rows = await run<Row>(tx, `select ${BASE} from ptw.person p where p.unit_id = ptw.current_unit() and p.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return mapPerson(rows[0], false)
}

export async function createPerson(tx: Tx, body: OpBody<"createPerson">): Promise<Person> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.person (unit_id, id, name, company, employee_id, login, enabled, account_expires, ad_object_guid, origin, status)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.name, "text")}, coalesce(${q.p(body.company, "text")}, ''),
             coalesce(${q.p(body.employeeId, "text")}, ''), ${q.p(body.login, "text")}, coalesce(${q.p(body.enabled, "boolean")}, true),
             ${q.p(body.accountExpires, "timestamptz")}, ${q.p(body.adObjectGuid, "uuid")},
             coalesce(${q.p(body.origin, "ptw.record_origin")}, 'manual'), coalesce(${q.p(body.status, "ptw.record_status")}, 'ativo'))
     returning id`,
    q.params,
  )
  const id = rows[0]!.id
  await syncRoles(tx, id, body.roles ?? [])
  return getPerson(tx, id)
}

export async function updatePerson(tx: Tx, id: string, rev: number, body: OpBody<"updatePerson">): Promise<Person> {
  const q = new Q()
  const has = (k: string) => q.p(k in body, "boolean")
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.person set name = ${q.p(body.name, "text")},
        company = coalesce(${q.p(body.company, "text")}, company), employee_id = coalesce(${q.p(body.employeeId, "text")}, employee_id),
        login = case when ${has("login")} then ${q.p(body.login, "text")} else login end,
        enabled = coalesce(${q.p(body.enabled, "boolean")}, enabled),
        account_expires = case when ${has("accountExpires")} then ${q.p(body.accountExpires, "timestamptz")} else account_expires end,
        ad_object_guid = case when ${has("adObjectGuid")} then ${q.p(body.adObjectGuid, "uuid")} else ad_object_guid end,
        origin = coalesce(${q.p(body.origin, "ptw.record_origin")}, origin), status = coalesce(${q.p(body.status, "ptw.record_status")}, status)
      where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (!rows[0]) return staleOrMissing(await currentRevision(tx, "person", id))
  if (body.roles !== undefined) await syncRoles(tx, id, body.roles)
  return getPerson(tx, id)
}

interface RoleRow {
  id: string
  role_id: string
  scope_location_id: string | null
  valid_until: string
}

/**
 * `person_role` passa a ser exatamente a lista. Casa pelo `id` ou, sem ele, pelo par cargo + escopo;
 * só o que mudou vira escrita (concede, altera, revoga), então a trilha tem uma linha por cargo afetado.
 */
async function syncRoles(tx: Tx, personId: string, wanted: readonly Role[]): Promise<void> {
  const q = new Q()
  const current = await run<RoleRow>(
    tx,
    `select id, role_id, scope_location_id, valid_until::text as valid_until from ptw.person_role where unit_id = ptw.current_unit() and person_id = ${q.p(personId, "uuid")}`,
    q.params,
  )
  const used = new Set<string>()
  const keyOf = (role: string, scope: string | null) => `${role}|${scope ?? ""}`
  const byKey = new Map(current.map((r) => [keyOf(r.role_id, r.scope_location_id), r]))
  const byId = new Map(current.map((r) => [r.id, r]))
  const updates: { row: RoleRow; want: Role }[] = []
  const inserts: Role[] = []
  for (const w of wanted) {
    const hit = (w.id !== undefined ? byId.get(w.id) : undefined) ?? byKey.get(keyOf(w.roleId, w.scopeLocationId))
    if (hit && !used.has(hit.id)) {
      used.add(hit.id)
      if (hit.role_id !== w.roleId || hit.scope_location_id !== w.scopeLocationId || hit.valid_until !== w.validUntil) updates.push({ row: hit, want: w })
    } else inserts.push(w)
  }
  for (const r of current.filter((r) => !used.has(r.id))) {
    const d = new Q()
    await run(tx, `delete from ptw.person_role where unit_id = ptw.current_unit() and id = ${d.p(r.id, "uuid")}`, d.params)
  }
  for (const { row, want } of updates) {
    const u = new Q()
    await run(
      tx,
      `update ptw.person_role set role_id = ${u.p(want.roleId, "uuid")}, scope_location_id = ${u.p(want.scopeLocationId, "uuid")}, valid_until = ${u.p(want.validUntil, "date")}
        where unit_id = ptw.current_unit() and id = ${u.p(row.id, "uuid")}`,
      u.params,
    )
  }
  for (const w of inserts) {
    const i = new Q()
    await run(
      tx,
      `insert into ptw.person_role (unit_id, id, person_id, role_id, scope_location_id, valid_until)
       values (ptw.current_unit(), coalesce(${i.p(w.id, "uuid")}, uuidv7()), ${i.p(personId, "uuid")}, ${i.p(w.roleId, "uuid")}, ${i.p(w.scopeLocationId, "uuid")}, ${i.p(w.validUntil, "date")})`,
      i.params,
    )
  }
}

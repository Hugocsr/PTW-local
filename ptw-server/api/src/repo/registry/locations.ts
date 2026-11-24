/** Locais (`location`): árvore estrita; o caminho (`path`) e a recusa de ciclo (`PTW02`) são do banco. */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import { isUuid, type Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { staleOrMissing } from "../../http/ifMatch.js"
import { Q, iso, orderBy, pagingOf, run, currentRevision, searchLike, selectPage, sinceFilter, statusFilter, type PageOut } from "./sql.js"

type Location = Schemas["Location"]

const COLUMNS = `l.id, l.unit_id, l.parent_id, l.type_id, l.code, l.name, to_jsonb(l.aliases) as aliases, l.attrs, l.origin, l.status, l.revision, l.updated_at`
interface Row {
  id: string; unit_id: string; parent_id: string | null; type_id: string; code: string; name: string; aliases: string[]; attrs: Location["attrs"]
  origin: Location["origin"]; status: Location["status"]; revision: number; updated_at: Date
}
export const mapLocation = (r: Row): Location => ({
  id: r.id, unitId: r.unit_id, revision: Number(r.revision), updatedAt: iso(r.updated_at), origin: r.origin, status: r.status,
  parentId: r.parent_id, typeId: r.type_id, code: r.code, name: r.name, aliases: r.aliases, attrs: r.attrs ?? {},
})

const SORT = { code: "lower(l.code)", name: "lower(l.name)", updatedAt: "l.updated_at" }

export async function listLocations(tx: Tx, query: OpQuery<"listLocations">): Promise<PageOut<Location>> {
  const q = new Q()
  const where = [`l.unit_id = ptw.current_unit()`]
  const like = searchLike(q, "l.search", query.q)
  if (like) where.push(like)
  if (query.parentId !== undefined) {
    if (query.parentId === "root") where.push(`l.parent_id is null`)
    else if (isUuid(query.parentId)) where.push(`l.parent_id = ${q.p(query.parentId, "uuid")}`)
    else throw pta.badRequest("Requisição fora do contrato", "query/parentId: um uuid ou root")
  }
  if (query.under !== undefined) where.push(`l.path <@ (select u.path from ptw.location u where u.unit_id = l.unit_id and u.id = ${q.p(query.under, "uuid")})`)
  if (query.typeId !== undefined) where.push(`l.type_id = ${q.p(query.typeId, "uuid")}`)
  const st = statusFilter(q, "l.status", query.status)
  if (st) where.push(st)
  const since = sinceFilter(q, "l.updated_at", query.updatedSince)
  if (since) where.push(since)
  return selectPage(tx, q, { columns: COLUMNS, from: "ptw.location l", where, order: orderBy(query.sort, "code", SORT, "l.id"), paging: pagingOf(query) }, mapLocation)
}

export async function getLocation(tx: Tx, id: string): Promise<Location> {
  const q = new Q()
  const rows = await run<Row>(tx, `select ${COLUMNS} from ptw.location l where l.unit_id = ptw.current_unit() and l.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return mapLocation(rows[0])
}

export async function createLocation(tx: Tx, body: OpBody<"createLocation">): Promise<Location> {
  const q = new Q()
  const rows = await run<Row>(
    tx,
    `insert into ptw.location (unit_id, id, parent_id, type_id, code, name, aliases, attrs, origin, status)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.parentId, "uuid")}, ${q.p(body.typeId, "uuid")},
             ${q.p(body.code, "text")}, ${q.p(body.name, "text")}, array(select jsonb_array_elements_text(${q.json(body.aliases ?? [])})),
             ${q.json(body.attrs ?? {})}, coalesce(${q.p(body.origin, "ptw.record_origin")}, 'manual'), coalesce(${q.p(body.status, "ptw.record_status")}, 'ativo'))
     returning id`,
    q.params,
  )
  return getLocation(tx, rows[0]!.id)
}

export async function updateLocation(tx: Tx, id: string, rev: number, body: OpBody<"updateLocation">): Promise<Location> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.location set
        parent_id = case when ${q.p("parentId" in body, "boolean")} then ${q.p(body.parentId, "uuid")} else parent_id end,
        type_id = ${q.p(body.typeId, "uuid")}, code = ${q.p(body.code, "text")}, name = ${q.p(body.name, "text")},
        aliases = case when ${q.p(body.aliases !== undefined, "boolean")} then array(select jsonb_array_elements_text(${q.json(body.aliases ?? [])})) else aliases end,
        attrs = case when ${q.p(body.attrs !== undefined, "boolean")} then ${q.json(body.attrs ?? {})} else attrs end,
        origin = coalesce(${q.p(body.origin, "ptw.record_origin")}, origin), status = coalesce(${q.p(body.status, "ptw.record_status")}, status)
      where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (!rows[0]) return staleOrMissing(await currentRevision(tx, "location", id))
  return getLocation(tx, id)
}

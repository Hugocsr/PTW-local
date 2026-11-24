/** Ativos (`asset`, `asset_location`) e a trava vista de fora (`v_equipment_hold`). */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { staleOrMissing } from "../../http/ifMatch.js"
import { mapRelation, relationsOf } from "./relations.js"
import { Q, currentRevision, iso, orderBy, pagingOf, run, searchLike, selectPage, sinceFilter, statusFilter, type PageOut } from "./sql.js"

type Asset = Schemas["Asset"]
type Hold = Schemas["EquipmentHold"]

const LOCS = `coalesce((select jsonb_agg(al.location_id order by al.location_id) from ptw.asset_location al where al.unit_id = a.unit_id and al.asset_id = a.id), '[]'::jsonb)`
const COLUMNS = `a.id, a.unit_id, a.type_id, a.code, a.name, to_jsonb(a.aliases) as aliases, a.attrs, a.origin, a.status, a.revision, a.updated_at, ${LOCS} as location_ids`
interface Row {
  id: string
  unit_id: string
  type_id: string
  code: string
  name: string
  aliases: string[]
  attrs: Asset["attrs"]
  origin: Asset["origin"]
  status: Asset["status"]
  revision: number
  updated_at: Date
  location_ids: string[]
}
const mapAsset = (r: Row): Asset => ({
  id: r.id, unitId: r.unit_id, revision: Number(r.revision), updatedAt: iso(r.updated_at), origin: r.origin, status: r.status,
  typeId: r.type_id, code: r.code, name: r.name, aliases: r.aliases, attrs: r.attrs ?? {}, locationIds: r.location_ids,
})

const SORT = { code: "lower(a.code)", name: "lower(a.name)", updatedAt: "a.updated_at" }

export async function listAssets(tx: Tx, query: OpQuery<"listAssets">): Promise<PageOut<Asset>> {
  const q = new Q()
  const where = [`a.unit_id = ptw.current_unit()`]
  const like = searchLike(q, "a.search", query.q)
  if (like) where.push(like)
  if (query.typeId !== undefined) where.push(`a.type_id = ${q.p(query.typeId, "uuid")}`)
  if (query.locationId !== undefined) {
    where.push(`exists (select 1 from ptw.asset_location al join ptw.location l on l.unit_id = al.unit_id and l.id = al.location_id
                         where al.unit_id = a.unit_id and al.asset_id = a.id
                           and l.path <@ (select r.path from ptw.location r where r.unit_id = a.unit_id and r.id = ${q.p(query.locationId, "uuid")}))`)
  }
  if (query.id !== undefined && query.id.length > 0) where.push(`a.id = any (${q.uuids(query.id)})`)
  const st = statusFilter(q, "a.status", query.status)
  if (st) where.push(st)
  const since = sinceFilter(q, "a.updated_at", query.updatedSince)
  if (since) where.push(since)
  return selectPage(tx, q, { columns: COLUMNS, from: "ptw.asset a", where, order: orderBy(query.sort, "code", SORT, "a.id"), paging: pagingOf(query) }, mapAsset)
}

export async function getAsset(tx: Tx, id: string): Promise<Asset> {
  const q = new Q()
  const rows = await run<Row>(tx, `select ${COLUMNS} from ptw.asset a where a.unit_id = ptw.current_unit() and a.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return mapAsset(rows[0])
}

/** O ativo, as relações dele, os ativos do outro lado e as PTs que o prendem agora. */
export async function getAssetDetail(tx: Tx, id: string): Promise<Schemas["AssetDetail"]> {
  const asset = await getAsset(tx, id)
  const rel = await relationsOf(tx, id)
  const otherIds = [...new Set(rel.flatMap((r) => [r.from_id, r.to_id]).filter((x) => x !== id))]
  let related: Asset[] = []
  if (otherIds.length > 0) {
    const q = new Q()
    const rows = await run<Row>(tx, `select ${COLUMNS} from ptw.asset a where a.unit_id = ptw.current_unit() and a.id = any (${q.uuids(otherIds)}) order by lower(a.code), a.id`, q.params)
    related = rows.map(mapAsset)
  }
  return { asset, relations: rel.map(mapRelation), related, holds: await listHolds(tx, [id]) }
}

export async function createAsset(tx: Tx, body: OpBody<"createAsset">): Promise<Asset> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.asset (unit_id, id, type_id, code, name, aliases, attrs, origin, status)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.typeId, "uuid")}, ${q.p(body.code, "text")}, ${q.p(body.name, "text")},
             array(select jsonb_array_elements_text(${q.json(body.aliases ?? [])})), ${q.json(body.attrs ?? {})},
             coalesce(${q.p(body.origin, "ptw.record_origin")}, 'manual'), coalesce(${q.p(body.status, "ptw.record_status")}, 'ativo'))
     returning id`,
    q.params,
  )
  const id = rows[0]!.id
  await syncLocations(tx, id, body.locationIds ?? [])
  return getAsset(tx, id)
}

export async function updateAsset(tx: Tx, id: string, rev: number, body: OpBody<"updateAsset">): Promise<Asset> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.asset set type_id = ${q.p(body.typeId, "uuid")}, code = ${q.p(body.code, "text")}, name = ${q.p(body.name, "text")},
        aliases = case when ${q.p(body.aliases !== undefined, "boolean")} then array(select jsonb_array_elements_text(${q.json(body.aliases ?? [])})) else aliases end,
        attrs = case when ${q.p(body.attrs !== undefined, "boolean")} then ${q.json(body.attrs ?? {})} else attrs end,
        origin = coalesce(${q.p(body.origin, "ptw.record_origin")}, origin), status = coalesce(${q.p(body.status, "ptw.record_status")}, status)
      where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (!rows[0]) return staleOrMissing(await currentRevision(tx, "asset", id))
  if (body.locationIds !== undefined) await syncLocations(tx, id, body.locationIds)
  return getAsset(tx, id)
}

/** `asset_location` passa a ser exatamente a lista: o que saiu é removido, o que entrou é incluído; a trilha tem uma linha por local. */
async function syncLocations(tx: Tx, assetId: string, wanted: readonly string[]): Promise<void> {
  const list = [...new Set(wanted)]
  const d = new Q()
  await run(tx, `delete from ptw.asset_location where unit_id = ptw.current_unit() and asset_id = ${d.p(assetId, "uuid")} and location_id <> all (${d.uuids(list)})`, d.params)
  if (list.length === 0) return
  const i = new Q()
  await run(
    tx,
    `insert into ptw.asset_location (unit_id, asset_id, location_id)
     select ptw.current_unit(), ${i.p(assetId, "uuid")}, x from unnest(${i.uuids(list)}) as x on conflict do nothing`,
    i.params,
  )
}

/**
 * Quem prende cada ativo pedido agora: a PT do próprio ativo, de um ancestral ou de um descendente em
 * "parte de" (`asset_part` já traz o fecho, com (x, x)). `except` ignora uma PT (a que está sendo editada).
 */
export async function listHolds(tx: Tx, assetIds: readonly string[], except?: string): Promise<Hold[]> {
  if (assetIds.length === 0) return []
  const q = new Q()
  const ids = q.uuids(assetIds)
  const e1 = q.p(except, "uuid")
  const e2 = q.p(except, "uuid")
  const rows = await run<{ asset_id: string; held_id: string; asset_code: string; permit_id: string; number: string | null; state: Hold["state"] }>(
    tx,
    `select i.asset_id, h.asset_id as held_id, h.asset_code, h.permit_id, h.number, h.state
       from unnest(${ids}) as i(asset_id)
       cross join lateral (
         select ap.ancestor_id as rel from ptw.asset_part ap where ap.unit_id = ptw.current_unit() and ap.descendant_id = i.asset_id
         union
         select ap.descendant_id from ptw.asset_part ap where ap.unit_id = ptw.current_unit() and ap.ancestor_id = i.asset_id) r
       join ptw.v_equipment_hold h on h.unit_id = ptw.current_unit() and h.asset_id = r.rel
      where (${e1} is null or h.permit_id <> ${e2})
      order by i.asset_id, h.asset_code, h.permit_id`,
    q.params,
  )
  return rows.map((r) => ({ assetId: r.asset_id, heldAssetId: r.held_id, heldAssetCode: r.asset_code, permitId: r.permit_id, number: r.number, state: r.state }))
}

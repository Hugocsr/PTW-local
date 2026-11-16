/** Relações entre ativos (`asset_relation`). "Parte de" mantém o fecho e recusa ciclo (`PTW11`) e PTs juntas (`PTW10`) no banco. */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { Q, pagingOf, run, selectPage, type PageOut } from "./sql.js"

type Relation = Schemas["AssetRelation"]
export interface RelationRow {
  id: string
  from_id: string
  to_id: string
  kind_id: string
}
export const RELATION_COLUMNS = `r.id, r.from_id, r.to_id, r.kind_id`
export const mapRelation = (r: RelationRow): Relation => ({ id: r.id, fromId: r.from_id, toId: r.to_id, kindId: r.kind_id })

export async function listRelations(tx: Tx, query: OpQuery<"listAssetRelations">): Promise<PageOut<Relation>> {
  const q = new Q()
  const where = [`r.unit_id = ptw.current_unit()`]
  if (query.assetId !== undefined) {
    const a = q.p(query.assetId, "uuid")
    const b = q.p(query.assetId, "uuid")
    where.push(`(r.from_id = ${a} or r.to_id = ${b})`)
  }
  if (query.kindId !== undefined) where.push(`r.kind_id = ${q.p(query.kindId, "uuid")}`)
  return selectPage(tx, q, { columns: RELATION_COLUMNS, from: "ptw.asset_relation r", where, order: "r.id", paging: pagingOf(query) }, mapRelation)
}

/** Todas as relações de um ativo (origem ou destino), para o detalhe. */
export async function relationsOf(tx: Tx, assetId: string): Promise<RelationRow[]> {
  const q = new Q()
  const a = q.p(assetId, "uuid")
  const b = q.p(assetId, "uuid")
  return run<RelationRow>(
    tx,
    `select ${RELATION_COLUMNS} from ptw.asset_relation r where r.unit_id = ptw.current_unit() and (r.from_id = ${a} or r.to_id = ${b}) order by r.id`,
    q.params,
  )
}

export async function createRelation(tx: Tx, body: OpBody<"createAssetRelation">): Promise<Relation> {
  const q = new Q()
  const rows = await run<RelationRow>(
    tx,
    `insert into ptw.asset_relation (unit_id, id, from_id, to_id, kind_id)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.fromId, "uuid")}, ${q.p(body.toId, "uuid")}, ${q.p(body.kindId, "uuid")})
     returning id, from_id, to_id, kind_id`,
    q.params,
  )
  return mapRelation(rows[0]!)
}

export async function removeRelation(tx: Tx, id: string): Promise<void> {
  const q = new Q()
  const rows = await run(tx, `delete from ptw.asset_relation where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} returning id`, q.params)
  if (rows.length === 0) throw pta.notFound()
}

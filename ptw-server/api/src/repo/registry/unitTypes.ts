/** Unidade e tipos configuráveis (`unit`, `type_def`). */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { Q, dbLike, pagingOf, run, searchLikeLabel, selectPage, type PageOut } from "./sql.js"

type TypeDef = Schemas["TypeDef"]

export async function getUnit(tx: Tx): Promise<Schemas["Unit"]> {
  const rows = await run<Schemas["Unit"]>(tx, `select id, code, name, timezone from ptw.unit where id = ptw.current_unit()`)
  if (!rows[0]) throw pta.notFound()
  return rows[0]
}

const COLUMNS = `t.id, t.family, t.label, t.icon, t.system_key, t.active`
const mapType = (r: { id: string; family: TypeDef["family"]; label: string; icon: string | null; system_key: string | null; active: boolean }): TypeDef => ({
  id: r.id, family: r.family, label: r.label, icon: r.icon, systemKey: r.system_key, active: r.active,
})

export async function listTypes(tx: Tx, query: OpQuery<"listTypes">): Promise<PageOut<TypeDef>> {
  const q = new Q()
  const where = [`t.unit_id = ptw.current_unit()`]
  if (query.family !== undefined) where.push(`t.family = ${q.p(query.family, "ptw.type_family")}`)
  if (query.active !== undefined) where.push(`t.active = ${q.p(query.active, "boolean")}`)
  const like = searchLikeLabel(q, "t.label", query.q)
  if (like) where.push(like)
  return selectPage(tx, q, { columns: COLUMNS, from: "ptw.type_def t", where, order: "t.family, lower(t.label), t.id", paging: pagingOf(query) }, mapType)
}

export async function getType(tx: Tx, id: string): Promise<TypeDef> {
  const q = new Q()
  const rows = await run<Parameters<typeof mapType>[0]>(tx, `select ${COLUMNS} from ptw.type_def t where t.unit_id = ptw.current_unit() and t.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return mapType(rows[0])
}

export async function createType(tx: Tx, body: OpBody<"createType">): Promise<TypeDef> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.type_def (unit_id, id, family, label, icon, active)
     values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.family, "ptw.type_family")}, ${q.p(body.label, "text")},
             ${q.p(body.icon, "text")}, coalesce(${q.p(body.active, "boolean")}, true)) returning id`,
    q.params,
  )
  return getType(tx, rows[0]!.id)
}

export async function updateType(tx: Tx, id: string, body: OpBody<"updateType">): Promise<TypeDef> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.type_def set label = coalesce(${q.p(body.label, "text")}, label),
            icon = case when ${q.p("icon" in body, "boolean")} then ${q.p(body.icon, "text")} else icon end,
            active = coalesce(${q.p(body.active, "boolean")}, active)
      where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} returning id`,
    q.params,
  )
  if (!rows[0]) throw pta.notFound()
  return getType(tx, id)
}

/** Remove um tipo sem uso. O tipo do sistema (`system_key`) fica: o esquema ainda não o recusa, a API recusa com o mesmo código. */
export async function removeType(tx: Tx, id: string): Promise<void> {
  const q = new Q()
  const cur = await run<{ system_key: string | null }>(tx, `select system_key from ptw.type_def where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")}`, q.params)
  if (!cur[0]) throw pta.notFound()
  if (cur[0].system_key !== null) throw dbLike("23514", "Tipo do sistema não pode ser removido")
  const q2 = new Q()
  await run(tx, `delete from ptw.type_def where unit_id = ptw.current_unit() and id = ${q2.p(id, "uuid")}`, q2.params)
}

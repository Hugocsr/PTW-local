/** Listas de opções (`option_list`, `option_item`): o item nunca muda de id; a ordem é a posição. */
import type { OpBody, OpQuery, Schemas } from "../../contract/types.js"
import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { staleOrMissing } from "../../http/ifMatch.js"
import { Q, currentRevision, iso, pagingOf, run, searchLikeLabel, selectPage, sinceFilter, type PageOut } from "./sql.js"

type List = Schemas["OptionList"]
type Item = Schemas["OptionItem"]

const ITEMS = `coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'active', i.active) order by i.position, i.id)
                          from ptw.option_item i where i.unit_id = l.unit_id and i.list_id = l.id), '[]'::jsonb)`
const COLUMNS = `l.id, l.name, l.revision, l.updated_at, ${ITEMS} as items`
interface Row {
  id: string
  name: string
  revision: number
  updated_at: Date
  items: Item[]
}
const mapList = (r: Row): List => ({ id: r.id, name: r.name, revision: Number(r.revision), updatedAt: iso(r.updated_at), items: r.items })

export async function listOptionLists(tx: Tx, query: OpQuery<"listOptionLists">): Promise<PageOut<List>> {
  const q = new Q()
  const where = [`l.unit_id = ptw.current_unit()`]
  const like = searchLikeLabel(q, "l.name", query.q)
  if (like) where.push(like)
  const since = sinceFilter(q, "l.updated_at", query.updatedSince)
  if (since) where.push(since)
  return selectPage(tx, q, { columns: COLUMNS, from: "ptw.option_list l", where, order: "lower(l.name), l.id", paging: pagingOf(query) }, mapList)
}

export async function getOptionList(tx: Tx, id: string): Promise<List> {
  const q = new Q()
  const rows = await run<Row>(tx, `select ${COLUMNS} from ptw.option_list l where l.unit_id = ptw.current_unit() and l.id = ${q.p(id, "uuid")}`, q.params)
  if (!rows[0]) throw pta.notFound()
  return mapList(rows[0])
}

export async function createOptionList(tx: Tx, body: OpBody<"createOptionList">): Promise<List> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `insert into ptw.option_list (unit_id, id, name) values (ptw.current_unit(), coalesce(${q.p(body.id, "uuid")}, uuidv7()), ${q.p(body.name, "text")}) returning id`,
    q.params,
  )
  const id = rows[0]!.id
  await syncItems(tx, id, body.items)
  return getOptionList(tx, id)
}

export async function updateOptionList(tx: Tx, id: string, rev: number, body: OpBody<"updateOptionList">): Promise<List> {
  const q = new Q()
  const rows = await run<{ id: string }>(
    tx,
    `update ptw.option_list set name = ${q.p(body.name, "text")} where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`,
    q.params,
  )
  if (!rows[0]) return staleOrMissing(await currentRevision(tx, "option_list", id))
  await syncItems(tx, id, body.items)
  return getOptionList(tx, id)
}

export async function removeOptionList(tx: Tx, id: string, rev: number): Promise<void> {
  const q = new Q()
  const rows = await run(tx, `delete from ptw.option_list where unit_id = ptw.current_unit() and id = ${q.p(id, "uuid")} and revision = ${q.p(rev, "integer")} returning id`, q.params)
  if (rows.length === 0) staleOrMissing(await currentRevision(tx, "option_list", id))
}

/** Itens da lista = exatamente os enviados, na ordem; só o que mudou (rótulo, ativo, posição) vira escrita. */
async function syncItems(tx: Tx, listId: string, wanted: readonly Item[]): Promise<void> {
  const q = new Q()
  const current = await run<{ id: string; label: string; active: boolean; position: number }>(
    tx,
    `select id, label, active, position from ptw.option_item where unit_id = ptw.current_unit() and list_id = ${q.p(listId, "uuid")}`,
    q.params,
  )
  const byId = new Map(current.map((r) => [r.id, r]))
  const keep = new Set(wanted.map((w) => w.id))
  for (const r of current.filter((r) => !keep.has(r.id))) {
    const d = new Q()
    await run(tx, `delete from ptw.option_item where unit_id = ptw.current_unit() and id = ${d.p(r.id, "uuid")}`, d.params)
  }
  for (const [position, w] of wanted.entries()) {
    const old = byId.get(w.id)
    const q2 = new Q()
    if (!old) {
      await run(
        tx,
        `insert into ptw.option_item (unit_id, id, list_id, label, active, position)
         values (ptw.current_unit(), ${q2.p(w.id, "uuid")}, ${q2.p(listId, "uuid")}, ${q2.p(w.label, "text")}, ${q2.p(w.active, "boolean")}, ${q2.p(position, "integer")})`,
        q2.params,
      )
    } else if (old.label !== w.label || old.active !== w.active || Number(old.position) !== position) {
      await run(
        tx,
        `update ptw.option_item set label = ${q2.p(w.label, "text")}, active = ${q2.p(w.active, "boolean")}, position = ${q2.p(position, "integer")}
          where unit_id = ptw.current_unit() and id = ${q2.p(w.id, "uuid")}`,
        q2.params,
      )
    }
  }
}

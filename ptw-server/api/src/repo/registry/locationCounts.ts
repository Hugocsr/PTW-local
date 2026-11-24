import type { Tx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { Q, run } from "./sql.js"

/** One set query; RLS and current_unit constrain both roots and assets. */
export async function locationAssetCounts(tx: Tx, ids: string[]) {
  const q = new Q()
  const rows = await run<{ id: string; count: number }>(tx, `
    select root.id, count(distinct al.asset_id)::int as count
      from ptw.location root
      left join ptw.location child on child.unit_id = root.unit_id and child.path <@ root.path
      left join ptw.asset_location al on al.unit_id = child.unit_id and al.location_id = child.id
      where root.unit_id = ptw.current_unit() and root.id = any (${q.uuids(ids)})
      group by root.id`, q.params)
  if (rows.length !== ids.length) throw pta.notFound()
  const counts = new Map(rows.map(r => [r.id, Number(r.count)]))
  return { items: ids.map(locationId => ({ locationId, count: counts.get(locationId)! })) }
}

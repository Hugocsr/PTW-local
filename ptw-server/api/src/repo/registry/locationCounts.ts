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

/**
 * SPEC 017: os locais que têm ao menos um ativo `ativo` (do local ou de qualquer descendente), com a
 * contagem distinta. Com `assetTypeIds`, só ativos desses tipos. Uma consulta só, sem teto de locais.
 */
export async function locationsWithAssets(tx: Tx, assetTypeIds?: string[]) {
  const q = new Q()
  const typeFilter = assetTypeIds && assetTypeIds.length > 0 ? `and a.type_id = any (${q.uuids(assetTypeIds)})` : ""
  const rows = await run<{ id: string; count: number }>(tx, `
    select root.id, count(distinct a.id)::int as count
      from ptw.location root
      join ptw.location child on child.unit_id = root.unit_id and child.path <@ root.path
      join ptw.asset_location al on al.unit_id = child.unit_id and al.location_id = child.id
      join ptw.asset a on a.unit_id = al.unit_id and a.id = al.asset_id and a.status = 'ativo' ${typeFilter}
      where root.unit_id = ptw.current_unit()
      group by root.id, root.path
      order by root.path`, q.params)
  return { items: rows.map(r => ({ locationId: r.id, count: Number(r.count) })) }
}

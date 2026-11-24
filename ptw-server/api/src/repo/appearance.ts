import type { Brand } from "../shared/core/brand.js"
import type { AppearanceRecord } from "../shared/core/appearance.js"
import type { Tx } from "../db.js"
import { pta } from "../errors/apiError.js"

type Row = { brand: Brand | null; revision: number; updated_at: string; updated_by: string }
const record = (r?: Row): AppearanceRecord => r ? ({ brand: r.brand, revision: r.revision, updatedAt: r.updated_at, updatedBy: r.updated_by })
  : { brand: null, revision: 0, updatedAt: null, updatedBy: null }

export async function getAppearance(tx: Tx): Promise<AppearanceRecord> {
  const rows = await tx<Row[]>`select brand, revision, updated_at::text, updated_by from ptw.appearance where unit_id = ptw.current_unit()`
  return record(rows[0])
}

export async function putAppearance(tx: Tx, brand: Brand | null, revision: number): Promise<AppearanceRecord> {
  // A per-unit advisory lock also serialises two first publications, without granting UPDATE on unit.
  await tx`select pg_advisory_xact_lock(hashtextextended('appearance:' || ptw.current_unit()::text, 0))`
  const current = await getAppearance(tx)
  if (current.revision !== revision) throw pta.staleRevision(current.revision)
  await tx`insert into ptw.appearance (unit_id, brand, revision, updated_by)
    values (ptw.current_unit(), ${brand === null ? null : JSON.stringify(brand)}::jsonb, 1, ptw.current_person())
    on conflict (unit_id) do update set brand = excluded.brand`
  return getAppearance(tx)
}

export async function putAppearanceAsset(tx: Tx, hash: string, content: Buffer): Promise<void> {
  await tx`insert into ptw.appearance_asset (unit_id, hash, content, created_by)
    values (ptw.current_unit(), ${hash}::text, decode(${content.toString("base64")}::text, 'base64'), ptw.current_person())
    on conflict (unit_id, hash) do nothing`
}

export async function getAppearanceAsset(tx: Tx, file: string): Promise<Buffer> {
  const rows = await tx<{ content: string }[]>`select encode(a.content, 'base64') as content from ptw.appearance_asset a
    join ptw.appearance c using (unit_id) where a.unit_id = ptw.current_unit() and a.hash = ${file.slice(0, 64)}::text
    and (c.brand ->> 'logo' = ${file}::text or c.brand ->> 'symbol' = ${file}::text)`
  if (!rows[0]) throw pta.notFound()
  return Buffer.from(rows[0].content, "base64")
}

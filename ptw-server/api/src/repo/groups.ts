import type { GroupInput, PersonGroup } from "../shared/core/governance.js"
import type { Tx } from "../db.js"
import { pta } from "../errors/apiError.js"

export async function listGroups(tx: Tx): Promise<PersonGroup[]> {
  return tx<PersonGroup[]>`select g.id, g.name, g.description, g.active, g.revision,
    coalesce((select jsonb_agg(m.person_id order by m.person_id) from ptw.person_group_member m
      where m.unit_id = g.unit_id and m.group_id = g.id), '[]'::jsonb) as "memberIds"
    from ptw.person_group g where g.unit_id = ptw.current_unit() order by lower(g.name), g.id limit 5000`
}

export async function saveGroup(tx: Tx, g: GroupInput, revision: number | null): Promise<PersonGroup> {
  if (revision === null) {
    await tx`insert into ptw.person_group (unit_id, id, name, description, active)
      values (ptw.current_unit(), ${g.id}::uuid, ${g.name.trim()}::text, ${g.description}::text, ${g.active}::boolean)`
  } else {
    const rows = await tx<{ revision: number }[]>`select revision from ptw.person_group where unit_id = ptw.current_unit() and id = ${g.id}::uuid for update`
    if (!rows[0]) throw pta.notFound()
    if (rows[0].revision !== revision) throw pta.staleRevision(rows[0].revision)
    await tx`update ptw.person_group set name = ${g.name.trim()}::text, description = ${g.description}::text, active = ${g.active}::boolean
      where unit_id = ptw.current_unit() and id = ${g.id}::uuid`
  }
  const ids = JSON.stringify(g.memberIds)
  await tx`delete from ptw.person_group_member where unit_id = ptw.current_unit() and group_id = ${g.id}::uuid
    and person_id not in (select value::uuid from jsonb_array_elements_text(${ids}::jsonb))`
  await tx`insert into ptw.person_group_member (unit_id, group_id, person_id)
    select ptw.current_unit(), ${g.id}::uuid, value::uuid from jsonb_array_elements_text(${ids}::jsonb)
    on conflict (unit_id, group_id, person_id) do nothing`
  const rows = await listGroups(tx), found = rows.find((x) => x.id === g.id)
  if (!found) throw pta.notFound()
  return found
}

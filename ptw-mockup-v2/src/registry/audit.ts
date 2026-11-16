import { rowEvent, type AuditCtx, type AuditDraft, type AuditTable, type Row, type RowLookups } from "@/core/audit"
import {
  assetLocationRow, assetRow, locationRow, optionItemRow, optionListRow, personRoleRow, personRow, relationRow, typeRow, typeFamily,
} from "@/core/registryRules"
import type { Permit } from "@/permit/types"
import type { RegistryState, TypeList } from "./types"

/**
 * The audit of a registry write, as the database trigger (audit_row) writes it: one event per row
 * inserted, changed or removed, in the tables of the registry (type_def, location, asset,
 * asset_location, asset_relation, person, person_role, option_list, option_item). Rows come from the
 * mappers in core/registryRules; the event shape, action and text come from core/audit `rowEvent`.
 * Models and versions are audited by registry/auditModelos (stream B). Pure.
 */

export const TYPE_LIST_NAME: Record<TypeList, string> = { locationTypes: "tipo de local", assetTypes: "tipo de ativo", roleTypes: "cargo", relationKinds: "tipo de relação" }

type Rows = Map<string, Row>

/** Parents first when rows come in; children first when they go (as the foreign keys cascade). */
const ORDER = ["type_def", "location", "asset", "asset_location", "asset_relation", "person", "person_role", "option_list", "option_item"] as const satisfies readonly AuditTable[]
export type RegistryTable = (typeof ORDER)[number]

/** Every registry row of a state, by table, keyed like the table's primary key. */
function rowsOf(s: RegistryState): Record<RegistryTable, Rows> {
  const map = <T>(xs: T[], key: (x: T) => string, row: (x: T) => Row): Rows => new Map(xs.map((x) => [key(x), row(x)]))
  const types: Rows = new Map()
  for (const list of ["locationTypes", "assetTypes", "roleTypes", "relationKinds"] as TypeList[]) {
    for (const t of s[list]) types.set(t.id, typeRow(t, typeFamily(list)))
  }
  return {
    type_def: types,
    location: map(s.locations, (l) => l.id, locationRow),
    asset: map(s.assets, (a) => a.id, assetRow),
    asset_location: new Map(s.assets.flatMap((a) => a.locationIds.map((l) => [`${a.id}|${l}`, assetLocationRow(a.id, l)] as [string, Row]))),
    asset_relation: map(s.relations, (r) => r.id, relationRow),
    person: map(s.people, (p) => p.id, personRow),
    person_role: new Map(s.people.flatMap((p) => p.roles.map((r) => [r.id, personRoleRow(p, r)] as [string, Row]))),
    option_list: map(s.optionLists, (l) => l.id, optionListRow),
    option_item: new Map(s.optionLists.flatMap((l) => l.items.map((i, k) => [i.id, optionItemRow(l, i, k)] as [string, Row]))),
  }
}


const sameRow = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b)

/** Lookups for the event text and columns (asset code, person name, permit revision), from both states. */
export function registryLookups(before: RegistryState, after: RegistryState, permits: Permit[] = []): RowLookups {
  return {
    permitRevision: (id) => permits.find((p) => p.id === id)?.revision,
    assetCode: (id) => (after.assets.find((a) => a.id === id) ?? before.assets.find((a) => a.id === id))?.code,
    personName: (id) => (after.people.find((p) => p.id === id) ?? before.people.find((p) => p.id === id))?.name,
  }
}

/** One event per registry row that changed between `before` and `after` (nothing when nothing did). */
export function registryEvents(before: RegistryState, after: RegistryState, ctx: AuditCtx, look: RowLookups = registryLookups(before, after)): AuditDraft[] {
  if (before === after) return []
  const b = rowsOf(before), a = rowsOf(after)
  const out: AuditDraft[] = []
  const push = (d: AuditDraft | null) => { if (d) out.push(d) }
  for (const t of ORDER) {
    for (const [k, row] of a[t]) {
      const old = b[t].get(k)
      if (!old) push(rowEvent(t, undefined, row, ctx, look))
      else if (!sameRow(old, row)) push(rowEvent(t, old, row, ctx, look))
    }
  }
  for (const t of [...ORDER].reverse()) {
    for (const [k, row] of b[t]) if (!a[t].has(k)) push(rowEvent(t, row, undefined, ctx, look))
  }
  return out
}

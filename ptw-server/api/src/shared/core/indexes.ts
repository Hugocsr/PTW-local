// @ts-nocheck — cópia de ptw-mockup-v2/src/core/indexes.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Lookup indexes over the stores' arrays, built once per array and kept while that array lives.
 * The stores never mutate an array they have handed out (every write makes a new one), so an index
 * keyed by the array itself is always current; a new array gets a new index. Pure from the caller's
 * view: same input, same answer, just without scanning 100 000 permits or 500 000 signatures again.
 */
import type { Asset, AssetRelation, Location, Person } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"

function cached<K extends object, V>(store: WeakMap<K, V>, key: K, build: () => V): V {
  let v = store.get(key)
  if (v === undefined) { v = build(); store.set(key, v) }
  return v
}

const NONE: readonly never[] = Object.freeze([])

/* ---------- signatures by permit ---------- */
const sigIndex = new WeakMap<readonly SignatureRec[], Map<string, SignatureRec[]>>()
/** Signatures grouped by permit, in their original order. */
export function signaturesByPermit(sigs: readonly SignatureRec[]): Map<string, SignatureRec[]> {
  return cached(sigIndex, sigs, () => {
    const m = new Map<string, SignatureRec[]>()
    for (const g of sigs) { const xs = m.get(g.permitId); if (xs) xs.push(g); else m.set(g.permitId, [g]) }
    return m
  })
}
/** The permit's signatures (all revisions, voided included), in their original order. */
export const signaturesOf = (sigs: readonly SignatureRec[], permitId: string): readonly SignatureRec[] => signaturesByPermit(sigs).get(permitId) ?? NONE

/* ---------- by id ---------- */
const idIndex = new WeakMap<readonly { id: string }[], Map<string, unknown>>()
/** The record with this id (the first, like `find`). */
export function byId<T extends { id: string }>(xs: readonly T[], id: string): T | undefined {
  const m = cached(idIndex, xs, () => { const m = new Map<string, unknown>(); for (const x of xs) if (!m.has(x.id)) m.set(x.id, x); return m })
  return m.get(id) as T | undefined
}

/* ---------- people by cargo ---------- */
const roleIndex = new WeakMap<readonly Person[], Map<string, Person[]>>()
/** People holding the cargo (any scope, any validity), in the register's order. */
export function peopleWithRole(people: readonly Person[], roleId: string): readonly Person[] {
  const m = cached(roleIndex, people, () => {
    const m = new Map<string, Person[]>()
    for (const p of people) for (const r of new Set(p.roles.map((x) => x.roleId))) { const xs = m.get(r); if (xs) xs.push(p); else m.set(r, [p]) }
    return m
  })
  return m.get(roleId) ?? NONE
}
const posIndex = new WeakMap<readonly Person[], Map<string, number>>()
/** People holding any of the cargos, in the register's order (each once). */
export function peopleWithAnyRole(people: readonly Person[], roleIds: readonly string[]): readonly Person[] {
  if (roleIds.length === 1) return peopleWithRole(people, roleIds[0])
  const pos = cached(posIndex, people, () => new Map(people.map((p, i) => [p.id, i])))
  const seen = new Set<Person>()
  for (const r of roleIds) for (const p of peopleWithRole(people, r)) seen.add(p)
  return [...seen].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
}

const scopeIndex = new WeakMap<readonly Person[], Map<string, Map<string | null, Person[]>>>()
const scopedCache = new WeakMap<readonly Person[], WeakMap<readonly string[], Map<string, readonly Person[]>>>()
/**
 * People holding one of the cargos with a scope that covers the place (`pathIds`: the place and its
 * ancestors; a whole-unit cargo always covers), in the register's order, each once. Validity and
 * record status are not looked at here (the eligibility rule does that). Cached per path array.
 */
export function peopleInScope(people: readonly Person[], roleIds: readonly string[], pathIds: readonly string[]): readonly Person[] {
  const byPath = cached(scopedCache, people, () => new WeakMap())
  const memo = cached(byPath, pathIds, () => new Map())
  const key = roleIds.join("|")
  let v = memo.get(key)
  if (!v) {
    const idx = cached(scopeIndex, people, () => {
      const m = new Map<string, Map<string | null, Person[]>>()
      for (const p of people) for (const r of p.roles) {
        let byScope = m.get(r.roleId)
        if (!byScope) { byScope = new Map(); m.set(r.roleId, byScope) }
        const xs = byScope.get(r.scopeLocationId)
        if (!xs) byScope.set(r.scopeLocationId, [p]); else if (xs[xs.length - 1] !== p) xs.push(p)
      }
      return m
    })
    const pos = cached(posIndex, people, () => new Map(people.map((p, i) => [p.id, i])))
    const seen = new Set<Person>()
    for (const r of roleIds) {
      const byScope = idx.get(r)
      if (!byScope) continue
      for (const scope of [null, ...pathIds]) for (const p of byScope.get(scope) ?? []) seen.add(p)
    }
    v = [...seen].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
    memo.set(key, v)
  }
  return v
}

/* ---------- places ---------- */
const pathIndex = new WeakMap<readonly Location[], Map<string, string[]>>()
/** The place and its ancestors, nearest first (cached per locations array). */
export function locationPath(locations: readonly Location[], id: string): string[] {
  const m = cached(pathIndex, locations, () => new Map<string, string[]>())
  let v = m.get(id)
  if (!v) {
    v = []
    const seen = new Set<string>()
    let cur = byId(locations, id)
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      v.push(cur.id)
      cur = cur.parentId ? byId(locations, cur.parentId) : undefined
    }
    m.set(id, v)
  }
  return v
}

/* ---------- account epochs ---------- */
const expiryIndex = new WeakMap<readonly Person[], number[]>()
/**
 * How many accounts have expired by `now`. Between two expiry instants every account rule gives the
 * same answer, so a value derived from (people, today, this number) can be kept across clock ticks.
 */
export function accountEpoch(people: readonly Person[], now: string): number {
  const xs = cached(expiryIndex, people, () => people.flatMap((p) => (p.accountExpires ? [Date.parse(p.accountExpires)] : [])).sort((a, b) => a - b))
  const t = Date.parse(now)
  let lo = 0, hi = xs.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] <= t) lo = mid + 1; else hi = mid }
  return lo
}

/* ---------- permits ---------- */
const permitPos = new WeakMap<readonly Permit[], Map<string, number>>()
/** Position of each permit in the array (stable order for results built from an index). */
export function permitPosition(permits: readonly Permit[], id: string): number {
  return cached(permitPos, permits, () => new Map(permits.map((p, i) => [p.id, i]))).get(id) ?? -1
}

/* ---------- registry: relations and places of assets ---------- */
const relIndex = new WeakMap<readonly AssetRelation[], Map<string, AssetRelation[]>>()
/** Relations that touch the asset (either end), in their original order. */
export function relationsOfAsset(relations: readonly AssetRelation[], assetId: string): readonly AssetRelation[] {
  const m = cached(relIndex, relations, () => {
    const m = new Map<string, AssetRelation[]>()
    const add = (id: string, r: AssetRelation) => { const xs = m.get(id); if (!xs) m.set(id, [r]); else if (xs[xs.length - 1] !== r) xs.push(r) }
    for (const r of relations) { add(r.fromId, r); add(r.toId, r) }
    return m
  })
  return m.get(assetId) ?? NONE
}
const atIndex = new WeakMap<readonly Asset[], Map<string, Asset[]>>()
/** Assets with a row in this place (not its children), in the register's order. */
export function assetsAt(assets: readonly Asset[], locationId: string): readonly Asset[] {
  const m = cached(atIndex, assets, () => {
    const m = new Map<string, Asset[]>()
    for (const a of assets) for (const l of new Set(a.locationIds)) { const xs = m.get(l); if (xs) xs.push(a); else m.set(l, [a]) }
    return m
  })
  return m.get(locationId) ?? NONE
}

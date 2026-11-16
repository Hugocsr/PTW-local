/**
 * Root invariant (decision 2026-11-08): no one opens a PT for equipment that already has an open PT.
 * A PT holds its equipment from Enviar until the área accepts it back (encerrada) or it is
 * cancelada. Pure: the permits and the asset relations come in as parameters.
 *
 * The "é parte de" graph and the open permits by asset are indexed once per array (see
 * `indexes.ts`), so a check reads only the assets around the one asked about, not every permit and
 * every relation of the plant.
 *
 * Only PTs whose model version holds equipment (`holdsEquipment`, default true; the database's
 * `template_version.holds_equipment`) take part: a PT of a version that does not hold it (e.g. the
 * disabling of an interlock) neither holds its assets nor is blocked by another open PT on them. The
 * caller passes the ids of those versions as `free` (`nonHoldingVersionIds`).
 */
import { PART_OF_KEY, type AssetRelation, type TypeDef } from "@/registry/types"
import type { Permit } from "@/permit/types"
import type { PermitState } from "./permitState"
import type { PermitTemplate } from "@/registry/modelTypes"
import { permitPosition } from "./indexes"

/**
 * "é parte de": the only relation that makes two assets one piece of equipment for the lock. It is the
 * relation kind with `systemKey = "parte_de"` (ptw-server/db/schema/10_cadastro.sql), found by key so a
 * renamed kind keeps working.
 */
export const partOfKindIds = (kinds: Pick<TypeDef, "id" | "systemKey">[]): string[] => kinds.filter((k) => k.systemKey === PART_OF_KEY).map((k) => k.id)

/** States that do not hold equipment: not sent yet, or the area is back. `expirada` still holds it (the area was not handed back). */
const FREE: PermitState[] = ["rascunho", "encerrada", "cancelada"]

export const isOpen = (p: Pick<Permit, "state">) => !FREE.includes(p.state)

/** Version ids that do not hold equipment ("Prende o equipamento" off), memoized per templates array. */
const freeMemo = new WeakMap<readonly PermitTemplate[], ReadonlySet<string>>()
export function nonHoldingVersionIds(templates: readonly PermitTemplate[]): ReadonlySet<string> {
  let s = freeMemo.get(templates)
  if (!s) {
    s = new Set(templates.flatMap((t) => t.versions.filter((v) => v.holdsEquipment === false).map((v) => v.id)))
    freeMemo.set(templates, s)
  }
  return s
}
const NONE: ReadonlySet<string> = new Set()

/** The PT's version holds equipment (it may still be in a state that does not). */
export const versionHolds = (p: Partial<Pick<Permit, "versionId">>, free: ReadonlySet<string> = NONE) => !(p.versionId && free.has(p.versionId))
/** The PT holds its equipment now: open, and its version holds equipment. */
export const holdsEquipment = (p: Pick<Permit, "state"> & Partial<Pick<Permit, "versionId">>, free: ReadonlySet<string> = NONE) => isOpen(p) && versionHolds(p, free)

/* ---------- the "é parte de" graph, per relations array and set of kinds ---------- */
interface Graph { up: Map<string, string[]>; down: Map<string, string[]>; anc: Map<string, Set<string>>; desc: Map<string, Set<string>> }
const graphs = new WeakMap<readonly AssetRelation[], Map<string, Graph>>()
function graphOf(relations: readonly AssetRelation[], partOf: readonly string[]): Graph {
  let byKinds = graphs.get(relations)
  if (!byKinds) { byKinds = new Map(); graphs.set(relations, byKinds) }
  const key = partOf.join("|")
  let g = byKinds.get(key)
  if (!g) {
    g = { up: new Map(), down: new Map(), anc: new Map(), desc: new Map() }
    for (const r of relations) {
      if (!partOf.includes(r.kindId)) continue
      const u = g.up.get(r.fromId); if (u) u.push(r.toId); else g.up.set(r.fromId, [r.toId])
      const d = g.down.get(r.toId); if (d) d.push(r.fromId); else g.down.set(r.toId, [r.fromId])
    }
    byKinds.set(key, g)
  }
  return g
}
/** Walk one direction from `id`, at any depth (the asset itself excluded). */
function walk(id: string, edges: Map<string, string[]>, memo: Map<string, Set<string>>): Set<string> {
  let out = memo.get(id)
  if (out) return out
  out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const next of edges.get(cur) ?? []) {
      if (out.has(next) || next === id) continue
      out.add(next)
      stack.push(next)
    }
  }
  memo.set(id, out)
  return out
}
/** Every asset the given one is part of, at any depth (the asset itself excluded). */
const ancestors = (id: string, g: Graph) => walk(id, g.up, g.anc)
/** Every asset that is part of the given one, at any depth (the asset itself excluded). */
const descendants = (id: string, g: Graph) => walk(id, g.down, g.desc)

/** Same asset, or one is part of the other at any depth (either direction). Other relations never lock. */
export function assetsCollide(a: string, b: string, relations: AssetRelation[], partOf: string[]): boolean {
  const g = graphOf(relations, partOf)
  return a === b || ancestors(a, g).has(b) || ancestors(b, g).has(a)
}

/** The asset and every asset it collides with. */
function around(asset: string, g: Graph): string[] {
  return [asset, ...ancestors(asset, g), ...descendants(asset, g)]
}

/* ---------- open permits by asset, per permits array ---------- */
const openIndex = new WeakMap<readonly Permit[], Map<string, Permit[]>>()
function openByAsset(permits: readonly Permit[]): Map<string, Permit[]> {
  let m = openIndex.get(permits)
  if (!m) {
    m = new Map()
    for (const p of permits) {
      if (!isOpen(p)) continue
      for (const a of new Set(p.assetIds)) { const xs = m.get(a); if (xs) xs.push(p); else m.set(a, [p]) }
    }
    openIndex.set(permits, m)
  }
  return m
}

export interface EquipmentHold {
  /** The asset of the permit asked about. */
  asset: string
  /** The asset the holder is on: the same one, or a part / the whole of it. */
  heldAsset: string
  holder: Permit
}

/** The open PTs that hold equipment of `permit` (the permit itself ignored; none when `permit`'s version does not hold equipment), one entry per colliding pair, in the permits' order. */
export function equipmentHolders(permit: Pick<Permit, "id" | "assetIds"> & Partial<Pick<Permit, "versionId">>, permits: Permit[], relations: AssetRelation[], partOf: string[], free: ReadonlySet<string> = NONE): EquipmentHold[] {
  if (!versionHolds(permit, free)) return []
  const g = graphOf(relations, partOf)
  const open = openByAsset(permits)
  const hits: { h: EquipmentHold; k: [number, number, number] }[] = []
  permit.assetIds.forEach((asset, ai) => {
    for (const held of new Set(around(asset, g))) {
      for (const other of open.get(held) ?? []) {
        if (other.id === permit.id || !versionHolds(other, free)) continue
        other.assetIds.forEach((heldAsset, hi) => {
          if (heldAsset === held) hits.push({ h: { asset, heldAsset, holder: other }, k: [permitPosition(permits, other.id), ai, hi] })
        })
      }
    }
  })
  return hits.sort((x, y) => x.k[0] - y.k[0] || x.k[1] - y.k[1] || x.k[2] - y.k[2]).map((x) => x.h)
}

/** Pairs of open PTs that hold equipment and whose equipment collides, in the permits' order. Empty when the invariant holds. */
export function openCollisions(permits: Permit[], relations: AssetRelation[], partOf: string[], free: ReadonlySet<string> = NONE): [Permit, Permit][] {
  const g = graphOf(relations, partOf)
  const open = openByAsset(permits)
  const pairs = new Map<string, [Permit, Permit, number, number]>()
  for (const p of permits) {
    if (!holdsEquipment(p, free)) continue
    const pi = permitPosition(permits, p.id)
    for (const asset of p.assetIds) {
      for (const held of around(asset, g)) {
        for (const q of open.get(held) ?? []) {
          const qi = permitPosition(permits, q.id)
          if (qi <= pi || !versionHolds(q, free)) continue
          const key = `${p.id}|${q.id}`
          if (!pairs.has(key)) pairs.set(key, [p, q, pi, qi])
        }
      }
    }
  }
  return [...pairs.values()].sort((a, b) => a[2] - b[2] || a[3] - b[3]).map(([p, q]) => [p, q])
}

/**
 * The lock on the registry side: a write that changes the "é parte de" relations (add, restore,
 * edit, import) must not join the equipment of two open PTs. Returns the first pair of open PTs that
 * collides after the write and did not before; undefined when the write is safe.
 */
export function newCollision(permits: Permit[], before: AssetRelation[], after: AssetRelation[], partOf: string[], free: ReadonlySet<string> = NONE): [Permit, Permit] | undefined {
  if (before === after) return undefined
  const old = new Set(openCollisions(permits, before, partOf, free).map(([x, y]) => `${x.id}|${y.id}`))
  return openCollisions(permits, after, partOf, free).find(([a, b]) => !old.has(`${a.id}|${b.id}`))
}

/**
 * The asset tree of Gestão de Ativos (SGI Forces, UC-BACK-01): Planta → Área → Equipamento → equipamento
 * aninhado. It is read from the registry the PTW already has: plants and areas are locations (by the type's
 * system key `planta` / `area`, or by its name, or by depth), equipment are assets placed in an area, and a
 * nested equipment is an asset that "é parte de" another (the relation that feeds the equipment lock).
 * Pure; the screen loads the assets of an area on demand and asks these functions for the shape.
 */
import { PART_OF_KEY, type Asset, type AssetRelation, type Location, type TypeDef } from "@/registry/types"

export type NodeKind = "planta" | "area" | "equip"

export interface EquipNode {
  asset: Asset
  children: EquipNode[]
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR")
const byName = <T extends { name: string; code: string }>(a: T, b: T) => a.name.localeCompare(b.name, "pt-BR") || a.code.localeCompare(b.code, "pt-BR")

/** The location type that stands for a plant or an area: by system key first, then by name. */
export function levelType(types: readonly TypeDef[], kind: "planta" | "area"): TypeDef | undefined {
  const name = kind === "planta" ? /^planta$/ : /^area$/
  return types.find((t) => t.systemKey === kind) ?? types.find((t) => name.test(fold(t.label.trim())) && t.active) ?? types.find((t) => name.test(fold(t.label.trim())))
}

/** Plant or area: the type says so when it can; otherwise a root location is a plant and any other an area. */
export function locationKind(loc: Location, types: readonly TypeDef[]): "planta" | "area" {
  const t = types.find((x) => x.id === loc.typeId)
  if (t?.systemKey === "planta" || t?.systemKey === "area") return t.systemKey
  if (t && /^planta$/.test(fold(t.label.trim()))) return "planta"
  if (t && /^area$/.test(fold(t.label.trim()))) return "area"
  return loc.parentId === null ? "planta" : "area"
}

/** Ids of the relation kinds that make an asset part of another. */
export function partOfKindIds(kinds: readonly TypeDef[]): string[] {
  return kinds.filter((k) => k.systemKey === PART_OF_KEY).map((k) => k.id)
}

/** child id → parent id, by "é parte de" (the first one, when an asset is part of more than one). */
export function partParents(relations: readonly AssetRelation[], partOf: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of relations) if (partOf.includes(r.kindId) && !out.has(r.fromId)) out.set(r.fromId, r.toId)
  return out
}

/** The plants (root locations): active ones first, then by name. */
export function plantsOf(locs: readonly Location[]): Location[] {
  return locs.filter((l) => l.parentId === null).sort((a, b) => Number(a.status === "inativo") - Number(b.status === "inativo") || byName(a, b))
}

/** The locations right under one, by name. */
export function childLocations(locs: readonly Location[], parentId: string): Location[] {
  return locs.filter((l) => l.parentId === parentId).sort(byName)
}

/**
 * The equipment of one location as a forest: an asset placed here is a root unless it is part of another
 * asset that is also here. Children are the assets "parte de" it (here or anywhere among `assets`), by name.
 * A cycle in the data never loops: an asset shows once.
 */
export function equipmentForest(assets: readonly Asset[], locationId: string, parents: ReadonlyMap<string, string>): EquipNode[] {
  const here = assets.filter((a) => a.locationIds.includes(locationId))
  const hereIds = new Set(here.map((a) => a.id))
  const kids = new Map<string, Asset[]>()
  for (const a of assets) {
    const p = parents.get(a.id)
    if (p) kids.set(p, [...(kids.get(p) ?? []), a])
  }
  const seen = new Set<string>()
  const grow = (a: Asset): EquipNode => {
    seen.add(a.id)
    const children = (kids.get(a.id) ?? []).filter((c) => !seen.has(c.id)).sort(byName).map(grow)
    return { asset: a, children }
  }
  const roots = here.filter((a) => { const p = parents.get(a.id); return !p || !hereIds.has(p) }).sort(byName)
  const out: EquipNode[] = []
  for (const a of roots) if (!seen.has(a.id)) out.push(grow(a))
  return out
}

/** Every asset id in a forest (to know which assets already show). */
export function forestIds(forest: readonly EquipNode[]): string[] {
  const out: string[] = []
  const walk = (n: EquipNode) => { out.push(n.asset.id); n.children.forEach(walk) }
  forest.forEach(walk)
  return out
}

/** The chain of asset ids from the root equipment down to `id` (inclusive), by "é parte de". */
export function equipmentChain(id: string, parents: ReadonlyMap<string, string>): string[] {
  const out = [id]
  const seen = new Set(out)
  let cur = parents.get(id)
  while (cur && !seen.has(cur)) { out.unshift(cur); seen.add(cur); cur = parents.get(cur) }
  return out
}

/** The location ids from the plant down to `id` (inclusive). */
export function locationChain(locs: readonly Location[], id: string): string[] {
  const byId = new Map(locs.map((l) => [l.id, l]))
  const out: string[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) { out.unshift(cur.id); seen.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined }
  return out
}

/** What the primary button creates under a selected node (SGI: Nova área / Novo equipamento / Equip. aninhado). */
export function nextLevel(kind: NodeKind | null): { create: "planta" | "area" | "equip" | "nested"; label: string } {
  if (kind === "planta") return { create: "area", label: "Nova área" }
  if (kind === "area") return { create: "equip", label: "Novo equipamento" }
  if (kind === "equip") return { create: "nested", label: "Equip. aninhado" }
  return { create: "planta", label: "Nova planta" }
}

/** True when the text (folded) is in the code, name or one of the given extra texts. */
export function matches(q: string, ...texts: (string | undefined)[]): boolean {
  const needle = fold(q.trim())
  return !needle || texts.some((t) => !!t && fold(t).includes(needle))
}

/**
 * Locations that stay visible for a search: those that match and every ancestor of a match, plus the
 * locations of the matching assets (and their ancestors). Null = no search (everything shows).
 */
export function visibleLocations(locs: readonly Location[], q: string, assetHits: readonly Asset[], text: (l: Location) => (string | undefined)[]): Set<string> | null {
  if (!q.trim()) return null
  const out = new Set<string>()
  const add = (id: string) => locationChain(locs, id).forEach((x) => out.add(x))
  for (const l of locs) if (matches(q, l.name, l.code, ...l.aliases, ...text(l))) add(l.id)
  for (const a of assetHits) a.locationIds.forEach(add)
  return out
}

/**
 * The nodes above a selected record, from the plant down (the record itself excluded): what has to be open
 * for it to show. An asset not loaded yet has only its "parte de" chain.
 */
export function selectionPath(locs: readonly Location[], assets: readonly Asset[], parents: ReadonlyMap<string, string>, id: string | null): string[] {
  if (!id) return []
  if (locs.some((l) => l.id === id)) return locationChain(locs, id).slice(0, -1)
  const chain = equipmentChain(id, parents)
  const top = assets.find((a) => a.id === chain[0]) ?? assets.find((a) => a.id === id)
  const where = top?.locationIds[0]
  return [...(where ? locationChain(locs, where) : []), ...chain.slice(0, -1)]
}

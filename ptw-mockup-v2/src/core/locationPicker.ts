/**
 * Which places a PT may be opened at (SPEC 017), the rules behind the "Local" picker copied from the SGI
 * Front-Office prototype (Planta > Área > Equipamento, only active equipment, "N equip." on each row).
 * A place qualifies when it has at least one active asset of a type the model accepts, here or below it.
 * Pure: the screen brings the counts (memory: `assetCountsByLocation`; server: `GET /locations/with-assets`).
 */
import type { Asset, Location, TypeDef } from "@/registry/types"
import { childLocations, locationChain, locationKind, matches } from "./assetTree.ts"

/** Location id → how many qualifying assets sit there or below. Absent = none. */
export type PlaceCounts = ReadonlyMap<string, number>

/** The message when a place was chosen and no longer qualifies. */
export const PLACE_LOST = "Este local não tem mais ativos ativos aceitos por este modelo. Escolha outro local."
export const NO_PLACES = "Nenhum local tem ativos ativos aceitos por este modelo. Cadastre ou ative ativos em Gestão de Ativos."

/**
 * Memory twin of the server's count: each active asset (of `assetTypeIds`, none = any type) counts once on
 * every place above and including the places it sits in.
 */
export function assetCountsByLocation(assets: readonly Asset[], locations: readonly Location[], assetTypeIds: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of assets) {
    if (a.status !== "ativo" || (assetTypeIds.length > 0 && !assetTypeIds.includes(a.typeId))) continue
    const above = new Set<string>()
    for (const id of a.locationIds) for (const x of locationChain(locations, id)) above.add(x)
    for (const x of above) out.set(x, (out.get(x) ?? 0) + 1)
  }
  return out
}

/** A place the PT can be opened at: active, below a plant, of a type the model accepts, with qualifying assets. */
export function choosable(loc: Location, types: readonly TypeDef[], locationTypeIds: readonly string[], counts: PlaceCounts): boolean {
  return loc.status === "ativo" && locationKind(loc, types) !== "planta" && (locationTypeIds.length === 0 || locationTypeIds.includes(loc.typeId)) && (counts.get(loc.id) ?? 0) > 0
}

export interface PlaceRow { loc: Location; count: number; /** Has places below to go on to: the row opens instead of choosing. */ opens: boolean }

/** Every place that can be chosen and every place above one: where the drill-down is allowed to go. */
export function reachablePlaces(locations: readonly Location[], types: readonly TypeDef[], locationTypeIds: readonly string[], counts: PlaceCounts): Set<string> {
  const out = new Set<string>()
  for (const l of locations) if (choosable(l, types, locationTypeIds, counts)) for (const id of locationChain(locations, l.id)) out.add(id)
  return out
}

/**
 * One level of the drill-down: the places right under `parentId` (the plants when null) that lead somewhere
 * (`reach`), by name. Containers (a plant, a type the model does not accept) show only to lead to a place
 * that can be chosen; a place with nothing to offer never shows.
 */
export function browseRows(locations: readonly Location[], parentId: string | null, counts: PlaceCounts, reach: ReadonlySet<string>): PlaceRow[] {
  const here = parentId === null ? locations.filter((l) => l.parentId === null) : childLocations(locations, parentId)
  const live = (l: Location) => l.status === "ativo" && reach.has(l.id) && (counts.get(l.id) ?? 0) > 0
  return here.filter(live).sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.code.localeCompare(b.code, "pt-BR"))
    .map((loc) => ({ loc, count: counts.get(loc.id) ?? 0, opens: childLocations(locations, loc.id).some(live) }))
}

/** "Planta › Área": where a place is, from the plant down. */
export function placePath(locations: readonly Location[], id: string): string {
  const byId = new Map(locations.map((l) => [l.id, l]))
  return locationChain(locations, id).map((x) => byId.get(x)?.name ?? "").filter(Boolean).join(" › ")
}

/** Places a search finds: choosable ones whose code, name, alias or any ancestor's name matches. */
export function searchPlaces(locations: readonly Location[], types: readonly TypeDef[], locationTypeIds: readonly string[], counts: PlaceCounts, q: string, max = 8): Location[] {
  if (!q.trim()) return []
  const byId = new Map(locations.map((l) => [l.id, l]))
  return locations
    .filter((l) => choosable(l, types, locationTypeIds, counts) && matches(q, l.name, l.code, ...l.aliases, ...locationChain(locations, l.id).map((x) => byId.get(x)?.name)))
    .sort((a, b) => placePath(locations, a.id).localeCompare(placePath(locations, b.id), "pt-BR"))
    .slice(0, max)
}

/** The place that stands for an asset in the picker: the first place it sits in that can be chosen. */
export function placeOfAsset(a: Asset, locations: readonly Location[], types: readonly TypeDef[], locationTypeIds: readonly string[], counts: PlaceCounts): Location | undefined {
  return a.locationIds.map((id) => locations.find((l) => l.id === id)).find((l): l is Location => !!l && choosable(l, types, locationTypeIds, counts))
}

/** Empty when the chosen place still qualifies; otherwise the warning to show (and stop the PT on). */
export function placeProblem(locationId: string, locations: readonly Location[], types: readonly TypeDef[], locationTypeIds: readonly string[], counts: PlaceCounts): string {
  const loc = locations.find((l) => l.id === locationId)
  return loc && choosable(loc, types, locationTypeIds, counts) ? "" : PLACE_LOST
}

import type { Asset, Location, TypeDef } from "@/registry/types"
import { choosable, placeOfAsset, placePath, type PlaceCounts } from "./locationPicker"
import { locationChain } from "./assetTree"

/** SPEC 019: what a scanned tag means for the PT being written. `places` = where it can sit (more than one: ask which). */
export type ScanOutcome = { ok: true; asset: Asset; places: Location[] } | { ok: false; message: string }

export interface ScanContext {
  assetTypes: readonly TypeDef[]
  /** The model's accepted asset types; empty = any. */
  assetTypeIds: readonly string[]
  locations: readonly Location[]
  locationTypes: readonly TypeDef[]
  locationTypeIds: readonly string[]
  counts: PlaceCounts
  /** Place already chosen on the PT ("" = none) and the assets already on it. */
  locationId: string
  taken: readonly string[]
}

export function assetFromScan(code: string, asset: Asset | undefined, c: ScanContext): ScanOutcome {
  if (!asset) return { ok: false, message: `Nenhum ativo com o código ${code}.` }
  if (c.taken.includes(asset.id)) return { ok: false, message: `O ativo ${asset.code} já está nesta PT.` }
  if (asset.status !== "ativo") return { ok: false, message: `O ativo ${asset.code} está inativo.` }
  if (c.assetTypeIds.length > 0 && !c.assetTypeIds.includes(asset.typeId)) {
    const type = c.assetTypes.find((t) => t.id === asset.typeId)?.label ?? "este tipo"
    return { ok: false, message: `O modelo escolhido não aceita ativos do tipo ${type}.` }
  }
  const chosen = c.locations.find((l) => l.id === c.locationId)
  // Already under the place chosen on the PT: the place stays.
  if (chosen && asset.locationIds.some((id) => locationChain(c.locations, id).includes(chosen.id))) return { ok: true, asset, places: [chosen] }
  if (chosen && c.taken.length > 0) {
    const where = asset.locationIds[0] ? placePath(c.locations, asset.locationIds[0]) : "sem local"
    return { ok: false, message: `O ativo ${asset.code} está em outro local (${where}). Esta PT é de ${placePath(c.locations, chosen.id)}.` }
  }
  const places = asset.locationIds
    .map((id) => c.locations.find((l) => l.id === id))
    .filter((l): l is Location => !!l && choosable(l, c.locationTypes, c.locationTypeIds, c.counts))
  if (places.length === 0 || !placeOfAsset(asset, c.locations, c.locationTypes, c.locationTypeIds, c.counts)) {
    return { ok: false, message: `O local do ativo ${asset.code} não é aceito pelo modelo.` }
  }
  return { ok: true, asset, places }
}

/** The one asset whose tag is exactly this one (the tag is unique ignoring case). */
export function exactAsset(items: readonly Asset[], code: string): Asset | undefined {
  const k = code.trim().toLowerCase()
  return items.find((a) => a.code.toLowerCase() === k)
}

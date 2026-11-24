import { describe, expect, it } from "vitest"
import { locationParentDenied, partOfCycle, uniqueDenied } from "@/core/registryRules"
import { equipmentForest, locationKind, partOfKindIds, partParents, plantsOf } from "@/core/assetTree"
import { protectionOf, sheetProblems, AREA_FIELDS, EQUIPMENT_FIELDS, PLANT_FIELDS, attrText } from "@/core/assetAttrs"
import { sgiSeed, SGI_ASSET, SGI_LOC } from "./registry"

const s = sgiSeed

describe("cadastro de exemplo SGI (pacote de carga do servidor)", () => {
  it("cada registro passa pelas regras do cadastro (tamanhos, chaves únicas, árvore, parte de)", () => {
    for (const list of ["locationTypes", "assetTypes", "relationKinds", "roleTypes"] as const) for (const t of s[list]) expect(uniqueDenied(list, s, { ...t })).toBeNull()
    for (const l of s.locations) {
      expect(uniqueDenied("locations", s, { ...l })).toBeNull()
      expect(locationParentDenied(s.locations, l.id, l.parentId)).toBeNull()
    }
    for (const a of s.assets) expect(uniqueDenied("assets", s, { ...a })).toBeNull()
    const partOf = partOfKindIds(s.relationKinds)
    s.relations.forEach((r, i) => expect(partOfCycle(s.relations.slice(0, i), partOf, r)).toBe(false))
    expect(new Set(s.relations.map((r) => `${r.fromId}|${r.toId}|${r.kindId}`)).size).toBe(s.relations.length)
  })

  it("segue a cadeia do SGI: planta na raiz, área dentro de planta, equipamento numa área", () => {
    const kind = new Map(s.locations.map((l) => [l.id, locationKind(l, s.locationTypes)]))
    for (const l of s.locations) {
      if (kind.get(l.id) === "planta") expect(l.parentId).toBeNull()
      else expect(kind.get(l.parentId!)).toBe("planta")
    }
    for (const a of s.assets) {
      expect(a.locationIds).toHaveLength(1)
      expect(kind.get(a.locationIds[0])).toBe("area")
    }
    expect(plantsOf(s.locations).map((l) => l.code)).toEqual(["PNO", "PSU", "PLE"])
    const forest = equipmentForest(s.assets, SGI_LOC.caldeiraria, partParents(s.relations, partOfKindIds(s.relationKinds)))
    expect(forest.map((n) => n.asset.code)).toEqual(["BP-201"])
    expect(forest[0].children.map((n) => n.asset.code)).toEqual(["LSL-201", "M-201"])
  })

  it("a ficha é válida e o dispositivo de proteção aponta para equipamentos que existem", () => {
    for (const l of s.locations) {
      const fields = l.parentId === null ? PLANT_FIELDS : AREA_FIELDS
      expect(sheetProblems(fields, Object.fromEntries(fields.map((f) => [f.key, attrText(l.attrs, f.key)])))).toEqual({})
    }
    for (const a of s.assets) {
      expect(sheetProblems(EQUIPMENT_FIELDS, Object.fromEntries(EQUIPMENT_FIELDS.map((f) => [f.key, attrText(a.attrs, f.key)])))).toEqual({})
      for (const id of protectionOf(a.attrs)?.protegidos ?? []) expect(s.assets.some((x) => x.id === id)).toBe(true)
      expect(new TextEncoder().encode(JSON.stringify(a.attrs)).length).toBeLessThanOrEqual(8192)
    }
    expect(protectionOf(s.assets.find((a) => a.id === SGI_ASSET.lsl201)!.attrs)?.protegidos).toEqual([SGI_ASSET.bl301])
  })

  it("pessoas, modelos e tipos se referem ao que existe aqui", () => {
    const locIds = new Set(s.locations.map((l) => l.id))
    for (const p of s.people) for (const r of p.roles) if (r.scopeLocationId) expect(locIds.has(r.scopeLocationId)).toBe(true)
    const lt = new Set(s.locationTypes.map((t) => t.id)), at = new Set(s.assetTypes.map((t) => t.id))
    for (const t of s.templates) for (const v of t.versions) {
      v.locationTypeIds.forEach((id) => expect(lt.has(id)).toBe(true))
      v.assetTypeIds.forEach((id) => expect(at.has(id)).toBe(true))
    }
  })
})

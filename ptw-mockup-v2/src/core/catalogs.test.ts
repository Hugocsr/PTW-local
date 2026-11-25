import { describe, expect, it } from "vitest"
import { sgiSeed } from "@/demo/sgi/registry"
import { byActive, catalogOf, listCatalogId, listIdOf, listUses, moveItem, searchCatalogs, typeActions, typeInUse, typeUsage } from "./catalogs"

const s = sgiSeed
const epi = s.optionLists.find((l) => l.name === "EPI")!

describe("Catálogos (SPEC 005)", () => {
  it("rotas: tipos, listas e fallback para o primeiro catálogo", () => {
    expect(catalogOf(undefined, s.optionLists)).toBe("tipos-local")
    expect(catalogOf("cargos", s.optionLists)).toBe("cargos")
    expect(catalogOf(`lista/${epi.id}`, s.optionLists)).toBe(listCatalogId(epi.id))
    expect(catalogOf("lista/nao-existe", s.optionLists)).toBe("tipos-local")
    expect(listIdOf(listCatalogId(epi.id))).toBe(epi.id)
    expect(listIdOf("relacoes")).toBeNull()
  })

  it("uso em palavras e regras de ação: sistema travado, em uso só desativa, sem uso remove", () => {
    const area = s.locationTypes.find((t) => t.systemKey === "area")!
    const sala = s.locationTypes.find((t) => t.label === "Sala")!
    expect(typeUsage(s, "locationTypes", area.id)).toMatch(/locais · \d+ modelos?/)
    expect(typeActions(area, true)).toEqual({ toggle: false, remove: false, locked: true })
    expect(typeInUse(s, "locationTypes", sala.id)).toBe(false)
    expect(typeActions(sala, false)).toEqual({ toggle: true, remove: true, locked: false })
    expect(typeActions(sala, true)).toEqual({ toggle: true, remove: false, locked: false })
  })

  it("lista usada por modelo (marcação ou verificação) não pode sair", () => {
    const sim = s.optionLists.find((l) => l.name === "SIM / N.A.")!
    expect(listUses(s, epi.id).length + listUses(s, sim.id).length).toBeGreaterThan(0)
  })

  it("subir/descer e filtro de ativos", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"])
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"])
    expect(byActive([{ active: true }, { active: false }], "inativos")).toEqual([{ active: false }])
  })

  it("busca em todos os catálogos, sem acento", () => {
    const hits = searchCatalogs(s, "luva")
    expect(hits[0]).toMatchObject({ catalog: listCatalogId(epi.id), catalogTitle: "EPI", label: "Luvas" })
    expect(searchCatalogs(s, "area").some((h) => h.catalog === "tipos-local" && h.label === "Área")).toBe(true)
    expect(searchCatalogs(s, "cargos")[0]).toMatchObject({ catalog: "cargos", itemId: null })
    expect(searchCatalogs(s, "  ")).toEqual([])
  })
})

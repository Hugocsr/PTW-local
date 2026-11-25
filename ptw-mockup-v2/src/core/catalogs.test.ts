import { describe, expect, it } from "vitest"
import { sgiSeed } from "@/demo/sgi/registry"
import { byActive, catalogOf, filterCatalogs, filterItems, listCatalogId, listIdOf, listUses, moveItem, TYPE_CATALOGS, typeActions, typeInUse, typeUsage } from "./catalogs"

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

  it("SPEC 006: busca de catálogos só pelo nome; busca de itens dentro do catálogo, com o filtro de ativos", () => {
    const lists = s.optionLists.map((l) => ({ ...l, title: l.name }))
    expect(filterCatalogs(lists, "epi").map((l) => l.title)).toEqual(["EPI"])
    expect(filterCatalogs(TYPE_CATALOGS, "tipos").map((c) => c.id)).toEqual(["tipos-local", "tipos-ativo"])
    expect(filterCatalogs(TYPE_CATALOGS, "relaco").map((c) => c.id)).toEqual(["relacoes"])
    expect(filterCatalogs(lists, "luva")).toEqual([])
    expect(filterCatalogs(lists, "  ").length).toBe(lists.length)
    expect(filterItems(epi.items, "todos", "LUV", (i) => i.label).map((i) => i.label)).toEqual(["Luvas"])
    expect(filterItems(epi.items, "inativos", "luv", (i) => i.label)).toEqual([])
    const area = s.locationTypes.filter((t) => t.label === "Área")
    expect(filterItems(s.locationTypes, "ativos", "area", (t) => t.label)).toEqual(area)
  })
})

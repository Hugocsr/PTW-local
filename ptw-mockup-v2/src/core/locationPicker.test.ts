/** SPEC 017: the places a PT can be opened at. */
import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import type { Asset, Location, TypeDef } from "@/registry/types"
import { assetCountsByLocation, browseRows, choosable, placePath, placeProblem, reachablePlaces, searchPlaces } from "./locationPicker"

const types = [{ id: "tp", label: "Planta", systemKey: "planta" }, { id: "ta", label: "Área", systemKey: "area" }, { id: "tx", label: "Setor" }] as unknown as TypeDef[]
const loc = (id: string, name: string, parentId: string | null, typeId: string, status: Location["status"] = "ativo"): Location =>
  ({ ...seed.locations[0]!, id, code: id.toUpperCase(), name, parentId, typeId, status, aliases: [] })
const locations = [loc("p", "Planta Norte", null, "tp"), loc("a1", "Caldeiraria", "p", "ta"), loc("a2", "Digestores", "p", "ta"), loc("a3", "Lavagem", "p", "ta", "inativo"), loc("s1", "Setor X", "a1", "tx"), loc("p2", "Planta Sul", null, "tp"), loc("b1", "Moagem", "p2", "ta")]
const asset = (id: string, typeId: string, locationIds: string[], status: Asset["status"] = "ativo"): Asset => ({ ...seed.assets[0]!, id, typeId, locationIds, status })
const assets = [asset("e1", "bomba", ["a1"]), asset("e2", "valvula", ["a1", "a2"]), asset("e3", "bomba", ["a2"], "inativo"), asset("e4", "bomba", ["a3"]), asset("e5", "bomba", ["s1"])]

describe("assetCountsByLocation", () => {
  it("conta ativo ativo uma vez em cada nível acima, e só dos tipos pedidos", () => {
    const all = assetCountsByLocation(assets, locations, [])
    expect(Object.fromEntries(all)).toEqual({ p: 4, a1: 3, a2: 1, a3: 1, s1: 1 })
    expect(Object.fromEntries(assetCountsByLocation(assets, locations, ["valvula"]))).toEqual({ p: 1, a1: 1, a2: 1 })
  })
})

describe("choosable e browseRows", () => {
  const counts = assetCountsByLocation(assets, locations, [])
  it("só área com ativo ativo; planta, local sem ativo e inativo não se escolhem", () => {
    const ok = (id: string, lt: string[] = []) => choosable(locations.find((l) => l.id === id)!, types, lt, counts)
    expect(ok("a1")).toBe(true)
    expect(ok("p")).toBe(false)
    expect(ok("b1")).toBe(false)
    expect(ok("a3")).toBe(false)
    expect(ok("a1", ["tx"])).toBe(false)
    expect(ok("s1", ["tx"])).toBe(true)
  })
  it("a lista desce em níveis: plantas com algo, depois áreas com a contagem; sem ativo, some", () => {
    const reach = reachablePlaces(locations, types, [], counts)
    expect(browseRows(locations, null, counts, reach).map((r) => [r.loc.id, r.count, r.opens])).toEqual([["p", 4, true]])
    expect(browseRows(locations, "p", counts, reach).map((r) => [r.loc.id, r.count, r.opens])).toEqual([["a1", 3, true], ["a2", 1, false]])
    expect(browseRows(locations, "a1", counts, reach).map((r) => r.loc.id)).toEqual(["s1"])
  })
  it("um tipo de local que o modelo não aceita só aparece como caminho; sem caminho até um local aceito, some", () => {
    const reach = reachablePlaces(locations, types, ["tx"], counts)
    expect(browseRows(locations, null, counts, reach).map((r) => r.loc.id)).toEqual(["p"])
    expect(browseRows(locations, "p", counts, reach).map((r) => r.loc.id)).toEqual(["a1"])
    expect(browseRows(locations, "a1", counts, reach).map((r) => r.loc.id)).toEqual(["s1"])
    expect(reachablePlaces(locations, types, ["tzz"], counts).size).toBe(0)
  })
})

describe("busca, caminho e aviso", () => {
  const counts = assetCountsByLocation(assets, locations, [])
  it("a busca acha pelo nome, código ou planta e só devolve o que se escolhe", () => {
    expect(searchPlaces(locations, types, [], counts, "caldeir").map((l) => l.id)).toEqual(["a1", "s1"])
    expect(searchPlaces(locations, types, [], counts, "norte").map((l) => l.id)).toEqual(["a1", "s1", "a2"])
    expect(searchPlaces(locations, types, [], counts, "moagem")).toEqual([])
    expect(searchPlaces(locations, types, [], counts, "  ")).toEqual([])
  })
  it("caminho da planta até o local", () => { expect(placePath(locations, "s1")).toBe("Planta Norte › Caldeiraria › Setor X") })
  it("aviso só quando o local escolhido deixou de servir", () => {
    expect(placeProblem("a1", locations, types, [], counts)).toBe("")
    expect(placeProblem("b1", locations, types, [], counts)).toMatch(/não tem mais ativos ativos/)
    expect(placeProblem("sumiu", locations, types, [], counts)).toMatch(/Escolha outro local/)
  })
})

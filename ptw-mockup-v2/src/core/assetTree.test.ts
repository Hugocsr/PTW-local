import { describe, expect, it } from "vitest"
import type { Asset, AssetRelation, Location, TypeDef } from "@/registry/types"
import { selectionPath, childLocations, equipmentChain, equipmentForest, forestIds, levelType, locationChain, locationKind, nextLevel, partOfKindIds, partParents, plantsOf, visibleLocations } from "./assetTree"
import { AREA_FIELDS, attrText, formValues, PLANT_FIELDS, protectionOf, SAP_HIDDEN, sheetFrom, sheetProblems, EQUIPMENT_FIELDS } from "./assetAttrs"

const T = "2026-11-24T09:00:00-03:00"
const rec = { unitId: "u", revision: 1, updatedAt: T, origin: "manual" as const, status: "ativo" as const }
const types: TypeDef[] = [
  { id: "tp", label: "Planta", systemKey: "planta", active: true },
  { id: "ta", label: "Área", active: true },
  { id: "tx", label: "Sala", active: true },
]
const loc = (id: string, parentId: string | null, typeId: string, name: string): Location => ({ ...rec, id, parentId, typeId, code: id.toUpperCase(), name, aliases: [] })
const asset = (id: string, name: string, locationIds: string[]): Asset => ({ ...rec, id, typeId: "eq", code: id.toUpperCase(), name, aliases: [], locationIds })
const locs = [loc("pn", null, "tp", "Planta Norte"), loc("ps", null, "tp", "Planta Sul"), loc("cal", "pn", "ta", "Caldeiraria"), loc("dig", "pn", "ta", "Digestores"), loc("sala", "cal", "tx", "Sala elétrica")]
const kinds: TypeDef[] = [{ id: "k1", label: "alimenta", active: true }, { id: "kp", label: "é parte de", systemKey: "parte_de", active: true }]
const rels: AssetRelation[] = [
  { id: "r1", fromId: "m201", toId: "bp201", kindId: "kp" },
  { id: "r2", fromId: "psh", toId: "bp201", kindId: "kp" },
  { id: "r3", fromId: "rotor", toId: "m201", kindId: "kp" },
  { id: "r4", fromId: "bp201", toId: "ccm", kindId: "k1" },
]
const assets = [asset("bp201", "Bomba de Polpa 201", ["cal"]), asset("m201", "Motor 201", ["cal"]), asset("psh", "Pressostato", ["cal"]), asset("rotor", "Rotor", ["cal"]), asset("ccm", "CCM", ["dig"])]

describe("árvore de ativos (SGI: Planta → Área → Equipamento → aninhado)", () => {
  it("nível do local: chave do sistema, nome do tipo ou profundidade", () => {
    expect(locationKind(locs[0], types)).toBe("planta")
    expect(locationKind(locs[2], types)).toBe("area")
    expect(locationKind(locs[4], types)).toBe("area")
    expect(locationKind(loc("r", null, "tx", "Raiz"), types)).toBe("planta")
    expect(levelType(types, "planta")?.id).toBe("tp")
    expect(levelType(types, "area")?.id).toBe("ta")
    expect(levelType([], "area")).toBeUndefined()
  })

  it("plantas e áreas em ordem de nome", () => {
    expect(plantsOf(locs).map((l) => l.id)).toEqual(["pn", "ps"])
    expect(childLocations(locs, "pn").map((l) => l.id)).toEqual(["cal", "dig"])
  })

  it("equipamentos da área viram floresta por \"é parte de\"; outras relações não aninham", () => {
    const parents = partParents(rels, partOfKindIds(kinds))
    const forest = equipmentForest(assets, "cal", parents)
    expect(forest.map((n) => n.asset.id)).toEqual(["bp201"])
    expect(forest[0].children.map((n) => n.asset.id)).toEqual(["m201", "psh"])
    expect(forest[0].children[0].children.map((n) => n.asset.id)).toEqual(["rotor"])
    expect(forestIds(forest).sort()).toEqual(["bp201", "m201", "psh", "rotor"])
    expect(equipmentForest(assets, "dig", parents).map((n) => n.asset.id)).toEqual(["ccm"])
    expect(equipmentChain("rotor", parents)).toEqual(["bp201", "m201", "rotor"])
    expect(locationChain(locs, "sala")).toEqual(["pn", "cal", "sala"])
    expect(selectionPath(locs, assets, parents, "rotor")).toEqual(["pn", "cal", "bp201", "m201"])
    expect(selectionPath(locs, assets, parents, "sala")).toEqual(["pn", "cal"])
    expect(selectionPath(locs, [], parents, "rotor")).toEqual(["bp201", "m201"])
    expect(selectionPath(locs, assets, parents, null)).toEqual([])
  })

  it("ciclo nos dados não trava a árvore", () => {
    const loop: AssetRelation[] = [{ id: "a", fromId: "x", toId: "y", kindId: "kp" }, { id: "b", fromId: "y", toId: "x", kindId: "kp" }]
    const forest = equipmentForest([asset("x", "X", ["cal"]), asset("y", "Y", ["dig"])], "cal", partParents(loop, ["kp"]))
    expect(forestIds(forest).sort()).toEqual(["x", "y"])
  })

  it("botão do próximo nível segue o nó selecionado", () => {
    expect([null, "planta", "area", "equip"].map((k) => nextLevel(k as never).label)).toEqual(["Nova planta", "Nova área", "Novo equipamento", "Equip. aninhado"])
  })

  it("busca mantém ancestrais do que achou e o local dos ativos achados", () => {
    expect(visibleLocations(locs, "", [], () => [])).toBeNull()
    expect([...visibleLocations(locs, "digest", [], () => [])!].sort()).toEqual(["dig", "pn"])
    expect([...visibleLocations(locs, "zzz", [assets[0]], () => [])!].sort()).toEqual(["cal", "pn"])
    expect([...visibleLocations(locs, "br-pno", [], (l) => [l.id === "cal" ? "BR-PNO-CAL" : undefined])!].sort()).toEqual(["cal", "pn"])
  })
})

describe("ficha (attrs)", () => {
  it("guarda só o preenchido, mantém chaves desconhecidas e o bloco de proteção", () => {
    const before = { importado: "sim", werks: "XX01" }
    const sheet = sheetFrom(before, PLANT_FIELDS, { fuso: "America/Sao_Paulo", localizacao: " Barcarena/PA ", werks: "ignorado" })
    expect(sheet).toEqual({ importado: "sim", werks: "XX01", fuso: "America/Sao_Paulo", localizacao: "Barcarena/PA" })
    const eq = sheetFrom({ equnr: "10001234" }, EQUIPMENT_FIELDS, { fabricante: "KSB" }, { tipo: "sensor_de_processo", principio: "", bypass: " jumper ", sistema: "", classeRisco: "", protegidos: ["a", "a", "b"] })
    expect(eq).toEqual({ equnr: "10001234", fabricante: "KSB", protecao: { tipo: "sensor_de_processo", bypass: "jumper", protegidos: ["a", "b"] } })
    expect(protectionOf(eq)).toEqual({ tipo: "sensor_de_processo", principio: "", bypass: "jumper", sistema: "", classeRisco: "", protegidos: ["a", "b"] })
    expect(protectionOf(sheetFrom(eq, EQUIPMENT_FIELDS, formValues(eq, EQUIPMENT_FIELDS), null))).toBeNull()
    expect(attrText(eq, "protecao")).toBe("")
    expect(attrText(eq, "equnr")).toBe("10001234")
  })

  it("SPEC 004: campos SAP escondidos não aparecem e continuam guardados ao salvar o formulário", () => {
    const shown = (f: readonly { key: string }[]) => new Set(f.map((x) => x.key))
    for (const [fields, hidden] of [[PLANT_FIELDS, SAP_HIDDEN.planta], [AREA_FIELDS, SAP_HIDDEN.area], [EQUIPMENT_FIELDS, SAP_HIDDEN.equip]] as const)
      for (const k of hidden) expect(shown(fields).has(k)).toBe(false)
    const sap = Object.fromEntries(SAP_HIDDEN.equip.map((k) => [k, k === "dataAquis" ? "2024-02-29" : "X1"]))
    const saved = sheetFrom(sap, EQUIPMENT_FIELDS, { ...formValues(sap, EQUIPMENT_FIELDS), modelo: "CM4" })
    for (const k of SAP_HIDDEN.equip) expect(saved[k]).toBe(sap[k])
    const area = sheetFrom({ tplnr: "BR-PNO-CAL", beber: "01", kostl: "CC-1" }, AREA_FIELDS, {})
    expect(area).toEqual({ tplnr: "BR-PNO-CAL", beber: "01", kostl: "CC-1" })
  })

  it("confere tamanho e data", () => {
    expect(sheetProblems(EQUIPMENT_FIELDS, { nserie: "x".repeat(61) })).toEqual({ nserie: "No máximo 60 caracteres." })
    const dated = [{ key: "d", label: "Data", kind: "date" as const }]
    expect(sheetProblems(dated, { d: "2024-02-30" })).toEqual({ d: "Use uma data válida (AAAA-MM-DD)." })
    expect(sheetProblems(dated, { d: "2024-02-29" })).toEqual({})
  })
})

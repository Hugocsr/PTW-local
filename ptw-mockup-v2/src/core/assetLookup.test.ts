/** SPEC 019: what a scanned tag means for the PT. */
import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import type { Asset, Location, TypeDef } from "@/registry/types"
import { parseAssetCode } from "@/lib/qrScan"
import { assetFromScan, exactAsset, type ScanContext } from "./assetLookup"
import { assetCountsByLocation } from "./locationPicker"

const types = [{ id: "tp", label: "Planta", systemKey: "planta" }, { id: "ta", label: "Área", systemKey: "area" }] as unknown as TypeDef[]
const assetTypes = [{ id: "bomba", label: "Bomba" }, { id: "valvula", label: "Válvula" }] as unknown as TypeDef[]
const loc = (id: string, name: string, parentId: string | null, typeId: string): Location => ({ ...seed.locations[0]!, id, code: id.toUpperCase(), name, parentId, typeId, status: "ativo", aliases: [] })
const locations = [loc("p", "Planta Norte", null, "tp"), loc("a1", "Caldeiraria", "p", "ta"), loc("a2", "Digestores", "p", "ta")]
const asset = (id: string, code: string, typeId: string, locationIds: string[], status: Asset["status"] = "ativo"): Asset => ({ ...seed.assets[0]!, id, code, typeId, locationIds, status })
const list = [asset("e1", "BMB-01", "bomba", ["a1"]), asset("e2", "VLV-02", "valvula", ["a1", "a2"]), asset("e3", "BMB-03", "bomba", ["a2"], "inativo"), asset("e4", "BMB-04", "bomba", ["a2"])]
const ctx = (over: Partial<ScanContext> = {}): ScanContext => ({
  assetTypes, assetTypeIds: [], locations, locationTypes: types, locationTypeIds: [], counts: assetCountsByLocation(list, locations, []), locationId: "", taken: [], ...over,
})
const read = (code: string, c: ScanContext) => assetFromScan(code, exactAsset(list, code), c)

describe("parseAssetCode", () => {
  it("lê o código puro e o link do sistema com #ativo/", () => {
    expect(parseAssetCode("  CCM-L2-01 ")).toBe("CCM-L2-01")
    expect(parseAssetCode("https://ptw.planta/#ativo/CCM%20L2")).toBe("CCM L2")
  })
  it("recusa outros links, texto de várias linhas, vazio e código longo", () => {
    expect(parseAssetCode("https://ptw.planta/#pt/01a1cab9")).toBeNull()
    expect(parseAssetCode("https://exemplo.com")).toBeNull()
    expect(parseAssetCode("a\nb")).toBeNull()
    expect(parseAssetCode("   ")).toBeNull()
    expect(parseAssetCode("x".repeat(65))).toBeNull()
  })
})

describe("exactAsset", () => {
  it("acha pelo código inteiro, sem diferenciar maiúsculas, e não pelo trecho", () => {
    expect(exactAsset(list, "bmb-01")?.id).toBe("e1")
    expect(exactAsset(list, "BMB")).toBeUndefined()
  })
})

describe("assetFromScan", () => {
  it("ativo ativo, tipo aceito: devolve o ativo e o local onde ele está", () => {
    const out = read("BMB-01", ctx())
    expect(out.ok && out.places.map((p) => p.id)).toEqual(["a1"])
  })
  it("dois locais aceitos: devolve os dois para a pessoa escolher", () => {
    const out = read("VLV-02", ctx())
    expect(out.ok && out.places.map((p) => p.id)).toEqual(["a1", "a2"])
  })
  it("recusa com o motivo: não cadastrado, inativo, tipo fora do modelo, já na PT", () => {
    expect(read("ZZZ", ctx())).toEqual({ ok: false, message: "Nenhum ativo com o código ZZZ." })
    expect(read("BMB-03", ctx())).toEqual({ ok: false, message: "O ativo BMB-03 está inativo." })
    expect(read("BMB-01", ctx({ assetTypeIds: ["valvula"] }))).toEqual({ ok: false, message: "O modelo escolhido não aceita ativos do tipo Bomba." })
    expect(read("BMB-01", ctx({ taken: ["e1"], locationId: "a1" }))).toEqual({ ok: false, message: "O ativo BMB-01 já está nesta PT." })
  })
  it("com local já escolhido e ativo dentro dele: o local fica", () => {
    const out = read("VLV-02", ctx({ locationId: "a2", taken: ["e4"] }))
    expect(out.ok && out.places.map((p) => p.id)).toEqual(["a2"])
  })
  it("com ativos já na PT, ativo de outro local é recusado; sem ativos, o local muda", () => {
    const no = read("BMB-01", ctx({ locationId: "a2", taken: ["e4"] }))
    expect(!no.ok && no.message).toContain("está em outro local (Planta Norte › Caldeiraria)")
    const yes = read("BMB-01", ctx({ locationId: "a2", taken: [] }))
    expect(yes.ok && yes.places.map((p) => p.id)).toEqual(["a1"])
  })
  it("local que o modelo não aceita: recusa", () => {
    const out = read("BMB-01", ctx({ locationTypeIds: ["outro"] }))
    expect(out).toEqual({ ok: false, message: "O local do ativo BMB-01 não é aceito pelo modelo." })
  })
})

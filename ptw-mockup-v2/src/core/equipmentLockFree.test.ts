import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import type { AssetRelation, PermitTemplate } from "@/registry/types"
import type { Permit } from "@/permit/types"
import { equipmentHolders, holdsEquipment, newCollision, nonHoldingVersionIds, openCollisions, partOfKindIds } from "./equipmentLock"
import { lockChecks } from "./signing"
import { copyVersion, versionChangeDenied } from "./templateVersions"

// "Prende o equipamento" desligado (template_version.holds_equipment = false; db/tests/invariants.sql,
// "trava: ..."): a PT nem prende os ativos nem é barrada por outra PT aberta neles.
const PART = partOfKindIds(seed.relationKinds)[0]
const rel = (from: string, to: string): AssetRelation => ({ id: `${from}>${to}`, fromId: from, toId: to, kindId: PART } as AssetRelation)
const R = [rel("sonda", "ana"), rel("sonda2", "ana2")]
const pt = (id: string, versionId: string, asset: string, state: Permit["state"] = "em_analise") =>
  ({ id, versionId, templateId: "t", state, number: id, assetIds: [asset] } as unknown as Permit)
const FREE = new Set(["livre"])

describe("trava de equipamento: versão que não prende", () => {
  it("duas PTs que prendem ainda colidem (mesmo ativo e pai/filha)", () => {
    const ps = [pt("h1", "prende", "ana"), pt("h2", "prende", "sonda")]
    expect(openCollisions(ps, R, [PART], FREE).map(([a, b]) => `${a.id}×${b.id}`)).toEqual(["h1×h2"])
    expect(equipmentHolders(ps[1], ps, R, [PART], FREE).map((h) => h.holder.id)).toEqual(["h1"])
  })

  it("a que não prende convive no mesmo ativo e na filha, nos dois sentidos", () => {
    const ps = [pt("h1", "prende", "ana"), pt("n1", "livre", "ana"), pt("n2", "livre", "sonda"), pt("n3", "livre", "sonda2"), pt("h3", "prende", "ana2")]
    expect(openCollisions(ps, R, [PART], FREE)).toEqual([])
    // A que não prende não é barrada...
    expect(equipmentHolders(ps[1], ps, R, [PART], FREE)).toEqual([])
    expect(equipmentHolders(ps[2], ps, R, [PART], FREE)).toEqual([])
    // ...e não barra uma que prende no pai.
    expect(equipmentHolders(ps[4], ps, R, [PART], FREE)).toEqual([])
    expect(holdsEquipment(ps[1], FREE)).toBe(false)
    expect(holdsEquipment(ps[0], FREE)).toBe(true)
    // Sem o conjunto (o padrão), toda PT prende.
    expect(openCollisions(ps, R, [PART]).length).toBeGreaterThan(0)
  })

  it("a relação \"parte de\" que só junta uma PT que não prende é aceita", () => {
    const ps = [pt("h1", "prende", "ana"), pt("n1", "livre", "x")]
    expect(newCollision(ps, R, [...R, rel("x", "ana")], [PART], FREE)).toBeUndefined()
    const ps2 = [pt("h1", "prende", "ana"), pt("h2", "prende", "x")]
    expect(newCollision(ps2, R, [...R, rel("x", "ana")], [PART], FREE)?.map((p) => p.id)).toEqual(["h1", "h2"])
  })

  it("verificação do equipamento na assinatura diz que não prende", () => {
    const ps = [pt("h1", "prende", "ana"), pt("n1", "livre", "ana", "rascunho")]
    const checks = lockChecks(ps[1], ps, { relations: R, assets: [], partOf: [PART], free: FREE })
    expect(checks).toEqual([{ id: "equipamento", ok: true, text: "Não prende o equipamento: pode existir junto com outra PT aberta" }])
    expect(lockChecks(pt("h9", "prende", "sonda", "rascunho"), ps, { relations: R, assets: [], partOf: [PART], free: FREE })[0].ok).toBe(false)
  })

  it("versões que não prendem, por modelo; cópia mantém; ativa não muda", () => {
    const tpl = seed.templates.find((t) => t.versions.some((v) => v.status === "ativa"))!
    const active = tpl.versions.find((v) => v.status === "ativa")!
    const off: PermitTemplate = { ...tpl, versions: tpl.versions.map((v) => (v === active ? { ...v, holdsEquipment: false } : v)) }
    expect([...nonHoldingVersionIds([off])]).toEqual([active.id])
    expect(nonHoldingVersionIds(seed.templates).size).toBe(0)
    expect(copyVersion({ ...active, holdsEquipment: false }, 99, "2026-11-09T10:00:00-03:00").holdsEquipment).toBe(false)
    expect(versionChangeDenied(tpl, off, () => false, seed.optionLists)?.code).toBe("PTW03")
  })
})

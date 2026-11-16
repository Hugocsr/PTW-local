import { describe, expect, it } from "vitest"
import { verifyChain } from "@/core/audit"
import { openCollisions, nonHoldingVersionIds, partOfKindIds } from "@/core/equipmentLock"
import { myWork } from "@/core/myWork"
import { dueToExpire, railOf } from "@/core/permitView"
import { activationDenied } from "@/core/templateVersions"
import { buildCelulose, CEL } from "./index"
import { C } from "./ids"
import { pacoteTexto } from "./intertravamento"
// The client's package as delivered (outside the app; absent in the Docker build, where the check is skipped).
const doCliente = Object.values(import.meta.glob<string>("../../../../clientes/desabilitacao-intertravamento/*.ptw-modelo.json", { query: "?raw", import: "default", eager: true }))[0]

const sc = buildCelulose()
const R = sc.registry
const byId = (id: string) => sc.permits.permits.find((p) => p.id === id)!
const EQUIP = { relations: R.relations, assets: R.assets, partOf: partOfKindIds(R.relationKinds), free: nonHoldingVersionIds(R.templates) }
const roleLabel = (id: string) => R.roleTypes.find((r) => r.id === id)?.label ?? id
const work = (personId: string) => myWork({ personId, permits: sc.permits.permits, signatures: sc.permits.signatures, people: R.people, locations: R.locations, templates: R.templates, roleLabel, now: sc.start, equipment: EQUIP, formSnapshots: sc.permits.formSnapshots, optionLists: R.optionLists })

describe("cenário Fábrica de celulose", () => {
  it("carrega com a cadeia de auditoria íntegra", () => {
    expect(verifyChain(sc.audit).ok).toBe(true)
    expect(sc.audit[0].seq).toBe(1)
    expect(new Set(sc.audit.map((e) => e.unit))).toEqual(new Set([C.unit]))
  })

  it("não quebra regra: uma PT aberta por equipamento, nada vencido sem expirar, só as recusas de propósito", () => {
    expect(openCollisions(sc.permits.permits, R.relations, EQUIP.partOf, EQUIP.free)).toEqual([])
    // The interlock PT i2 and the maintenance PT on the same tank coexist: the interlock model does not hold equipment.
    expect(byId(CEL.junto).state).toBe("em_analise")
    expect(byId(CEL.junto).assetIds).toEqual(byId(CEL.i2).assetIds)
    expect(openCollisions(sc.permits.permits, R.relations, EQUIP.partOf).some(([a, b]) => [a.id, b.id].includes(CEL.junto))).toBe(true)
    expect(dueToExpire(sc.permits.permits, sc.start)).toEqual([])
    const denied = sc.audit.filter((e) => !e.ok && e.action.startsWith("pt."))
    expect(denied.map((e) => e.permit).sort()).toEqual([CEL.i4, CEL.bloqueada].sort())
    expect(denied.find((e) => e.permit === CEL.bloqueada)?.data.erro).toBe("PTW10")
  })

  it("importa o modelo de intertravamento do cliente pela importação real e o ativa", () => {
    const tpl = R.templates.find((t) => t.name.startsWith("Desabilitação de intertravamento"))!
    const ver = tpl.versions[0]
    expect(ver.status).toBe("ativa")
    expect(ver.origin).toBe("sugerida")
    expect(activationDenied(ver, R.optionLists)).toBeNull()
    expect(ver.holdsEquipment).toBe(false)
    expect([...EQUIP.free]).toEqual([ver.id])
    expect(R.optionLists.find((l) => l.name === "Intertravamentos")!.items.length).toBeGreaterThanOrEqual(12)
    // The package's cargos the plant lacks were resolved and the created ones removed.
    expect(R.roleTypes.map((r) => r.label)).not.toContain("Responsável Operacional")
    expect(sc.audit.some((e) => e.action === "modelo.importado")).toBe(true)
  })

  it("conta a história dos intertravamentos e das PTs", () => {
    expect(byId(CEL.i1).state).toBe("ativa")
    expect(byId(CEL.i2).state).toBe("ativa")
    expect(byId(CEL.i3).state).toBe("em_analise")
    expect(byId(CEL.i4).state).toBe("rascunho")
    expect(byId(CEL.i5).state).toBe("ativa")
    expect(sc.permits.extensions.map((x) => x.permitId)).toEqual([CEL.i5])
    expect(byId(CEL.i6).state).toBe("entregue")
    expect(byId(CEL.i7).state).toBe("encerrada")
    expect(byId(CEL.quente).state).toBe("ativa")
    expect(byId(CEL.confinado).state).toBe("em_analise")
    expect(byId(CEL.altura).state).toBe("suspensa")
    expect(byId(CEL.altura).resumedReason).not.toBeNull()
    expect(byId(CEL.devolvida).revision).toBe(2)
    expect(sc.permits.signatures.some((g) => g.permitId === CEL.devolvida && g.voidedAt !== null)).toBe(true)
    expect(byId(CEL.expirada).state).toBe("expirada")
    expect(byId(CEL.bloqueada).state).toBe("rascunho")
    expect(byId(CEL.pet).state).toBe("encerrada")
  })

  it("dá trabalho às pessoas-chave em Minha área", () => {
    const ricardo = work(C.person.ricardo)
    expect(ricardo.agir.map((i) => i.permitId)).toEqual(expect.arrayContaining([CEL.eletrica, CEL.i6]))
    // A blocking answer (Classe 5, H₂S out of range) is the person's to fix: the PT shows why.
    expect([...ricardo.agir, ...ricardo.bloqueadas].map((i) => i.permitId)).toContain(CEL.i4)
    expect(work(C.person.fernanda).agir.map((i) => i.permitId)).toContain(CEL.i3)
    expect(work(C.person.lucas).agir.map((i) => i.permitId)).toEqual(expect.arrayContaining([CEL.altura, CEL.expirada]))
    const eduardo = work(C.person.eduardo)
    expect([...eduardo.agir, ...eduardo.bloqueadas].map((i) => i.permitId)).toContain(CEL.confinado)
    expect(work(C.person.juliana).bloqueadas.map((i) => i.permitId)).toContain(CEL.bloqueada)
  })

  it("no rascunho classe 5, a Aprovação ainda não foi alcançada (futura, nunca \"feita\")", () => {
    const p = byId(CEL.i4)
    const ver = R.templates.flatMap((t) => t.versions).find((v) => v.id === p.versionId)!
    const rail = railOf(p, ver, sc.permits.signatures, R.people, R.locations, sc.start.slice(0, 10), sc.start)
    const i = rail.findIndex((s) => s.stage.name === "Aprovação")
    expect(i).toBeGreaterThan(0)
    expect(rail.findIndex((s) => s.status === "atual")).toBeLessThan(i)
    expect(rail[i].status).toBe("futura")
    expect(rail.slice(i).every((s) => s.status === "futura")).toBe(true)
  })

  it("usa o pacote do cliente sem os contatos do rodapé", () => {
    const copia = JSON.parse(pacoteTexto)
    if (doCliente) {
      const original = JSON.parse(doCliente)
      original.pendencias = original.pendencias.filter((p: { origem?: { trecho?: string } }) => !/ramal/i.test(p.origem?.trecho ?? ""))
      expect(copia).toEqual(original)
    }
    expect(JSON.stringify(copia)).not.toMatch(/ramal|celular/i)
    const tudo = JSON.stringify({ R, p: sc.permits, a: sc.audit })
    expect(tudo).not.toMatch(/ramal|99116|celular/i)
    expect(tudo).not.toMatch(/suzano/i)
    expect(R.units[0].name).toMatch(/demonstração/)
  })
})

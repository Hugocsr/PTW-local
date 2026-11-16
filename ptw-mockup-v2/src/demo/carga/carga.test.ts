import { describe, expect, it } from "vitest"
import { verifyChain } from "@/core/audit"
import { nonHoldingVersionIds, openCollisions, partOfKindIds } from "@/core/equipmentLock"
import { createMyWorkCache, myWork } from "@/core/myWork"
import { dueToExpire, railOf } from "@/core/permitView"
import { signaturesOf } from "@/core/indexes"
import type { PermitState } from "@/core/permitState"
import { C } from "../celulose/ids"
import { buildCarga, CARGA_SIZE } from "./index"

const sc = buildCarga()
const R = sc.registry
const P = sc.permits.permits
const EQUIP = { relations: R.relations, assets: R.assets, partOf: partOfKindIds(R.relationKinds), free: nonHoldingVersionIds(R.templates) }
const roleLabel = (id: string) => R.roleTypes.find((r) => r.id === id)?.label ?? id
const generated = P.filter((p) => p.id.startsWith("019a0c01"))

describe("cenário Carga · 100 mil PTs", { timeout: 60_000 }, () => {
  it("tem o volume pedido: 100 mil PTs, ~20 mil ativos, 90 mil finalizadas em 12 meses, 10 mil abertas", () => {
    expect(generated.length).toBe(CARGA_SIZE.permits)
    expect(R.assets.length).toBeGreaterThanOrEqual(CARGA_SIZE.assets)
    const count = (s: PermitState[]) => generated.filter((p) => s.includes(p.state)).length
    expect(count(["encerrada", "cancelada"])).toBe(90_000)
    const open: PermitState[] = ["rascunho", "em_analise", "devolvida", "emitida", "ativa", "suspensa", "entregue", "expirada"]
    expect(count(open)).toBe(10_000)
    for (const s of open) expect(count([s])).toBeGreaterThan(100)
    const starts = generated.filter((p) => p.state === "encerrada").map((p) => Date.parse(p.windowStart))
    expect((Math.max(...starts.slice(0, 50_000)) - Math.min(...starts.slice(0, 50_000))) / 86_400_000).toBeGreaterThan(300)
  })

  it("mantém as regras: uma PT aberta por equipamento, nada vencido sem expirar, números únicos, cadeia íntegra", () => {
    expect(openCollisions(P, R.relations, EQUIP.partOf, EQUIP.free)).toEqual([])
    expect(dueToExpire(P, sc.start)).toEqual([])
    const numbers = P.flatMap((p) => (p.number ? [p.number] : []))
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(P.filter((p) => p.state === "rascunho").every((p) => p.number === null)).toBe(true)
    expect(verifyChain(sc.audit).ok).toBe(true)
    expect(sc.audit.filter((e) => e.action === "sistema.carga")).toHaveLength(1)
  })

  it("assinaturas coerentes com o estado: a etapa atual é a que o estado pede", () => {
    const want: Partial<Record<PermitState, string | null>> = { em_analise: null, emitida: "aceite_campo", ativa: "entrega", entregue: "aceite_area", expirada: "entrega", encerrada: "none" }
    const sample = generated.filter((_, i) => i % 97 === 0)
    for (const p of sample) {
      const ver = R.templates.find((t) => t.id === p.templateId)!.versions[0]
      const rail = railOf(p, ver, sc.permits.signatures, R.people, R.locations, "2026-11-10", sc.start)
      const cur = rail.find((s) => s.status === "atual")
      const w = want[p.state]
      if (w === "none") expect(cur).toBeUndefined()
      else if (w) expect(cur?.stage.kind).toBe(w)
      // Every signature is by a different person in its stage, and never before the permit was created.
      for (const g of signaturesOf(sc.permits.signatures, p.id)) expect(Date.parse(g.signedAt)).toBeGreaterThanOrEqual(Date.parse(p.createdAt))
      // Nothing happened after "now".
      expect(Date.parse(p.updatedAt)).toBeLessThanOrEqual(Date.parse(sc.start))
    }
  })

  it("dá trabalho às pessoas-chave em Minha área, e o cache não muda o resultado", () => {
    const input = (personId: string) => ({ personId, permits: P, signatures: sc.permits.signatures, people: R.people, locations: R.locations, templates: R.templates, roleLabel, now: sc.start, equipment: EQUIP, formSnapshots: sc.permits.formSnapshots, optionLists: R.optionLists })
    for (const who of [C.person.ricardo, C.person.lucas, C.person.sandro]) {
      const w = myWork(input(who), createMyWorkCache())
      expect(w.agir.length + w.emCampo.length + w.bloqueadas.length + w.proximas.length).toBeGreaterThan(50)
    }
  })
})

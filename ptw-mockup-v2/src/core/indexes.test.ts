import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import { permitSeed, SIM_START } from "@/permit/seed"
import type { AssetRelation, Person } from "@/registry/types"
import type { Permit } from "@/permit/types"
import { accountEpoch, assetsAt, byId, locationPath, peopleInScope, peopleWithAnyRole, relationsOfAsset, signaturesOf } from "./indexes"
import { assetsCollide, equipmentHolders, openCollisions, partOfKindIds } from "./equipmentLock"
import { createMyWorkCache, myWork } from "./myWork"
import { boardRows, createBoardCache } from "./board"
import { isFinalState, nextLabel, railOf, waitsFor } from "./permitView"
import { needsResume, resumeCandidates } from "./stopResume"
import { addMinutes, dayOf } from "./time"
import { permitReducer } from "@/permit/reducer"

const R = seed
const sigs = permitSeed.signatures
const partOf = partOfKindIds(R.relationKinds)

describe("índices", () => {
  it("assinaturas por PT, na ordem original", () => {
    for (const p of permitSeed.permits) expect(signaturesOf(sigs, p.id)).toEqual(sigs.filter((g) => g.permitId === p.id))
    expect(signaturesOf(sigs, "nenhuma")).toEqual([])
  })

  it("por id devolve o mesmo que find; outro array, outro índice", () => {
    for (const a of R.assets) expect(byId(R.assets, a.id)).toBe(a)
    const copy = R.assets.slice(1)
    expect(byId(copy, R.assets[0].id)).toBeUndefined()
  })

  it("pessoas com qualquer dos cargos, na ordem do cadastro", () => {
    const roles = [...new Set(R.people.flatMap((p) => p.roles.map((r) => r.roleId)))]
    for (let i = 0; i < roles.length; i++) {
      const want = roles.slice(i, i + 2)
      expect(peopleWithAnyRole(R.people, want)).toEqual(R.people.filter((p) => p.roles.some((r) => want.includes(r.roleId))))
    }
  })

  it("pessoas no escopo do local: cargo do local ou de um ancestral, ou da unidade inteira", () => {
    const roles = [...new Set(R.people.flatMap((p) => p.roles.map((r) => r.roleId)))]
    for (const l of R.locations) {
      const path = locationPath(R.locations, l.id)
      for (const want of [roles.slice(0, 1), roles.slice(1, 3)]) {
        expect(peopleInScope(R.people, want, path)).toEqual(R.people.filter((p) => p.roles.some((r) => want.includes(r.roleId) && (r.scopeLocationId === null || path.includes(r.scopeLocationId)))))
      }
    }
  })

  it("relações de um ativo e ativos de um local", () => {
    for (const a of R.assets) expect(relationsOfAsset(R.relations, a.id)).toEqual(R.relations.filter((r) => r.fromId === a.id || r.toId === a.id))
    for (const l of R.locations) expect(assetsAt(R.assets, l.id)).toEqual(R.assets.filter((a) => a.locationIds.includes(l.id)))
  })

  it("caminho do local até a raiz", () => {
    for (const l of R.locations) {
      const want: string[] = []
      let cur: typeof l | undefined = l
      while (cur) { want.push(cur.id); cur = R.locations.find((x) => x.id === cur!.parentId) }
      expect(locationPath(R.locations, l.id)).toEqual(want)
    }
  })

  it("época das contas: conta quantas venceram até o instante", () => {
    const ppl = [{ accountExpires: "2026-11-10T10:00:00-03:00" }, { accountExpires: null }, { accountExpires: "2026-11-11T00:00:00-03:00" }] as Person[]
    expect(accountEpoch(ppl, "2026-11-10T09:59:59-03:00")).toBe(0)
    expect(accountEpoch(ppl, "2026-11-10T10:00:00-03:00")).toBe(1)
    expect(accountEpoch(ppl, "2026-11-12T00:00:00-03:00")).toBe(2)
  })
})

/* The indexed equipment lock against the plain definition. */
function naiveAncestors(id: string, rel: AssetRelation[]): Set<string> {
  const out = new Set<string>(); const stack = [id]
  while (stack.length) { const cur = stack.pop()!; for (const r of rel) { if (!partOf.includes(r.kindId) || r.fromId !== cur || out.has(r.toId) || r.toId === id) continue; out.add(r.toId); stack.push(r.toId) } }
  return out
}
const naiveCollide = (a: string, b: string, rel: AssetRelation[]) => a === b || naiveAncestors(a, rel).has(b) || naiveAncestors(b, rel).has(a)

describe("trava de equipamento indexada", () => {
  // A small random plant: chains and trees of "parte de", permits on random assets in random states.
  let s = 7
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const assets = Array.from({ length: 40 }, (_, i) => `a${i}`)
  const rel: AssetRelation[] = assets.slice(1).flatMap((a, i) => (rnd() < 0.6 ? [{ id: `r${i}`, fromId: a, toId: assets[Math.floor(rnd() * (i + 1))], kindId: partOf[0] }] : rnd() < 0.5 ? [{ id: `x${i}`, fromId: a, toId: assets[0], kindId: "outra" }] : []))
  const states = ["rascunho", "em_analise", "ativa", "encerrada", "expirada", "suspensa", "cancelada"] as const
  const permits = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, state: states[Math.floor(rnd() * states.length)], assetIds: [assets[Math.floor(rnd() * 40)], ...(rnd() < 0.3 ? [assets[Math.floor(rnd() * 40)]] : [])] })) as unknown as Permit[]

  it("colide como a definição (mesmo ativo, ou parte de, em qualquer profundidade)", () => {
    for (const a of assets) for (const b of assets) expect(assetsCollide(a, b, rel, partOf)).toBe(naiveCollide(a, b, rel))
  })

  it("quem segura o equipamento: mesmos pares, na mesma ordem", () => {
    const open = (p: Permit) => !["rascunho", "encerrada", "cancelada"].includes(p.state)
    for (const p of permits) {
      const want = permits.filter((o) => o.id !== p.id && open(o)).flatMap((o) => p.assetIds.flatMap((a) => o.assetIds.filter((b) => naiveCollide(a, b, rel)).map((b) => ({ asset: a, heldAsset: b, holder: o }))))
      expect(equipmentHolders(p, permits, rel, partOf)).toEqual(want)
    }
    const openOnes = permits.filter(open)
    const pairs = openOnes.flatMap((p, i) => openOnes.slice(i + 1).filter((q) => p.assetIds.some((a) => q.assetIds.some((b) => naiveCollide(a, b, rel)))).map((q) => [p, q]))
    expect(openCollisions(permits, rel, partOf)).toEqual(pairs)
  })
})

describe("Minha área e Quadro com cache", () => {
  const roleLabel = (id: string) => id
  const equipment = { relations: R.relations, assets: R.assets, partOf }
  const base = { permits: permitSeed.permits, signatures: sigs, people: R.people, locations: R.locations, templates: R.templates, roleLabel, equipment, formSnapshots: permitSeed.formSnapshots, optionLists: R.optionLists }

  it("o cache dá o mesmo resultado que calcular de novo, com o relógio andando e depois de uma escrita", () => {
    for (const person of R.people) {
      const cache = createMyWorkCache()
      let data = permitSeed
      for (const minutes of [0, 1, 90, 600, 60 * 30]) {
        const now = addMinutes(SIM_START, minutes)
        const input = { ...base, permits: data.permits, signatures: data.signatures, personId: person.id, now, today: dayOf(now) }
        expect(myWork(input, cache)).toEqual(myWork(input))
      }
      // A write changes one permit object (an expiry here): the cache must see it.
      data = permitReducer(data, { kind: "expire", permitId: data.permits.find((p) => p.state === "ativa")!.id }, { audit: { at: SIM_START, actorId: null }, registry: R }).data
      const input = { ...base, permits: data.permits, signatures: data.signatures, personId: person.id, now: SIM_START }
      expect(myWork(input, cache)).toEqual(myWork(input))
    }
  })

  it("linhas do Quadro: as mesmas que o cálculo direto, com e sem cache", () => {
    const cache = createBoardCache()
    for (const person of R.people.slice(0, 4)) for (const minutes of [0, 60 * 30]) {
      const now = addMinutes(SIM_START, minutes), today = dayOf(now)
      const want = permitSeed.permits.filter((p) => p.state !== "rascunho" || p.authorId === person.id).map((p) => {
        const tpl = R.templates.find((t) => t.id === p.templateId)!, ver = tpl.versions.find((v) => v.id === p.versionId)!
        if (isFinalState(p.state)) return { p, tpl, ver, next: "—", mine: false }
        const rail = railOf(p, ver, sigs, R.people, R.locations, today, now)
        const res = needsResume(p) ? resumeCandidates(p, ver, R.people, R.locations, today, now) : []
        return { p, tpl, ver, next: nextLabel(p, rail, R.people, res), mine: waitsFor(p, rail, person.id, res) }
      })
      const input = { permits: permitSeed.permits, signatures: sigs, people: R.people, locations: R.locations, templates: R.templates, personId: person.id, today, now }
      expect(boardRows(input, cache)).toEqual(want)
      expect(boardRows(input)).toEqual(want)
    }
  })
})

import { describe, expect, it } from "vitest"
import { sgiSeed, SGI_APPROVAL, SGI_LOC } from "@/demo/sgi/registry"
import { ID } from "@/registry/seedIds"
import { pathIds } from "./permitView"
import type { Delegation } from "./delegation"
import { approvalsOf, canRevoke, dayLabel, delegateCandidates, delegators, filterDelegations, initials, lastDay, periodLabel, plantScopes, windowOf } from "./delegationView"

const TZ = "America/Sao_Paulo"
const NOW = "2026-11-24T10:30:00-03:00"
const TODAY = "2026-11-24"
const s = sgiSeed
const mk = (id: string, startsAt: string, endsAt: string, extra: Partial<Delegation> = {}): Delegation => ({
  id, slotId: null, delegatorId: ID.person.joana, delegateId: ID.person.marina, scopeLocationId: null, startsAt, endsAt, reason: "Férias",
  createdBy: ID.person.marina, createdAt: startsAt, revokedAt: null, revokedBy: null, revokedReason: null, revision: 1, ...extra,
})

describe("Delegações (SGI · Aprovação › Delegações)", () => {
  it("delegante: só quem é aprovador nominal de aprovação delegável", () => {
    expect(delegators(s.people, s.templates).map((p) => p.name)).toEqual(["Joana Reis", "Marina Costa"])
    expect(approvalsOf(s.templates, ID.person.joana).map((a) => a.slot.id)).toEqual([SGI_APPROVAL.vapor.slotId])
    expect(approvalsOf(s.templates, ID.person.paulo)).toEqual([])
  })

  it("delegado: cargo da aprovação no escopo, nunca o próprio delegante", () => {
    const joana = approvalsOf(s.templates, ID.person.joana)
    const names = (scope: string[]) => delegateCandidates(s.people, joana, ID.person.joana, scope, TODAY, NOW).map((p) => p.name)
    // Toda a unidade: só quem tem Supervisão sem restrição de local.
    expect(names([])).toEqual(["Marina Costa"])
    // Planta Norte: Rafael supervisiona só a Norte e passa a ser oferecido.
    expect(names(pathIds(s.locations, SGI_LOC.norte))).toEqual(["Marina Costa", "Rafael Nunes"])
    expect(names(pathIds(s.locations, SGI_LOC.sul))).toEqual(["Marina Costa"])
    // Conta desativada some da lista.
    const off = s.people.map((p) => (p.id === ID.person.marina ? { ...p, enabled: false } : p))
    expect(delegateCandidates(off, joana, ID.person.joana, [], TODAY, NOW)).toEqual([])
  })

  it("escopo do SGI é a planta ativa", () => {
    const plants = plantScopes(s.locations).map((l) => l.id)
    expect(plants).toContain(SGI_LOC.norte)
    expect(plants).not.toContain(SGI_LOC.leste)
    expect(plants.every((id) => s.locations.find((l) => l.id === id)!.parentId === null)).toBe(true)
  })

  it("período em dias: hoje começa agora, fim inclusivo, até sete dias", () => {
    expect(windowOf(TODAY, TODAY, NOW, TZ)).toEqual({ startsAt: NOW, endsAt: "2026-11-25T00:00:00-03:00" })
    expect(windowOf("2026-11-26", "2026-12-02", NOW, TZ)).toEqual({ startsAt: "2026-11-26T00:00:00-03:00", endsAt: "2026-12-03T00:00:00-03:00" })
    expect(windowOf("2026-11-26", "2026-12-03", NOW, TZ)).toEqual({ error: "A delegação vale no máximo 7 dias corridos." })
    expect(windowOf("2026-11-23", "2026-11-25", NOW, TZ)).toEqual({ error: "O início não pode ser no passado." })
    expect(windowOf("2026-11-26", "2026-11-25", NOW, TZ)).toEqual({ error: "O fim deve ser igual ou posterior ao início." })
    expect(windowOf("", "2026-11-25", NOW, TZ)).toEqual({ error: "Informe o início e o fim." })
  })

  it("rótulos do SGI: período, iniciais", () => {
    expect(dayLabel("2024-01-10")).toBe("10 jan 2024")
    expect(lastDay("2026-12-03T00:00:00-03:00", TZ)).toBe("2026-12-02")
    expect(periodLabel({ startsAt: "2026-11-26T00:00:00-03:00", endsAt: "2026-12-03T00:00:00-03:00" }, TZ)).toBe("26 nov 2026 — 02 dez 2026")
    expect(initials("Ana Lima")).toBe("AL")
    expect(initials("Fernanda de Souza")).toBe("FS")
    expect(initials("Marina")).toBe("M")
  })

  it("filtro por status e período; revogar só ativa ou agendada", () => {
    const ativa = mk("a", "2026-11-24T08:00:00-03:00", "2026-11-26T00:00:00-03:00")
    const agendada = mk("b", "2026-11-28T00:00:00-03:00", "2026-11-30T00:00:00-03:00")
    const expirada = mk("c", "2026-11-10T00:00:00-03:00", "2026-11-12T00:00:00-03:00")
    const revogada = mk("d", "2026-11-24T09:00:00-03:00", "2026-11-25T00:00:00-03:00", { revokedAt: "2026-11-24T09:30:00-03:00", revokedBy: ID.person.marina, revokedReason: "Retorno" })
    const all = [expirada, ativa, revogada, agendada]
    const ids = (f: Parameters<typeof filterDelegations>[1]) => filterDelegations(all, f, NOW, TZ).map((d) => d.id)
    expect(ids({ status: "", from: "", to: "" })).toEqual(["b", "d", "a", "c"])
    expect(ids({ status: "ativa", from: "", to: "" })).toEqual(["a"])
    expect(ids({ status: "agendada", from: "", to: "" })).toEqual(["b"])
    expect(ids({ status: "expirada", from: "", to: "" })).toEqual(["c"])
    expect(ids({ status: "revogada", from: "", to: "" })).toEqual(["d"])
    // Período cruza a vigência: 25/11 pega a ativa (vai até 26 00:00) mas não a revogada (até 25 00:00).
    expect(ids({ status: "", from: "2026-11-25", to: "2026-11-25" })).toEqual(["a"])
    expect(ids({ status: "", from: "2026-11-29", to: "" })).toEqual(["b"])
    expect(ids({ status: "", from: "", to: "2026-11-11" })).toEqual(["c"])
    expect([ativa, agendada, expirada, revogada].map((d) => canRevoke(d, NOW))).toEqual([true, true, false, false])
  })
})

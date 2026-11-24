import { expect, it } from "vitest"
import { delegationMatches, delegationStatus, type Delegation } from "./delegation"
import { checkSlotAt } from "./eligibility"
import type { Person } from "@/registry/types"

const d: Delegation = { id: "d", slotId: "s", delegatorId: "a", delegateId: "b", scopeLocationId: "loc", startsAt: "2026-11-23T08:00:00-03:00", endsAt: "2026-11-23T16:00:00-03:00", reason: "Ausência", createdBy: "admin", createdAt: "2026-11-23T08:00:00-03:00", revokedAt: null, revokedBy: null, revokedReason: null, revision: 1 }
const slot = { id: "s", delegable: true, personId: "a", kind: "pessoa" as const, roleIds: ["role"] }
const person = (id: string): Person => ({ id, unitId: "unit", name: id, login: id, company: "", employeeId: "", enabled: true, accountExpires: null, adObjectGuid: null, origin: "manual", status: "ativo", revision: 1, updatedAt: d.createdAt, roles: [{ id: id + "-role", roleId: "role", validUntil: "2026-12-31", scopeLocationId: "loc" }] })

it("vigência tem fim exclusivo, escopo e revogação imediata", () => {
  expect(delegationStatus(d, "2026-11-23T07:59:59-03:00")).toBe("agendada")
  expect(delegationMatches(d, slot, ["loc"], d.startsAt)).toBe(true)
  expect(delegationMatches(d, slot, ["outra"], d.startsAt)).toBe(false)
  expect(delegationMatches(d, { ...slot, delegable: false }, ["loc"], d.startsAt)).toBe(false)
  expect(delegationStatus(d, d.endsAt)).toBe("expirada")
  expect(delegationStatus({ ...d, revokedAt: d.startsAt }, d.startsAt)).toBe("revogada")
})

it("mandato não transfere cargo nem contorna conta ou elegibilidade do delegante", () => {
  const people = [person("a"), person("b")]
  const candidates = (p: Person[], mandate = d) => checkSlotAt(p, null, slot, ["loc"], "2026-11-23", d.startsAt, [mandate])
  expect(candidates(people).find((c) => c.person.id === "b")).toMatchObject({ ok: true, delegation: { id: "d", delegatorId: "a" } })
  expect(candidates([people[0], { ...people[1], roles: [] }]).find((c) => c.person.id === "b")?.ok).toBe(false)
  expect(candidates([{ ...people[0], enabled: false }, people[1]]).some((c) => c.person.id === "b")).toBe(false)
  expect(candidates(people, { ...d, revokedAt: d.startsAt }).some((c) => c.person.id === "b")).toBe(false)
})

it("mandato geral (sem aprovação escolhida) cobre todas as aprovações nominais do delegante", () => {
  const geral = { ...d, slotId: null }
  expect(delegationMatches(geral, slot, ["loc"], d.startsAt)).toBe(true)
  expect(delegationMatches(geral, { ...slot, id: "outra-aprovacao" }, ["loc"], d.startsAt)).toBe(true)
  expect(delegationMatches(geral, { ...slot, personId: "outra-pessoa" }, ["loc"], d.startsAt)).toBe(false)
  expect(delegationMatches(geral, { ...slot, delegable: false }, ["loc"], d.startsAt)).toBe(false)
  expect(delegationMatches(geral, slot, ["outra"], d.startsAt)).toBe(false)
  expect(delegationMatches({ ...d, slotId: "s2" }, slot, ["loc"], d.startsAt)).toBe(false)
})

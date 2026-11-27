/** SPEC 015: the lists offer exactly the people `personIneligible` accepts. */
import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import { SIM_START } from "@/permit/seed"
import type { Person } from "@/registry/types"
import { eligibilityHint, eligiblePeople, personIneligible, teamIneligible } from "./eligibility"
import { dayOf } from "./time"

const NOW = SIM_START, TODAY = dayOf(NOW)
const ROLE = ID.role.exec, PLACE = "loc-a", OTHER = "loc-b"
const base = seed.people.find((x) => x.id === ID.person.paulo)!
const make = (id: string, over: Partial<Person> = {}, role: Partial<Person["roles"][number]> = {}): Person =>
  ({ ...base, id, name: id, status: "ativo", login: "x", enabled: true, accountExpires: null, roles: [{ id: `r-${id}`, roleId: ROLE, scopeLocationId: null, validUntil: "2099-12-31", ...role }], ...over })

describe("eligiblePeople", () => {
  const people = [
    make("ok"),
    make("scopeHere", {}, { scopeLocationId: PLACE }),
    make("scopeElsewhere", {}, { scopeLocationId: OTHER }),
    make("expiredRole", {}, { validUntil: "2000-01-01" }),
    make("disabled", { enabled: false }),
    make("expiredAccount", { accountExpires: "2000-01-01T00:00:00Z" }),
    make("review", { status: "em_revisao" }),
    make("inactive", { status: "inativo" }),
    make("contact", { login: null }),
    make("otherRole", {}, { roleId: ID.role.tec }),
  ]
  const ids = (xs: Person[]) => xs.map((p) => p.id)
  it("só quem tem o cargo válido hoje, no local, com cadastro e conta em dia", () => {
    expect(ids(eligiblePeople(people, ROLE, [PLACE], TODAY, NOW))).toEqual(["ok", "scopeHere", "contact"])
  })
  it("o escopo muda com o local", () => {
    expect(ids(eligiblePeople(people, ROLE, [OTHER], TODAY, NOW))).toEqual(["ok", "scopeElsewhere", "contact"])
  })
  it("sem cargo pedido, só cadastro e conta", () => {
    expect(ids(eligiblePeople(people, null, [PLACE], TODAY, NOW))).toEqual(["ok", "scopeHere", "scopeElsewhere", "expiredRole", "contact", "otherRole"])
  })
  it("é o mesmo veredito de personIneligible, para todos", () => {
    for (const p of people) expect(eligiblePeople([p], ROLE, [PLACE], TODAY, NOW).length === 1).toBe(personIneligible(p, ROLE, [PLACE], TODAY, NOW) === null)
  })
  it("a orientação diz o critério", () => {
    expect(eligibilityHint("Eletricista", "Prensa 2")).toBe("Aparecem só pessoas com o cargo Eletricista válido hoje para Prensa 2, cadastro ativo e conta em dia.")
    expect(eligibilityHint(null, null)).toBe("Aparecem só pessoas com cadastro ativo e conta em dia.")
  })
})

describe("teamIneligible", () => {
  const people = [make("ok"), make("expired", {}, { validUntil: "2000-01-01" })]
  it("devolve a primeira pessoa recusada, com o motivo do banco", () => {
    expect(teamIneligible({ [ROLE]: ["ok"] }, people, [PLACE], TODAY, NOW)).toBeNull()
    expect(teamIneligible({ [ROLE]: ["ok", "expired"] }, people, [PLACE], TODAY, NOW)).toBe("Equipe: expired não elegível (cargo vencido ou fora do escopo do local)")
    expect(teamIneligible({ [ROLE]: ["ghost"] }, people, [PLACE], TODAY, NOW)).toBe("Equipe: pessoa não elegível (pessoa inexistente)")
  })
})

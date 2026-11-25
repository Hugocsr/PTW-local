import { describe, expect, it } from "vitest"
import { effectiveGrants, groupGrants, groupProblems, missingGrants, profileProblems } from "./governance"

const profiles = [
  { id: "a", permissions: ["cadastro", "auditoria"] as const, active: true },
  { id: "b", permissions: ["modelos"] as const, active: true },
  { id: "c", permissions: ["exportacao"] as const, active: false },
].map((p) => ({ ...p, permissions: [...p.permissions] }))

describe("perfis de acesso (SPEC 002)", () => {
  it("grupo concede a união dos perfis ativos, na ordem do catálogo", () => {
    expect(groupGrants(["b", "a"], profiles)).toEqual(["cadastro", "modelos", "auditoria"])
    expect(groupGrants(["c"], profiles)).toEqual([])
    expect(groupGrants([], profiles)).toEqual([])
  })
  it("regra 9: só concede o que tem", () => {
    expect(missingGrants(["cadastro", "auditoria"], ["cadastro"])).toEqual(["auditoria"])
    expect(missingGrants(["cadastro"], ["cadastro", "modelos"])).toEqual([])
  })
  it("permissões efetivas = diretório ∪ grupos, sem repetir", () => {
    expect(effectiveGrants(["auditoria"], [{ grant: "cadastro", from: "grupo", groupId: "g", profileId: "a" }, { grant: "auditoria", from: "grupo" }])).toEqual(["cadastro", "auditoria"])
  })
  it("valida perfil e grupo", () => {
    expect(profileProblems({ id: "x", name: " ", description: "", permissions: [], active: true })).toHaveLength(2)
    expect(profileProblems({ id: "x", name: "Ok", description: "", permissions: ["cadastro"], active: true })).toEqual([])
    expect(groupProblems({ id: "g", name: "G", description: "", active: true, memberIds: ["p", "p"], profileIds: Array(11).fill("a") })).toHaveLength(2)
  })
})

it("grupos exigem nome e membros únicos, respeitando o limite de tamanho", () => {
  const valid = { id: "grupo", name: "Manutenção", description: "Equipe", active: true, memberIds: ["a", "b"] }
  expect(groupProblems(valid)).toEqual([])
  expect(groupProblems({ ...valid, name: " " }).length).toBeGreaterThan(0)
  expect(groupProblems({ ...valid, memberIds: ["a", "a"] }).length).toBeGreaterThan(0)
  expect(groupProblems({ ...valid, description: "x".repeat(501) }).length).toBeGreaterThan(0)
})

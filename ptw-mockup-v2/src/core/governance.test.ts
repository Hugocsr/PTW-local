import { expect, it } from "vitest"
import { groupProblems } from "./governance"

it("grupos exigem nome e membros únicos, respeitando o limite de tamanho", () => {
  const valid = { id: "grupo", name: "Manutenção", description: "Equipe", active: true, memberIds: ["a", "b"] }
  expect(groupProblems(valid)).toEqual([])
  expect(groupProblems({ ...valid, name: " " }).length).toBeGreaterThan(0)
  expect(groupProblems({ ...valid, memberIds: ["a", "a"] }).length).toBeGreaterThan(0)
  expect(groupProblems({ ...valid, description: "x".repeat(501) }).length).toBeGreaterThan(0)
})

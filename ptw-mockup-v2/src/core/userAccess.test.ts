import { describe, expect, it } from "vitest"
import { accessOfGroups, groupLocked, membershipChanges, userAccess } from "./userAccess"

const profiles = [
  { id: "pc", name: "Gestor de cadastros", permissions: ["cadastro" as const], active: true },
  { id: "pa", name: "Auditor", permissions: ["auditoria" as const], active: true },
  { id: "px", name: "Antigo", permissions: ["modelos" as const], active: false },
]
const groups = [
  { id: "g1", revision: 3, active: true, memberIds: ["ana"], profileIds: ["pc"], plantIds: ["norte"] },
  { id: "g2", revision: 1, active: true, memberIds: [], profileIds: ["pa", "px"], plantIds: ["sul"] },
  { id: "g3", revision: 2, active: false, memberIds: ["ana"], profileIds: ["pa"], plantIds: ["leste"] },
]
const rootOf = (id: string) => (id.startsWith("norte") ? "norte" : id.startsWith("sul") ? "sul" : null)

describe("SPEC 007: acesso do usuário", () => {
  it("perfis e plantas vêm só dos grupos ativos, mais as plantas dos cargos", () => {
    const a = userAccess({ id: "ana", roles: [{ scopeLocationId: "sul/area" }, { scopeLocationId: null }] }, groups, profiles, rootOf)
    expect(a.groupIds).toEqual(["g1"])
    expect(a.profiles.map((p) => p.id)).toEqual(["pc"])
    expect(a.grants).toEqual(["cadastro"])
    expect(a.plantIds.sort()).toEqual(["norte", "sul"])
    expect(userAccess({ id: "bia", roles: [] }, groups, profiles, rootOf)).toEqual({ groupIds: [], profiles: [], grants: [], plantIds: [] })
  })

  it("o resumo do modal recalcula e ignora perfil inativo", () => {
    const a = accessOfGroups(["g1", "g2"], groups, profiles)
    expect(a.profiles.map((p) => p.name)).toEqual(["Auditor", "Gestor de cadastros"])
    expect(a.grants).toEqual(["cadastro", "auditoria"])
  })

  it("trava o grupo que dá o que quem edita não tem", () => {
    expect(groupLocked(groups[1], profiles, ["cadastro"])).toEqual(["auditoria"])
    expect(groupLocked(groups[0], profiles, ["cadastro"])).toEqual([])
  })

  it("manda só os grupos cuja participação mudou, com a revisão lida", () => {
    expect(membershipChanges("ana", groups, new Set(["g2", "g3"]))).toEqual([{ id: "g1", revision: 3, member: false }, { id: "g2", revision: 1, member: true }])
    expect(membershipChanges("ana", groups, new Set(["g1", "g3"]))).toEqual([])
  })
})

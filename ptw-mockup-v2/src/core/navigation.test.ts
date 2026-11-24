import { describe, expect, it } from "vitest"
import { canReadView, navigationGroup, navigationSections, visibleViews, type NavigationAccess } from "./navigation"

const operator: NavigationAccess = { canEditRegistry: false, canEditModels: false, canAudit: false, canExport: false }
const operation = ["minha-area", "quadro", "desabilitados"]
const registry = ["locais", "ativos", "pessoas"]
const references = [...registry, "modelos", "tipos", "listas"]

describe("menu único por permissões", () => {
  it("mantém operações e consultas do operador sem destinos de gestão/auditoria", () => {
    expect(navigationSections(operator)).toEqual([
      { group: "operation", views: operation }, { group: "governance", views: ["delegacoes"] }, { group: "reference", views: references },
    ])
    expect(canReadView("auditoria", operator)).toBe(false)
    expect(navigationGroup("auditoria", operator)).toBeNull()
  })

  it("exibe todos os destinos do administrador ao mesmo tempo, sem duplicar consultas", () => {
    expect(navigationSections({ canEditRegistry: true, canEditModels: true, canAudit: true, canExport: true })).toEqual([
      { group: "operation", views: operation },
      { group: "registry", views: registry },
      { group: "configuration", views: ["modelos", "tipos", "listas", "identidade"] },
      { group: "governance", views: ["grupos", "delegacoes", "auditoria"] },
    ])
  })

  it("cadastro permite gerir Tipos/Listas sem promover a gestão de Modelos", () => {
    expect(navigationSections({ ...operator, canEditRegistry: true })).toEqual([
      { group: "operation", views: operation }, { group: "registry", views: registry },
      { group: "configuration", views: ["tipos", "listas"] }, { group: "governance", views: ["grupos", "delegacoes"] }, { group: "reference", views: ["modelos"] },
    ])
  })

  it("modelos não concede gestão de cadastros, Tipos ou Listas", () => {
    const access = { ...operator, canEditModels: true }
    expect(navigationSections(access)).toEqual([
      { group: "operation", views: operation }, { group: "configuration", views: ["modelos", "identidade"] },
      { group: "governance", views: ["delegacoes"] },
      { group: "reference", views: [...registry, "tipos", "listas"] },
    ])
    expect(canReadView("auditoria", access)).toBe(false)
  })

  it("auditoria e exportação são independentes e não concedem gestão", () => {
    expect(navigationSections({ ...operator, canExport: true })).toEqual(navigationSections(operator))
    expect(navigationSections({ ...operator, canAudit: true })).toEqual([
      { group: "operation", views: operation }, { group: "governance", views: ["delegacoes", "auditoria"] },
      { group: "reference", views: references },
    ])
  })

  it("mantém sidebar e busca coerentes, sem grupos vazios, em todas as combinações de grants", () => {
    for (let mask = 0; mask < 16; mask++) {
      const access = { canEditRegistry: !!(mask & 1), canEditModels: !!(mask & 2), canAudit: !!(mask & 4), canExport: !!(mask & 8) }
      const sections = navigationSections(access)
      const views = sections.flatMap((section) => section.views)
      expect(new Set(views).size).toBe(views.length)
      expect(sections.every((section) => section.views.length > 0)).toBe(true)
      expect([...views].sort()).toEqual(visibleViews(access).sort())
      expect(views.includes("auditoria")).toBe(access.canAudit)
      expect(views.includes("identidade")).toBe(access.canEditModels)
      expect(views.includes("grupos")).toBe(access.canEditRegistry)
    }
  })

  it("uma mudança de sessão recalcula os destinos sem conservar o grant anterior", () => {
    expect(visibleViews({ ...operator, canAudit: true })).toContain("auditoria")
    expect(visibleViews(operator)).not.toContain("auditoria")
    expect(navigationGroup("ativos", { ...operator, canEditRegistry: true })).toBe("registry")
    expect(navigationGroup("ativos", operator)).toBe("reference")
  })
})

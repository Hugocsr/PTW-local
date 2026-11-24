import { describe, expect, it } from "vitest"
import { cardsPerBlock, dashboardTab, initialOpenGroups, isBlock, legacyDashboardHash } from "./dashboard"

describe("Dashboard (SPEC 001)", () => {
  it("rotas antigas levam ao ponto certo do Dashboard (CA-04)", () => {
    expect(legacyDashboardHash("minha-area")).toBe("dashboard")
    expect(legacyDashboardHash("minha-area", "pts")).toBe("dashboard/pts")
    expect(legacyDashboardHash("minha-area", "eu")).toBe("dashboard/eu")
    expect(legacyDashboardHash("pendencias")).toBe("dashboard")
    expect(legacyDashboardHash("campo")).toBe("dashboard")
    expect(legacyDashboardHash("desabilitados")).toBe("dashboard/protecoes")
    expect(legacyDashboardHash("quadro")).toBeNull()
    expect(legacyDashboardHash("dashboard")).toBeNull()
  })

  it("abas conhecidas do Dashboard; o resto vira a página", () => {
    for (const t of ["eu", "pts", "protecoes", "sua-vez", "aguardando", "em-campo"]) expect(dashboardTab(t)).toBe(t)
    expect(dashboardTab("x")).toBeUndefined()
    expect(dashboardTab(undefined)).toBeUndefined()
    expect(isBlock("aguardando")).toBe(true)
    expect(isBlock("eu")).toBe(false)
    expect(isBlock(undefined)).toBe(false)
  })

  it("cartões por bloco antes de Ver todas: 3 no desktop e celular, 2 no tablet", () => {
    expect(cardsPerBlock("desktop")).toBe(3)
    expect(cardsPerBlock("phone")).toBe(3)
    expect(cardsPerBlock("tablet")).toBe(2)
  })

  it("os grupos do detalhamento começam abertos", () => {
    expect(initialOpenGroups()).toEqual({ vigor: true, reabilitar: true, aprovacao: true })
  })
})

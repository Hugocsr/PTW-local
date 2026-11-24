import { describe, expect, it } from "vitest"
import { DEFAULT_BRAND } from "./brand"
import { appearanceProblems, BRAND_PRESETS, brandImageUrl } from "./appearance"

describe("identidade publicada", () => {
  it("presets preservam contraste, nomes e paleta semântica independente", () => {
    for (const p of BRAND_PRESETS) expect(appearanceProblems({ ...DEFAULT_BRAND, colors: { ...p.colors } })).toEqual([])
    expect(appearanceProblems({ ...DEFAULT_BRAND, colors: { ...DEFAULT_BRAND.colors, ink: "#ffffff" } }).length).toBeGreaterThan(0)
    expect(appearanceProblems({ ...DEFAULT_BRAND, name: " " }).length).toBeGreaterThan(0)
  })
  it("resolve conteúdo publicado sem ampliar os caminhos de anexos ou aceitar URLs externas", () => {
    expect(brandImageUrl("a".repeat(64) + ".png")).toBe(`/api/v1/appearance/assets/${"a".repeat(64)}.png`)
    expect(brandImageUrl("logo.svg")).toBe("/tema/logo.svg")
    expect(brandImageUrl(null)).toBeNull()
    expect(appearanceProblems({ ...DEFAULT_BRAND, logo: "https://example.com/a.png" })).not.toEqual([])
    expect(appearanceProblems({ ...DEFAULT_BRAND, logo: "../a.png" })).not.toEqual([])
  })
})

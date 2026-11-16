import { describe, expect, it } from "vitest"
import { brandFontFace, brandVars, contrast, DEFAULT_BRAND, isDefaultBrand, onBrand, parseBrand } from "./brand"

describe("tema da planta", () => {
  it("sem arquivo, ou com um vazio, vale o padrão e nada é escrito", () => {
    expect(parseBrand(undefined)).toEqual({ brand: DEFAULT_BRAND, problems: [] })
    expect(isDefaultBrand(parseBrand({}).brand)).toBe(true)
    expect(parseBrand([]).problems).toEqual(["tema.json precisa ser um objeto"])
  })

  it("lê nome, sigla, logo, cores e fonte", () => {
    const { brand, problems } = parseBrand({ nome: " Planta Norte ", sigla: "PN", logo: "logo.svg", simbolo: "folha.png", cores: { marca: "#0B5D3B", fundo: "#F2F5F1", tinta: "#10201A" }, fonte: { familia: "Inter", arquivo: "inter.woff2" } })
    expect(problems).toEqual([])
    expect(brand).toEqual({ name: "Planta Norte", mark: "PN", logo: "logo.svg", symbol: "folha.png", colors: { brand: "#0b5d3b", canvas: "#f2f5f1", ink: "#10201a" }, font: { family: "Inter", file: "inter.woff2" } })
    expect(isDefaultBrand(brand)).toBe(false)
  })

  it("recusa o que não lê bem ou sai da pasta, e mantém o padrão naquele ponto", () => {
    const r = parseBrand({ nome: "", sigla: "LONGA", logo: "../segredo.svg", simbolo: "a/b.svg", cores: { marca: "#7a7a7a", fundo: "#222222", tinta: "verde" }, fonte: { familia: "Inter", arquivo: "http://x/f.woff2" } })
    expect(r.brand).toEqual(DEFAULT_BRAND)
    expect(r.problems).toEqual([
      "nome: texto de 1 a 40 caracteres",
      "sigla: texto de 1 a 3 caracteres",
      "logo: nome de um arquivo svg, png ou webp na pasta do tema (sem barras)",
      "simbolo: nome de um arquivo svg, png ou webp na pasta do tema (sem barras)",
      "cores.tinta: use o formato #rrggbb",
      "cores.fundo: o texto não lê bem sobre este fundo (mínimo 7:1); use um tom claro",
      "cores.marca: nem texto branco nem escuro lê bem sobre esta cor (mínimo 4,5:1)",
      "fonte.arquivo: nome de um arquivo woff2, woff ou ttf na pasta do tema (sem barras)",
    ])
    expect(parseBrand({ cores: { tinta: "#999999" } }).problems).toEqual(["cores.tinta: clara demais para texto sobre branco (mínimo 7:1)"])
    expect(parseBrand({ logo: "logo.exe" }).brand.logo).toBeNull()
  })

  it("o texto sobre a cor da marca é branco quando lê, senão a tinta", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(onBrand(parseBrand({ cores: { marca: "#0b5d3b" } }).brand)).toBe("#ffffff")
    expect(onBrand(parseBrand({ cores: { marca: "#ffd200" } }).brand)).toBe(DEFAULT_BRAND.colors.ink)
  })

  it("as variáveis do tema nunca tocam as cores de estado", () => {
    const vars = brandVars(parseBrand({ cores: { marca: "#0b5d3b" }, fonte: { familia: "Inter" } }).brand)
    expect(vars["--primary"]).toBe("#0b5d3b")
    expect(vars["--primary-foreground"]).toBe("#ffffff")
    expect(vars["--app-font"]).toBe("'Inter'")
    // The greys follow the canvas and the ink of the theme.
    expect(vars["--surface-well"]).toBe("color-mix(in srgb, #f4f3ef 96%, #12151c)")
    expect(Object.keys(vars).filter((k) => k.startsWith("--st-") || k.includes("destructive") || k.includes("ok-"))).toEqual([])
  })

  it("fonte com arquivo vira @font-face da pasta do tema", () => {
    expect(brandFontFace(DEFAULT_BRAND)).toBeNull()
    expect(brandFontFace(parseBrand({ fonte: { familia: "Inter", arquivo: "inter.woff2" } }).brand)).toBe("@font-face { font-family: 'Inter'; src: url('/tema/inter.woff2') format('woff2'); font-weight: 100 900; font-display: swap; }")
  })
})

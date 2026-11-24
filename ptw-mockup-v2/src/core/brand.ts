/**
 * The plant's look ("tema da planta"): product name, mark, logo, three colours and the text font, read
 * from `/tema/tema.json`. Pure: this file only checks the theme and says which CSS variables it sets.
 *
 * What a theme may NOT change: the state colours (green done, blue your turn, amber attention, red
 * stopped). They are a safety signal and stay the same in every plant. A colour that would make text
 * hard to read is refused and the default stays, with the reason in `problems`.
 */

export interface Brand {
  /** Product name in the sidebar, the login and the browser tab. */
  name: string
  /** One to three letters shown where there is no room for the logo. */
  mark: string
  /** Wide logo (symbol + name), a file under `/tema/` (svg, png, webp); shown where there is room. */
  logo: string | null
  /** Square symbol, a file under `/tema/`; takes the place of the letters. */
  symbol: string | null
  colors: { brand: string; canvas: string; ink: string }
  /** `file`: a font file under `/tema/` (woff2, woff, ttf); null = a font the app already has or the device's. */
  font: { family: string; file: string | null }
}

export const DEFAULT_BRAND: Brand = {
  name: "PTW Local",
  mark: "PT",
  logo: null,
  symbol: null,
  colors: { brand: "#635bff", canvas: "#f6f8fc", ink: "#16213b" },
  font: { family: "Geist Variable", file: null },
}

const HEX = /^#[0-9a-f]{6}$/i
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,60}$/
const WHITE = "#ffffff"

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio between two "#rrggbb" colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Text on the brand colour: white when it reads (4.5:1), else the ink. */
export const onBrand = (b: Brand): string => (contrast(WHITE, b.colors.brand) >= 4.5 ? WHITE : b.colors.ink)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const ext = (f: string) => f.slice(f.lastIndexOf(".") + 1).toLowerCase()

/**
 * Reads `tema.json` (keys in Portuguese: nome, sigla, logo, simbolo, cores {marca, fundo, tinta}, fonte
 * {familia, arquivo}). Every key is optional; what is absent or refused keeps the default, and each refusal is a
 * sentence in `problems` for whoever is setting the theme up.
 */
export function parseBrand(raw: unknown): { brand: Brand; problems: string[] } {
  const problems: string[] = []
  const brand: Brand = structuredClone(DEFAULT_BRAND)
  if (!isObj(raw)) return { brand, problems: raw === undefined || raw === null ? [] : ["tema.json precisa ser um objeto"] }
  const text = (key: string, max: number): string | undefined => {
    const v = raw[key]
    if (v === undefined || v === null) return undefined
    if (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= max) return v.trim()
    problems.push(`${key}: texto de 1 a ${max} caracteres`)
    return undefined
  }
  brand.name = text("nome", 40) ?? brand.name
  brand.mark = text("sigla", 3) ?? brand.mark

  const image = (key: string): string | null => {
    const v = raw[key]
    if (v === undefined || v === null) return null
    if (typeof v === "string" && FILE.test(v) && ["svg", "png", "webp"].includes(ext(v))) return v
    problems.push(`${key}: nome de um arquivo svg, png ou webp na pasta do tema (sem barras)`)
    return null
  }
  brand.logo = image("logo")
  brand.symbol = image("simbolo")

  const cores = isObj(raw.cores) ? raw.cores : {}
  if (raw.cores !== undefined && !isObj(raw.cores)) problems.push("cores: precisa ser um objeto")
  const color = (key: string): string | undefined => {
    const v = cores[key]
    if (v === undefined || v === null) return undefined
    if (typeof v === "string" && HEX.test(v)) return v.toLowerCase()
    problems.push(`cores.${key}: use o formato #rrggbb`)
    return undefined
  }
  const marca = color("marca"), fundo = color("fundo"), tinta = color("tinta")
  // The ink has to read on the canvas and on the white sheets (7:1); the canvas has to stay light.
  const ink = tinta ?? brand.colors.ink
  const canvas = fundo ?? brand.colors.canvas
  if (tinta && contrast(tinta, WHITE) < 7) problems.push("cores.tinta: clara demais para texto sobre branco (mínimo 7:1)")
  else if (fundo && contrast(ink, canvas) < 7) problems.push("cores.fundo: o texto não lê bem sobre este fundo (mínimo 7:1); use um tom claro")
  else brand.colors = { ...brand.colors, ink, canvas }
  // The brand colour carries the main button: its text (white or the ink) has to read on it.
  if (marca) {
    if (Math.max(contrast(WHITE, marca), contrast(brand.colors.ink, marca)) >= 4.5) brand.colors.brand = marca
    else problems.push("cores.marca: nem texto branco nem escuro lê bem sobre esta cor (mínimo 4,5:1)")
  }

  if (raw.fonte !== undefined && raw.fonte !== null) {
    const f = isObj(raw.fonte) ? raw.fonte : null
    if (!f) problems.push("fonte: precisa ser um objeto")
    else if (typeof f.familia !== "string" || !FAMILY.test(f.familia)) problems.push("fonte.familia: o nome da fonte, só letras, números, espaço e hífen")
    else if (f.arquivo !== undefined && f.arquivo !== null && !(typeof f.arquivo === "string" && FILE.test(f.arquivo) && ["woff2", "woff", "ttf"].includes(ext(f.arquivo)))) {
      problems.push("fonte.arquivo: nome de um arquivo woff2, woff ou ttf na pasta do tema (sem barras)")
    } else brand.font = { family: f.familia, file: (f.arquivo as string | null | undefined) ?? null }
  }
  return { brand, problems }
}

/**
 * The CSS variables a theme sets on the page root. State colours are never among them. The greys of the
 * app (wells, quiet surfaces, lines, secondary text) are mixed from the canvas and the ink, so the whole
 * page takes the tone of the plant's paper instead of a neutral grey.
 */
export function brandVars(b: Brand): Record<string, string> {
  const on = onBrand(b)
  const { canvas, ink } = b.colors
  const tone = (canvasPct: number) => `color-mix(in srgb, ${canvas} ${canvasPct}%, ${ink})`
  return {
    "--surface-well": tone(96),
    "--surface-fixed": tone(90),
    "--muted": tone(97),
    "--secondary": tone(96),
    "--accent": tone(96),
    "--border": tone(84),
    "--sidebar-border": tone(88),
    "--muted-foreground": `color-mix(in srgb, ${ink} 85%, white)`,
    "--sidebar-foreground": ink,
    "--primary": b.colors.brand,
    "--primary-foreground": on,
    "--sidebar-primary": b.colors.brand,
    "--sidebar-primary-foreground": on,
    "--ring": b.colors.brand,
    "--brand-mark-from": b.colors.brand,
    "--brand-glow": `color-mix(in srgb, ${b.colors.brand} 14%, white)`,
    "--foreground": b.colors.ink,
    "--card-foreground": b.colors.ink,
    "--popover-foreground": b.colors.ink,
    "--surface-canvas": b.colors.canvas,
    "--sidebar": WHITE,
    "--sidebar-accent": `color-mix(in srgb, ${b.colors.brand} 9%, white)`,
    "--sidebar-accent-foreground": ink,
    "--sidebar-ring": b.colors.brand,
    "--app-font": `'${b.font.family}'`,
  }
}

/** The `@font-face` rule for a font file of the theme, or null when the theme brings none. */
export function brandFontFace(b: Brand, base = "/tema/"): string | null {
  if (!b.font.file) return null
  const format = { woff2: "woff2", woff: "woff", ttf: "truetype" }[ext(b.font.file)]
  return `@font-face { font-family: '${b.font.family}'; src: url('${base}${b.font.file}') format('${format}'); font-weight: 100 900; font-display: swap; }`
}

/** True when the theme is the default one: nothing is written on the page. */
export const isDefaultBrand = (b: Brand): boolean => JSON.stringify(b) === JSON.stringify(DEFAULT_BRAND)

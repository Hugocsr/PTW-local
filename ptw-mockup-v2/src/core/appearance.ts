import { parseBrand, type Brand } from "./brand.ts"

export interface AppearanceRecord {
  revision: number
  brand: Brand | null
  updatedAt: string | null
  updatedBy: string | null
}

/** Drops presentation-only fields (resolved URLs) without changing or repairing the edited values. */
export function editableBrand(b: Brand): Brand {
  return { name: b.name, mark: b.mark, logo: b.logo, symbol: b.symbol, colors: { ...b.colors }, font: { ...b.font } }
}

/** Converts the editor's brand to the compatible plant-file contract. */
export function brandManifest(b: Brand): Record<string, unknown> {
  return { nome: b.name, sigla: b.mark, logo: b.logo, simbolo: b.symbol,
    cores: { marca: b.colors.brand, fundo: b.colors.canvas, tinta: b.colors.ink },
    fonte: { familia: b.font.family, arquivo: b.font.file } }
}

/** Rejects inaccessible colours and unsafe asset/font names using the existing theme rules. */
export function appearanceProblems(b: Brand): string[] {
  return parseBrand(brandManifest(b)).problems
}

/** Uploaded images have content addresses; legacy plant files retain their original directory. */
export function brandImageUrl(file: string | null): string | null {
  return file === null ? null : /^[0-9a-f]{64}\.png$/.test(file) ? `/api/v1/appearance/assets/${file}` : `/tema/${file}`
}

export const BRAND_PRESETS = [
  { name: "Violeta", colors: { brand: "#635bff", canvas: "#f6f8fc", ink: "#16213b" } },
  { name: "Azul industrial", colors: { brand: "#1d4ed8", canvas: "#f1f5f9", ink: "#172033" } },
  { name: "Verde", colors: { brand: "#166534", canvas: "#f4f8f5", ink: "#15251c" } },
] as const

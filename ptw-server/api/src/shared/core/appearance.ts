// @ts-nocheck — cópia de ptw-mockup-v2/src/core/appearance.ts; não edite (node scripts/sync-shared.mjs)
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

/**
 * Templates de identidade visual (SGI Forces Design System · Identidade visual): o cliente escolhe um, sem
 * edição livre de cor. "Indigo" é a primária da interface do design system; Azul, Verde, Vermelho e Preto são
 * os quatro templates definidos pela Axians, com a cor da escala aplicada (`themeRamps --primary`; ver P18). No Verde vale o degrau 700
 * (#0a7a50, o `fg-info` do template): o 600 (#0e8e5e) não chega a 4,5:1 com texto branco nem escuro.
 * Fundo slate-50 e texto slate-900 em todos.
 */
export const BRAND_PRESETS = [
  { name: "Indigo", note: "Padrão do sistema", colors: { brand: "#4f46e5", canvas: "#f8fafc", ink: "#0f172a" } },
  { name: "Azul", note: "Axians Blue", colors: { brand: "#1068eb", canvas: "#f8fafc", ink: "#0f172a" } },
  { name: "Verde", note: "Operacional", colors: { brand: "#0a7a50", canvas: "#f8fafc", ink: "#0f172a" } },
  { name: "Vermelho", note: "Alerta", colors: { brand: "#d81e1e", canvas: "#f8fafc", ink: "#0f172a" } },
  { name: "Preto", note: "Neutro", colors: { brand: "#2a2a2a", canvas: "#f8fafc", ink: "#0f172a" } },
] as const

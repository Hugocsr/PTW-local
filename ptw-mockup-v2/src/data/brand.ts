/**
 * The plant's look: a published database override, then the existing plant file, then product defaults.
 * Branding failure must not prevent the login or imply that an administrative write was confirmed.
 */
import { useMemo, useSyncExternalStore } from "react"
import { brandFontFace, brandVars, DEFAULT_BRAND, isDefaultBrand, parseBrand, type Brand } from "@/core/brand"
import { appearanceProblems, brandImageUrl } from "@/core/appearance"

const BASE = "/tema/"
let current: Brand = DEFAULT_BRAND
const listeners = new Set<() => void>()

/** Writes the theme on the page: CSS variables on the root, the font file, the tab title. */
function apply(brand: Brand) {
  current = brand
  document.title = brand.name
  for (const name of Object.keys(brandVars(DEFAULT_BRAND))) document.documentElement.style.removeProperty(name)
  document.querySelectorAll('style[data-tema="fonte"]').forEach((s) => s.remove())
  if (!isDefaultBrand(brand)) {
    for (const [name, value] of Object.entries(brandVars(brand))) document.documentElement.style.setProperty(name, value)
    const face = brandFontFace(brand, BASE)
    if (face) {
      const style = document.createElement("style")
      style.dataset.tema = "fonte"
      style.textContent = face
      document.head.append(style)
    }
  }
  listeners.forEach((fn) => fn())
}

/** Reads and applies the theme; never fails (the default look is always valid). Problems go to the console for whoever is setting it up. */
export async function loadBrand(): Promise<void> {
  const [file, saved] = await Promise.allSettled([
    fetch(`${BASE}tema.json`, { cache: "no-store", signal: AbortSignal.timeout(1200) }).then(async (r) => r.ok ? parseBrand(await r.json()).brand : DEFAULT_BRAND),
    fetch("/api/v1/appearance/public", { cache: "no-store", signal: AbortSignal.timeout(1200) }).then(async (r) => r.ok ? (await r.json() as { brand: Brand | null }).brand : null),
  ])
  const fallback = file.status === "fulfilled" ? file.value : DEFAULT_BRAND
  const published = saved.status === "fulfilled" ? saved.value : null
  let valid: Brand | null = null
  try { if (published && !appearanceProblems(published).length) valid = published }
  catch { /* Invalid public metadata falls back independently from the authenticated app. */ }
  apply(valid ?? fallback)
}

/** The theme in use, with the addresses of its wide logo and of its square symbol (null = absent). */
export function useBrand(): Brand & { logoUrl: string | null; symbolUrl: string | null } {
  const brand = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => current)
  return useMemo(() => ({ ...brand, logoUrl: brandImageUrl(brand.logo), symbolUrl: brandImageUrl(brand.symbol) }), [brand])
}

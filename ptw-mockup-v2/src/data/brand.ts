/**
 * The plant's look, loaded once when the app opens from `/tema/tema.json` (a file the plant swaps on the
 * server; `core/brand.ts` checks it). Without the file, or with a broken one, the default look stays.
 */
import { useSyncExternalStore } from "react"
import { brandFontFace, brandVars, DEFAULT_BRAND, isDefaultBrand, parseBrand, type Brand } from "@/core/brand"

const BASE = "/tema/"
let current: Brand = DEFAULT_BRAND
const listeners = new Set<() => void>()

/** Writes the theme on the page: CSS variables on the root, the font file, the tab title. */
function apply(brand: Brand) {
  current = brand
  document.title = brand.name
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
  try {
    const res = await fetch(`${BASE}tema.json`, { cache: "no-store" })
    if (!res.ok) return
    const { brand, problems } = parseBrand(await res.json())
    if (problems.length) console.warn(`tema.json: ${problems.join("; ")}`)
    apply(brand)
  } catch {
    /* no theme file, or not JSON: the default look */
  }
}

/** The theme in use, with the addresses of its wide logo and of its square symbol (null = absent). */
export function useBrand(): Brand & { logoUrl: string | null; symbolUrl: string | null } {
  const brand = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn) }, () => current)
  return { ...brand, logoUrl: brand.logo ? `${BASE}${brand.logo}` : null, symbolUrl: brand.symbol ? `${BASE}${brand.symbol}` : null }
}

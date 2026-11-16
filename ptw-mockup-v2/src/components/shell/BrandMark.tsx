import { useBrand } from "@/data/brand"
import { cn } from "@/lib/utils"

/**
 * The square mark: the symbol of the plant when the theme brings one, else the letters of the product on
 * the brand colour. Used where there is no wide logo, or no room for one. The caller gives size and text scale.
 */
export function BrandMark({ className }: { className?: string }) {
  const brand = useBrand()
  if (brand.symbolUrl) return <img src={brand.symbolUrl} alt="" className={cn("shrink-0 object-contain", className, "rounded-none")} />
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center bg-linear-to-br from-(--brand-mark-from) to-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-black/10", className)}>
      {brand.mark}
    </span>
  )
}

/**
 * The logo of the plant, when the theme brings one (any shape: it keeps its proportions inside the
 * height the caller gives, e.g. `h-7`); null without a logo, so the caller shows `BrandMark`.
 */
export function BrandLogo({ className }: { className?: string }) {
  const brand = useBrand()
  if (!brand.logoUrl) return null
  return <img src={brand.logoUrl} alt="" className={cn("w-auto max-w-44 shrink-0 object-contain object-left", className)} />
}

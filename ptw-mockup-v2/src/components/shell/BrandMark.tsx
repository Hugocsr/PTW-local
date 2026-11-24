import { LockOpenIcon } from "lucide-react"
import { DEFAULT_BRAND } from "@/core/brand"
import { useBrand } from "@/data/brand"
import { cn } from "@/lib/utils"

/**
 * The square mark (SGI Forces Design System · Logo do produto): a square in the brand colour with an open
 * padlock in white. A plant that sets its own symbol shows the image; one that sets its own letters (sigla
 * other than the product's) shows the letters. The caller gives size, radius and text scale.
 */
export function BrandMark({ className }: { className?: string }) {
  const brand = useBrand()
  if (brand.symbolUrl) return <img src={brand.symbolUrl} alt="" className={cn("shrink-0 object-contain", className, "rounded-none")} />
  const letters = brand.mark !== DEFAULT_BRAND.mark
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground shadow-sm", className)}>
      {letters ? brand.mark : <LockOpenIcon className="size-[52%]" strokeWidth={2} />}
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

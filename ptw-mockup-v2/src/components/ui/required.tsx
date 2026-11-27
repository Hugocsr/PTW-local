import { cn } from "@/lib/utils"

/**
 * SPEC 018: a required field is marked by a red asterisk after its label; nothing marks the optional ones.
 * The asterisk is decoration for the eye; screen readers hear "obrigatório".
 */
export function RequiredMark({ className }: { className?: string }) {
  // One element: inside a label that is a flex row, two siblings would be spread apart by its gap.
  return <span className={cn("-ml-1", className)}><span aria-hidden className="font-semibold text-destructive-text">*</span><span className="sr-only"> (obrigatório)</span></span>
}

/** The key to the asterisk, at the foot of every screen that uses it. */
export function RequiredLegend({ className }: { className?: string }) {
  return <p className={cn("type-meta", className)}><span aria-hidden className="mr-1 font-semibold text-destructive-text">*</span>Campo obrigatório</p>
}

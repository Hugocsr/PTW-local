import { cn } from "@/lib/utils"
import { stageProgress, type StageStatus, type StageView } from "@/core/permitView"

/** `StageView[]` (as `StageRail` takes) or the light shape for rows that only carry the numbers. */
export type MiniRailInput = StageView[] | { n: number; total: number; name?: string; statuses: StageStatus[] }

/**
 * The PT's stages as tiny segments (or dots) for cards and table rows: done = green, current = blue and wider,
 * not reached = grey, skipped = hollow. Not for the PT page (that is `StageRail`). The count "3/6" is visible
 * (`showCount`), and the whole rail is one image for screen readers: "Etapa 3 de 6 · Emissão".
 */
export function MiniRail({ rail, variant = "segments", showCount = true, className }: {
  rail: MiniRailInput
  variant?: "segments" | "dots"
  showCount?: boolean
  className?: string
}) {
  const statuses: StageStatus[] = Array.isArray(rail) ? rail.map((r) => r.status) : rail.statuses
  const { n, total } = Array.isArray(rail) ? stageProgress(rail) : rail
  const name = Array.isArray(rail) ? rail[n - 1]?.stage.name : rail.name
  if (total < 1) return null
  const text = `Etapa ${n} de ${total}${name ? ` · ${name}` : ""}`
  const dots = variant === "dots"
  return (
    <span role="img" aria-label={text} title={text} className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {statuses.map((s, i) => (
          <span key={i} className={cn("shrink-0 rounded-full transition-colors motion-fast",
            dots ? "size-2" : cn("h-1 rounded-sm", s === "atual" ? "w-5" : "w-3.5"),
            s === "feita" ? "bg-st-ok-solid"
              : s === "atual" ? "bg-st-pending-solid"
              : s === "pulada" ? "border border-st-neutral-solid bg-transparent"
              : "bg-st-neutral-border")} />
        ))}
      </span>
      {showCount && <span className="type-meta tabular-nums" aria-hidden>{n}/{total}</span>}
    </span>
  )
}

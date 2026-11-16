import { CheckIcon, MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StageView } from "@/core/permitView"

/**
 * The PT's stages as one horizontal rail (DESIGN.md · Base visual): where the permit is, at a glance.
 * Done = green check, in progress = blue ring with the number, not reached = grey number, left
 * unsigned on a hand-back = grey dash. Never colour alone: every step carries its name and, for
 * screen readers, its situation. A step is a link to its card in the Formulário tab.
 */
export function StageRail({ rail, onPick }: { rail: StageView[]; onPick?: (stageId: string) => void }) {
  if (rail.length < 2) return null
  const at = rail.findIndex((r) => r.status === "atual")
  const done = rail.filter((r) => r.status === "feita").length
  return (
    <nav aria-label="Etapas da PT" className="min-w-0">
      <p className="mb-2 type-meta sm:hidden">Etapa {at >= 0 ? at + 1 : Math.min(done + 1, rail.length)} de {rail.length}{at >= 0 ? ` · ${rail[at].stage.name}` : ""}</p>
      <ol className="flex min-w-0 items-start">
        {rail.map((r, i) => {
          const s = r.status as string
          const isDone = s === "feita", isNow = s === "atual", skipped = s === "pulada"
          const word = isDone ? "concluída" : isNow ? "em andamento" : skipped ? "não feita" : "ainda não chegou"
          return (
            <li key={r.stage.id} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 first:items-start last:items-end sm:first:items-center sm:last:items-center">
              {i > 0 && <span aria-hidden className={cn("absolute top-[13px] right-1/2 left-[-50%] h-0.5 max-sm:hidden", isDone || isNow ? "bg-st-ok-solid" : "bg-border")} />}
              <button type="button" onClick={() => onPick?.(r.stage.id)} aria-current={isNow ? "step" : undefined}
                className="relative z-10 flex min-h-11 flex-col items-center gap-1.5 rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0">
                <span className={cn("grid size-7 place-items-center rounded-full text-[0.75rem] font-semibold tabular-nums transition-colors",
                  isDone ? "bg-st-ok-solid text-background"
                    : isNow ? "bg-st-pending-solid text-background ring-4 ring-st-pending-surface"
                    : "border border-border bg-background text-muted-foreground")}>
                  {isDone ? <CheckIcon className="size-4" aria-hidden /> : skipped ? <MinusIcon className="size-4" aria-hidden /> : i + 1}
                </span>
                <span className={cn("max-w-28 text-center text-[0.75rem] leading-4 text-balance max-sm:hidden", isNow ? "font-semibold text-foreground" : isDone ? "text-foreground" : "text-muted-foreground")}>{r.stage.name}</span>
                <span className="sr-only">: {word}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

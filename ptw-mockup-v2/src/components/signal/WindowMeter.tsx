import { TimerOffIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { windowLeft } from "@/core/permitView"
import type { Permit } from "@/permit/types"
import { TONE_SOLID, TONE_TEXT } from "@/components/shell/Status"
import { fmtDuration, fmtStamp } from "@/core/permitFormat"

/**
 * Time left of a PT's authorised window: a thin bar that empties plus the time in words (never the bar alone).
 * Use it only where the work is released or the window is the point (PT state block while `workRelease` says
 * released; "Em campo" cards; the Quadro's Janela cell of an ativa PT). Tone comes from the core rule
 * `windowLeft` (> 60 min and > 15 % = ok, else attention; over = stop, full red bar, "Janela encerrada").
 * `block` sits on a tinted status surface (the state block); `card` sits on white (cards, table rows).
 * `now` is the ticking clock: pass it in, this component never reads the time.
 */
export function WindowMeter({ permit, now, size = "block", className }: {
  permit: Pick<Permit, "windowStart" | "windowEnd">
  now: string
  size?: "block" | "card"
  className?: string
}) {
  const w = windowLeft(permit, now)
  if (!w) return null
  const over = w.tone === "stop"
  const block = size === "block"
  const Icon = over ? TimerOffIcon : w.tone === "attention" ? TriangleAlertIcon : null
  const tone = TONE_TEXT[w.tone]
  return (
    <div className={cn("flex min-w-0 flex-col", block ? "gap-2" : "gap-1.5", className)} title={`Fim da janela: ${fmtStamp(permit.windowEnd)}`}>
      <p className={cn("flex min-w-0 flex-wrap items-baseline gap-x-1.5", over ? tone : "text-foreground")}>
        {Icon && <Icon className={cn("shrink-0 self-center", block ? "size-5" : "size-4", tone)} aria-hidden />}
        {over
          ? <span className={block ? "type-timer" : "type-section"}>Janela encerrada</span>
          : <>
              <span className={cn("tabular-nums", block ? "type-timer" : "type-section", w.tone === "attention" && tone)}>{fmtDuration(w.minutes)}</span>
              <span className="type-meta text-foreground">{block ? "restam da janela" : "restam"}</span>
            </>}
      </p>
      <div className={cn("overflow-hidden rounded-full", block ? "h-1.5 bg-background/70" : "h-1 bg-surface-well")} aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", TONE_SOLID[w.tone])} style={{ width: `${(over ? 1 : w.fraction) * 100}%` }} />
      </div>
    </div>
  )
}

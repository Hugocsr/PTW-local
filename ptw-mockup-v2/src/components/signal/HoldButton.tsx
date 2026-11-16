import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const HOLD_MS = 900

/**
 * A deliberate act: press and hold until the bar fills, then it confirms once. Releasing early cancels.
 * Works with pointer, touch and keyboard (hold Enter or Space). Used for signing.
 */
export function HoldButton({ onConfirm, disabled, children, className }: { onConfirm: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<number | null>(null)
  const stop = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; setHolding(false) }
  const start = () => {
    if (disabled || timer.current !== null) return
    setHolding(true)
    timer.current = window.setTimeout(() => { timer.current = null; setHolding(false); onConfirm() }, HOLD_MS)
  }
  useEffect(() => stop, [])
  const key = (e: React.KeyboardEvent) => e.key === "Enter" || e.key === " "
  return (
    <button type="button" disabled={disabled} aria-live="polite"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); start() }} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onKeyDown={(e) => { if (key(e) && !e.repeat) { e.preventDefault(); start() } }} onKeyUp={(e) => { if (key(e)) stop() }} onBlur={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("relative inline-flex touch-none items-center justify-center overflow-hidden rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none", className)}>
      {holding && <span aria-hidden className="absolute inset-0 origin-left bg-st-ok-solid" style={{ animation: `hold-fill ${HOLD_MS}ms linear forwards` }} />}
      <span className="relative">{children}</span>
    </button>
  )
}

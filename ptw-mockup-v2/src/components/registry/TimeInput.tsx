import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { maskTime, timeProblem } from "@/core/form"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * A time of day typed as digits ("1430" shows "14:30", "143005" shows "14:30:05"). The value is the
 * text "HH:mm" or "HH:mm:ss" once it is a complete, valid time: a half-typed time stays only in the
 * field (it never replaces the saved answer); emptying the field clears it (undefined). "Agora" fills the (simulated) clock, still editable. The reason a time
 * is refused is said on screen, not only by a red border.
 */
export function TimeInput({ id, value, onChange, onProblem, seconds, now, invalid, label, describedBy, className }: {
  id?: string; value: string | undefined; onChange: (v: string | undefined) => void
  /** Reports the visible draft's problem to dialogs that must block confirmation. */
  onProblem?: (problem: string | null) => void
  seconds: boolean
  /** Current time as "HH:mm:ss"; enables the "Agora" button. */
  now?: string
  invalid?: boolean; label?: string; describedBy?: string; className?: string
}) {
  // What is on screen can be longer than a valid value (half typed), so it is kept here; the answer is not.
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value ?? ""
  const problem = draft !== null && draft !== "" ? timeProblem(draft, seconds) : null
  const errId = `${id ?? "time"}-err`
  const apply = (raw: string) => {
    const m = maskTime(raw, seconds)
    setDraft(m)
    onProblem?.(m ? timeProblem(m, seconds) : null)
    if (!m) onChange(undefined)
    else if (timeProblem(m, seconds) === null) onChange(m)
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Input id={id} value={shown} inputMode="numeric" autoComplete="off" aria-label={label} aria-invalid={invalid || !!problem}
          aria-describedby={[describedBy ?? "", problem ? errId : ""].filter(Boolean).join(" ") || undefined}
          placeholder={seconds ? "hh:mm:ss" : "hh:mm"} maxLength={seconds ? 8 : 5}
          className="min-h-11 w-32 min-w-0 bg-surface-row text-center tabular-nums md:min-h-9"
          onChange={(e) => {
            const erasing = (e.nativeEvent as InputEvent).inputType?.startsWith("delete")
            // Deleting a separator would be undone by the mask: drop the digit before it instead.
            apply(erasing && e.target.value.length < shown.length && shown.endsWith(":") ? shown.slice(0, -2) : e.target.value)
          }}
          onBlur={() => {
            // With seconds, "0830" (hh:mm only) is a complete answer: it is saved as 08:30:00.
            if (seconds && draft && draft.length === 5 && timeProblem(draft, false) === null) { onChange(`${draft}:00`); onProblem?.(null); setDraft(null); return }
            setDraft((d) => (d && timeProblem(d, seconds) ? d : null))
          }} />
        {now && (
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9"
            onClick={() => { setDraft(null); onProblem?.(null); onChange(seconds ? now : now.slice(0, 5)) }}>Agora</Button>
        )}
      </div>
      {problem && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)} role="status">{problem}</p>}
    </div>
  )
}

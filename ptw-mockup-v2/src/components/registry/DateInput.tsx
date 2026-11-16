import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { dateBr, dateIso, dateProblem, maskDate } from "@/core/form"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * A date typed as digits ("08112026" shows "08/11/2026"), like the time field. The value is stored
 * ISO ("2026-11-08", as the database keeps it) and shown dd/mm/aaaa. A half-typed or impossible date
 * stays only in the field, with the reason on screen: it never replaces the saved answer. Emptying
 * the field clears it (undefined). "Hoje" fills the (simulated) date.
 */
export function DateInput({ id, value, onChange, onProblem, today, invalid, label, describedBy, className }: {
  id?: string
  /** "AAAA-MM-DD" */
  value: string | undefined; onChange: (v: string | undefined) => void
  /** A dialog can block confirmation while the visible draft is incomplete without clearing its saved value. */
  onProblem?: (problem: string | null) => void
  /** Today as "AAAA-MM-DD"; enables the "Hoje" button. */
  today?: string
  invalid?: boolean; label?: string; describedBy?: string; className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value ? dateBr(value) : "")
  const problem = draft !== null && draft !== "" ? dateProblem(draft) : null
  const errId = `${id ?? "date"}-err`
  const apply = (raw: string) => {
    const m = maskDate(raw)
    setDraft(m)
    onProblem?.(m ? dateProblem(m) : null)
    if (!m) onChange(undefined)
    else if (dateProblem(m) === null) onChange(dateIso(m)!)
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Input id={id} value={shown} inputMode="numeric" autoComplete="off" aria-label={label} aria-invalid={invalid || !!problem}
          aria-describedby={[describedBy ?? "", problem ? errId : ""].filter(Boolean).join(" ") || undefined}
          placeholder="dd/mm/aaaa" maxLength={10}
          className="min-h-11 w-36 min-w-0 bg-surface-row text-center tabular-nums md:min-h-9"
          onChange={(e) => {
            const erasing = (e.nativeEvent as InputEvent).inputType?.startsWith("delete")
            apply(erasing && e.target.value.length < shown.length && shown.endsWith("/") ? shown.slice(0, -2) : e.target.value)
          }}
          onBlur={() => setDraft((d) => (d && dateProblem(d) ? d : null))} />
        {today && <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => { setDraft(null); onProblem?.(null); onChange(today) }}>Hoje</Button>}
      </div>
      {problem && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)} role="status">{problem}</p>}
    </div>
  )
}

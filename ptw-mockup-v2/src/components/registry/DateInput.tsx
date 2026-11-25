import { useState } from "react"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { dateBr, dateIso, dateProblem, maskDate } from "@/core/form"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * A date typed as digits ("08112026" shows "08/11/2026"), like the time field. The value is stored
 * ISO ("2026-11-08", as the database keeps it) and shown dd/mm/aaaa. A half-typed or impossible date
 * stays only in the field, with the reason on screen: it never replaces the saved answer. Emptying
 * the field clears it (undefined). "Hoje" fills the (simulated) date.
 *
 * SPEC 003: every date field has a calendar (icon inside the field, or Alt+↓). `min`/`max` disable the
 * days outside; `rangeFrom` highlights the interval up to the chosen day (Fim of a period). Typing stays.
 */
const toDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d) }
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export function DateInput({ id, value, onChange, onProblem, today, invalid, label, describedBy, className, min, max, rangeFrom }: {
  id?: string
  /** "AAAA-MM-DD" */
  value: string | undefined; onChange: (v: string | undefined) => void
  /** A dialog can block confirmation while the visible draft is incomplete without clearing its saved value. */
  onProblem?: (problem: string | null) => void
  /** Today as "AAAA-MM-DD"; enables the "Hoje" button. */
  today?: string
  invalid?: boolean; label?: string; describedBy?: string; className?: string
  /** "AAAA-MM-DD": first and last day the calendar offers (typing is checked by the caller). */
  min?: string; max?: string
  /** "AAAA-MM-DD": start of the period this date ends; the calendar shades from it to the chosen day. */
  rangeFrom?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div className="relative w-40 min-w-0">
              <Input id={id} value={shown} inputMode="numeric" autoComplete="off" aria-label={label} aria-invalid={invalid || !!problem}
                aria-describedby={[describedBy ?? "", problem ? errId : ""].filter(Boolean).join(" ") || undefined}
                placeholder="dd/mm/aaaa" maxLength={10}
                className="min-h-11 w-full min-w-0 bg-surface-row pr-11 text-center tabular-nums md:min-h-9 md:pr-9"
                onKeyDown={(e) => { if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); setOpen(true) } }}
                onChange={(e) => {
                  const erasing = (e.nativeEvent as InputEvent).inputType?.startsWith("delete")
                  apply(erasing && e.target.value.length < shown.length && shown.endsWith("/") ? shown.slice(0, -2) : e.target.value)
                }}
                onBlur={() => setDraft((d) => (d && dateProblem(d) ? d : null))} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Abrir calendário${label ? ` de ${label}` : ""}`} aria-expanded={open}
                className="absolute top-0 right-0 size-11 text-muted-foreground hover:text-foreground md:size-9" onClick={() => setOpen((o) => !o)}>
                <CalendarIcon className="size-4" />
              </Button>
            </div>
          </PopoverAnchor>
          <PopoverContent align="start" collisionPadding={16} className="w-auto p-0">
            <Calendar mode="single" autoFocus today={today ? toDate(today) : undefined}
              selected={value ? toDate(value) : undefined}
              defaultMonth={value ? toDate(value) : rangeFrom ? toDate(rangeFrom) : min ? toDate(min) : today ? toDate(today) : undefined}
              disabled={[...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])]}
              modifiers={rangeFrom && value && value >= rangeFrom ? { inRange: { from: toDate(rangeFrom), to: toDate(value) } } : undefined}
              modifiersClassNames={{ inRange: "bg-primary-soft first:rounded-l-md last:rounded-r-md" }}
              onSelect={(d) => { if (!d) return; setDraft(null); onProblem?.(null); onChange(toIso(d)); setOpen(false) }} />
          </PopoverContent>
        </Popover>
        {today && <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => { setDraft(null); onProblem?.(null); onChange(today) }}>Hoje</Button>}
      </div>
      {problem && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)} role="status">{problem}</p>}
    </div>
  )
}

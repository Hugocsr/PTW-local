import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatNumberField, parseNumberText } from "@/core/form"
import { cn } from "@/lib/utils"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * A number typed as it is read ("18" is 18, "20,9" is 20,9; "," or "." separates the decimals). While
 * typing, the text is a draft; the answer is saved as soon as the text is a valid number, and left
 * alone when it is refused (too many decimals, a comma in an integer field, a minus sign without
 * `negative`): the reason is said under the field. On leaving, the field shows the saved number
 * with thousands separators and fixed decimals. Empty means no answer. With `negative`, a ± button
 * flips the sign (phone keypads have no minus). No placeholder: a grey "0,0" reads as an answer.
 */
export function NumberInput({ id, value, onChange, decimals, unit, negative, invalid, label, describedBy, className }: {
  id?: string; value: number | undefined; onChange: (v: number | undefined) => void
  decimals: number; unit?: string; negative?: boolean; invalid?: boolean; label?: string
  /** Ids of the lines that explain the field (allowed range, out-of-range message). */
  describedBy?: string; className?: string
}) {
  const unitId = useId()
  const noteId = useId()
  // What is on screen while the field is being typed in; null when it just shows the saved value.
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const u = unit?.trim()
  const saved = value === undefined ? "" : formatNumberField(value, decimals)
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {negative && (
          <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 md:size-9" aria-label="Trocar o sinal"
            disabled={value === undefined || value === 0} onClick={() => { if (value !== undefined) { setDraft(null); setProblem(null); onChange(-value) } }}>±</Button>
        )}
        <Input id={id} value={draft ?? saved} inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={invalid || !!problem}
            aria-describedby={[u ? unitId : "", describedBy ?? "", problem ? noteId : ""].filter(Boolean).join(" ") || undefined}
            className="min-h-11 min-w-0 flex-1 bg-surface-row text-right tabular-nums md:min-h-9"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => { if (!problem) setDraft(null) }}
            onChange={(e) => {
              const raw = e.target.value
              setDraft(raw)
              const r = parseNumberText(raw, decimals, !!negative)
              if (!r.ok) { setProblem(r.message); return }
              setProblem(null)
              onChange(r.value)
            }} />
        {u && <span id={unitId} className="shrink-0 type-body text-muted-foreground">{u}</span>}
      </div>
      {problem && <p id={noteId} className={cn("type-meta", TONE_TEXT.stop)} role="status">{problem}</p>}
    </div>
  )
}

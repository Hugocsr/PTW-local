import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/** Typing is saved when the field is left or after 1,5 s without typing: one write per answer, not per key (AU10). */
export const SAVE_AFTER_MS = 1500

/**
 * A text field that keeps what is typed locally and saves it late (blur, 1,5 s idle or leaving the
 * screen), so the audit gets one event per answer or name, not one per key.
 */
export function DeferredText({ value, onCommit, long, notEmpty, className, ...rest }: {
  value: string; onCommit: (v: string) => void; long?: boolean; className?: string
  /** An empty text is not saved (the field returns to the saved value): names the database requires. */
  notEmpty?: boolean
  id?: string; placeholder?: string; "aria-label"?: string; "aria-invalid"?: boolean; maxLength?: number
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement & HTMLTextAreaElement>) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ draft, value, onCommit, notEmpty })
  useEffect(() => { latest.current = { draft, value, onCommit, notEmpty } })
  const save = () => {
    const { draft: d, value: v, onCommit: c, notEmpty: ne } = latest.current
    if (d !== null && d !== v && !(ne && !d.trim())) c(d)
  }
  const commit = () => { clearTimeout(timer.current); save(); setDraft(null) }
  // Leaving the screen with something typed still saves it.
  useEffect(() => () => { clearTimeout(timer.current); save() }, [])
  const change = (v: string) => {
    setDraft(v)
    latest.current = { ...latest.current, draft: v }
    clearTimeout(timer.current)
    timer.current = setTimeout(commit, SAVE_AFTER_MS)
  }
  const shown = draft ?? value
  return long
    ? <Textarea {...rest} value={shown} onChange={(e) => change(e.target.value)} onBlur={commit} className={className} />
    : <Input {...rest} value={shown} onChange={(e) => change(e.target.value)} onBlur={commit} className={className} />
}

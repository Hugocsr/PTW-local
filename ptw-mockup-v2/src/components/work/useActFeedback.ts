import { useRef, useState } from "react"
import type { RuleError } from "@/core/ptwErrors"

/** Keep the dialog and its input until the final answer, including a late refusal. */
export function useActFeedback() {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<RuleError | null>(null)
  const run = async (act: () => Promise<RuleError | null>): Promise<boolean> => {
    if (pending.current) return false
    pending.current = true
    setBusy(true); setError(null)
    try {
      const refused = await act()
      setError(refused)
      return !refused
    } catch {
      setError({ code: "PTA99", message: "Não foi possível confirmar a operação. Confira o estado da PT e tente novamente." })
      return false
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return { busy, error, run }
}

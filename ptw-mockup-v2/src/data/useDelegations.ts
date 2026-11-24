import { useCallback, useEffect, useState } from "react"
import type { Delegation, DelegationInput } from "@/core/delegation"
import type { RuleError } from "@/core/ptwErrors"
import { useCell, useData } from "./context"

/** Mandates are immutable records; revocation changes future uses, never a past signature. */
export function useDelegations() {
  const { delegations, queries } = useData()
  const epoch = useCell(queries.changes?.delegations ?? queries.changed)
  const [items, setItems] = useState<Delegation[] | null>(null)
  const [error, setError] = useState<RuleError | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void delegations.read().then((r) => { if (active) { if (Array.isArray(r)) setItems(r); else setError(r) } })
    return () => { active = false }
  }, [delegations, epoch])
  const reload = useCallback(async () => {
    setBusy(true)
    const r = await delegations.read()
    if (Array.isArray(r)) { setItems(r); setError(null) } else setError(r)
    setBusy(false)
  }, [delegations])
  const act = async (fn: () => Promise<Delegation | RuleError>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    const r = await fn()
    if ("code" in r) { setError(r); setBusy(false); return false }
    setItems((old) => [r, ...(old ?? []).filter((x) => x.id !== r.id)])
    setError(null); setBusy(false)
    return true
  }
  return { items, error, busy, reload,
    create: (input: DelegationInput) => act(() => delegations.create(input)),
    revoke: (input: Delegation, reason: string, key: string) => act(() => delegations.revoke(input, reason, key)) }
}

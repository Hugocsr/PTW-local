import { useCallback, useEffect, useState } from "react"
import type { GroupInput, PersonGroup } from "@/core/governance"
import type { RuleError } from "@/core/ptwErrors"
import { useCell, useData } from "./context"

/** Groups are server records; reload/races never replace a draft without an explicit user action. */
export function useGroups() {
  const { groups, queries } = useData()
  const epoch = useCell(queries.changes?.groups ?? queries.changed)
  const [items, setItems] = useState<PersonGroup[] | null>(null)
  const [error, setError] = useState<RuleError | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void groups.read().then((r) => { if (active) { if (Array.isArray(r)) setItems(r); else setError(r) } })
    return () => { active = false }
  }, [groups, epoch])
  const reload = useCallback(async () => {
    setBusy(true)
    const r = await groups.read()
    if (Array.isArray(r)) { setItems(r); setError(null) } else setError(r)
    setBusy(false)
  }, [groups])
  const save = async (input: GroupInput, revision: number | null): Promise<PersonGroup | null> => {
    if (busy) return null
    setBusy(true)
    const r = await groups.save(input, revision)
    if ("code" in r) { setError(r); setBusy(false); return null }
    setItems((old) => [...(old ?? []).filter((x) => x.id !== r.id), r].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))
    setError(null); setBusy(false)
    return r
  }
  return { items, error, busy, reload, save }
}

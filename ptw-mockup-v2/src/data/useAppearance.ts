import { useCallback, useEffect, useState } from "react"
import type { AppearanceRecord } from "@/core/appearance"
import type { Brand } from "@/core/brand"
import type { RuleError } from "@/core/ptwErrors"
import { useCell, useData } from "./context"
import { loadBrand } from "./brand"

/** An editor reads/saves through its authenticated port; a failed write never changes the active theme. */
export function useAppearance() {
  const { appearance, queries } = useData()
  const epoch = useCell(queries.changes?.appearance ?? queries.changed)
  const [record, setRecord] = useState<AppearanceRecord | null>(null)
  const [error, setError] = useState<RuleError | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    setBusy(true)
    const r = await appearance.read()
    if ("code" in r) setError(r)
    else { setRecord(r); setError(null) }
    setBusy(false)
  }, [appearance])
  useEffect(() => {
    let active = true
    void appearance.read().then((r) => { if (!active) return; if ("code" in r) setError(r); else setRecord(r) })
    return () => { active = false }
  }, [appearance, epoch])
  const save = async (brand: Brand | null): Promise<boolean> => {
    if (!record || busy) return false
    setBusy(true)
    const r = await appearance.save(brand, record.revision)
    if ("code" in r) { setError(r); setBusy(false); return false }
    setRecord(r); setError(null)
    await loadBrand()
    setBusy(false)
    return true
  }
  return { record, error, busy, reload, save, upload: appearance.upload }
}

import { createContext, useContext, type ReactNode } from "react"
import { useLocationAssetCounts } from "@/data/hooks"
const Counts = createContext<ReturnType<typeof useLocationAssetCounts> | null>(null)
export function LocationCounts({ ids, children }: { ids: string[]; children: ReactNode }) {
  const counts = useLocationAssetCounts(ids)
  return <Counts.Provider value={counts}>{children}</Counts.Provider>
}
export function LocationAssetCount({ id }: { id: string }) {
  const result = useContext(Counts)
  return <span className="tabular-nums" title={result?.error?.message}>{result?.loading ? "…" : result?.error ? "Não disponível" : result?.counts.get(id) ?? "…"}</span>
}

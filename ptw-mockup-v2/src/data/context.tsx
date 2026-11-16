import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { createApiPort } from "./api"
import type { Cell, DataMode, DataPort } from "./port"
import { observeHumanActivity } from "./activity"

/** The running product always uses the database API; the memory adapter is a test fixture. */
export function dataMode(): DataMode { return "api" }

const Ctx = createContext<DataPort | null>(null)

async function openPort(): Promise<DataPort> {
  if (import.meta.env.DEV && import.meta.env.MODE === "demo") {
    const [{ createMemoryPort }, { buildCelulose }] = await Promise.all([
      import("./memory"),
      import("../demo/celulose"),
    ])
    return createMemoryPort(buildCelulose())
  }
  return createApiPort()
}

/** Opens the configured data source. Demo data is available only in Vite development mode. */
export function DataProvider({ children }: { children: ReactNode }) {
  const [port, setPort] = useState<DataPort | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    void openPort().then((p) => { if (live) setPort(p) }, () => { if (live) setError(true) })
    return () => { live = false }
  }, [])
  // The clock, expiry and (in api) synchronisation run while the provider is mounted.
  useEffect(() => port?.start(), [port])
  useEffect(() => port ? observeHumanActivity(document, () => { void port.session.activity?.() }) : undefined, [port])
  if (!port) return <p className="type-body p-4" role={error ? "alert" : "status"}>{error ? "Não foi possível abrir o sistema. Recarregue a página para tentar novamente." : "Conectando ao servidor…"}</p>
  return <Ctx.Provider value={port}>{children}</Ctx.Provider>
}

/** The data layer. Screens do not use it: they read the stores (`useRegistry`, `usePermits`, `useAudit`, `useSim`). */
export function useData(): DataPort {
  const p = useContext(Ctx)
  if (!p) throw new Error("DataProvider ausente")
  return p
}

/** "memoria" or "api", for the few places that differ (entry screen, simulation controls). */
export const useDataMode = (): DataMode => useData().mode

/** The current value of a cell; the component renders again when it changes. */
export function useCell<T>(cell: Cell<T>): T {
  return useSyncExternalStore(cell.subscribe, cell.get, cell.get)
}

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { dmHms, hms } from "@/core/time"
import { useCell, useData } from "@/data/context"

/** Who I am, what time it is and whether the server answers: the data layer's session (in memory, the simulation). */
interface Sim {
  personId: string
  /** The clock: an instant with the unit's offset ("2026-11-06T14:00:00-03:00"). Simulated in memory; the server's in `api`. */
  now: string
  /** "AAAA-MM-DD" of `now` in the unit's time zone (validity of cargos, accounts and dates). */
  today: string
  /** The unit's time zone. */
  tz: string
  serverDown: boolean
  isAuditor: boolean
  canEditRegistry: boolean
  canEditModels: boolean
  canAudit: boolean
  canExport: boolean
  setPerson: (id: string) => void
  /** Simulation only; they do nothing where the data layer has no simulation (`api`). */
  advance: (minutes: number) => void
  setServerDown: (v: boolean) => void
  reset: () => void
}

const Ctx = createContext<Sim | null>(null)

/** Reads the session of the data layer (`DataProvider`): its person, its clock and whether the server answers. */
export function SimProvider({ children }: { children: ReactNode }) {
  const { session } = useData()
  const s = useCell(session)
  const value = useMemo<Sim>(() => ({
    personId: s.personId, now: s.now, today: s.today, tz: s.tz, serverDown: s.serverDown, isAuditor: s.isAuditor,
    canEditRegistry: s.grants.includes("cadastro"), canEditModels: s.grants.includes("modelos"),
    canAudit: s.grants.includes("auditoria"), canExport: s.grants.includes("exportacao"),
    setPerson: (id) => session.setPerson(id),
    advance: (m) => session.advance?.(m),
    setServerDown: (v) => session.setServerDown?.(v),
    reset: () => session.reset?.(),
  }), [s, session])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSim() {
  const s = useContext(Ctx)
  if (!s) throw new Error("SimProvider ausente")
  return s
}

export const fmtDateTime = (iso: string) => dmHms(iso)
export const fmtTime = (iso: string) => hms(iso)

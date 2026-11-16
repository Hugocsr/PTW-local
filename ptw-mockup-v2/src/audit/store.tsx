import { createContext, useContext, useMemo, type ReactNode } from "react"
import type { AuditCtx, AuditDraft, AuditEvent } from "@/core/audit"
import { useCell, useData } from "@/data/context"
import { runAsUndo } from "@/data/port"

/**
 * The one audit log of the unit, as the data layer holds it (in memory: the whole chain, and a reload
 * restores the sample). Every store writes here; nothing ever removes or edits an event. Each write is
 * its own event (no merging; screens save on blur or after a pause).
 */
interface AuditStore {
  log: AuditEvent[]
  /** Append drafts (built with `ctx()`), in order. */
  record(drafts: AuditDraft[]): void
  /** Who acts now and how (ptw.set_context): simulated person and clock, "sessao"; "Desfazer" inside asUndo. */
  ctx(): AuditCtx
  /** Run `fn` as a "Desfazer": its row writes are recorded as `<ação>.desfeito`. */
  asUndo(fn: () => void): void
}

const Ctx = createContext<AuditStore | null>(null)

/**
 * Run a "Desfazer" so its writes are recorded as an undo of their own (set_context(..., p_undo => true)).
 * Module-level so plain helpers (a toast built outside a component) can use it; one audit log per app.
 */
export { runAsUndo }

export function AuditProvider({ children }: { children: ReactNode }) {
  const { audit } = useData()
  const log = useCell(audit)
  const value = useMemo<AuditStore>(() => ({ log, record: audit.record, ctx: audit.ctx, asUndo: runAsUndo }), [log, audit])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAudit() {
  const a = useContext(Ctx)
  if (!a) throw new Error("AuditProvider ausente")
  return a
}

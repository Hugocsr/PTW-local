import { createContext, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"
import { toastFor, type RuleError } from "@/core/ptwErrors"
import type { Rascunho } from "@/core/templatePackage"
import { useCell, useData } from "@/data/context"
import type { Action, WithId } from "@/data/memory/registry"
import type { Act } from "@/data/port"
import type { Permit } from "@/permit/types"
import type { Location, RecordList, RegistryState, TypeDef, TypeList } from "./types"

/**
 * The registry's rules and writes are in `@/data/memory/registry` (pure); they are exported from here
 * too, where the core tests and the scenarios have always found them.
 */
export { listInUse, newId, registryStep, typeInUse, type Action, type RegistryStep } from "@/data/memory/registry"

interface Store {
  state: RegistryState
  /** The permit store hands its live permits here, so the lock can be checked on every write. */
  bindPermits: (get: () => Permit[]) => void
  /** Every write returns false when it was refused (the store shows why). */
  upsert: (list: RecordList, item: WithId) => Promise<boolean>
  addType: (list: TypeList, label: string) => Promise<boolean>
  removeRelation: (id: string) => Promise<boolean>
  renameType: (list: TypeList, id: string, label: string) => Promise<boolean>
  setTypeIcon: (list: TypeList, id: string, icon: string) => Promise<boolean>
  /** Desativar / reativar a type: an inactive type is no longer offered; what uses it keeps it. */
  setTypeActive: (list: TypeList, id: string, active: boolean) => Promise<boolean>
  removeType: (list: TypeList, id: string) => Promise<boolean>
  removeTemplate: (id: string) => Promise<boolean>
  removeOptionList: (id: string) => Promise<boolean>
  /** Undo of a removal: the record goes back to the same position. */
  restore: (list: RecordList, item: WithId, index: number) => Promise<boolean>
  restoreType: (list: TypeList, item: TypeDef, index: number) => Promise<boolean>
  /** Change a record from its current value, not from a stale copy. */
  update: <T extends WithId>(list: RecordList, id: string, fn: (item: T) => T) => Promise<boolean>
  /** Creates a confirmed import (never activates it). */
  importTemplate: (draft: Rascunho) => Promise<boolean>
  /** Instant of the simulated clock, with offset. */
  now: () => string
}

const Ctx = createContext<Store | null>(null)

const showRefusal = (e: RuleError) => { const t = toastFor(e); toast.error(t.title, { description: t.description }) }
/** Kept for the shape: the data layer checks the equipment lock against its own live permits. */
const bindPermits = (get: () => Permit[]) => { void get }

/** The registry the screens read: the data layer's cache, with every write going through it. */
export function RegistryProvider({ children }: { children: ReactNode }) {
  const port = useData()
  const state = useCell(port.registry)
  const store = useMemo<Store>(() => {
    // A write is successful only when its final server answer arrives (the store shows any refusal).
    const run = async (action: Action): Promise<boolean> => {
      const act: Act = port.registry.write(action)
      const error = await act.done
      if (error) { showRefusal(error); return false }
      return true
    }
    return {
      state,
      bindPermits,
      upsert: (list, item) => run({ kind: "upsert", list, item }),
      addType: (list, label) => run({ kind: "addType", list, label }),
      removeRelation: (id) => run({ kind: "removeRelation", id }),
      renameType: (list, id, label) => run({ kind: "renameType", list, id, label }),
      setTypeIcon: (list, id, icon) => run({ kind: "setTypeIcon", list, id, icon }),
      setTypeActive: (list, id, active) => run({ kind: "setTypeActive", list, id, active }),
      removeType: (list, id) => run({ kind: "removeType", list, id }),
      removeTemplate: (id) => run({ kind: "removeTemplate", id }),
      removeOptionList: (id) => run({ kind: "removeOptionList", id }),
      restore: (list, item, index) => run({ kind: "restore", list, item, index }),
      restoreType: (list, item, index) => run({ kind: "restoreType", list, item, index }),
      update: (list, id, fn) => run({ kind: "update", list, id, fn: fn as unknown as (item: WithId) => WithId }),
      importTemplate: (draft) => run({ kind: "importTemplate", draft }),
      now: () => port.audit.ctx().at,
    }
  }, [state, port])
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useRegistry() {
  const s = useContext(Ctx)
  if (!s) throw new Error("RegistryProvider ausente")
  return s
}

/* ---------- derived helpers ---------- */

export const label = (list: { id: string; label: string }[], id: string) =>
  list.find((t) => t.id === id)?.label ?? id

export function locationPath(locs: Location[], id: string): Location[] {
  const out: Location[] = []
  let cur = locs.find((l) => l.id === id)
  while (cur) {
    out.unshift(cur)
    cur = cur.parentId ? locs.find((l) => l.id === cur!.parentId) : undefined
  }
  return out
}

export function descendantIds(locs: Location[], id: string): string[] {
  const kids = locs.filter((l) => l.parentId === id)
  return [id, ...kids.flatMap((k) => descendantIds(locs, k.id))]
}

/** "AAAA-MM-DD" (or the day of an instant, as written) → "dd/mm/aaaa". */
export const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/")

/* ---------- person helpers ---------- */

/** First and last name, plain letters, up to 20 (the AD sAMAccountName limit; the database allows 104). */
export const suggestLogin = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).filter((_, i, a) => i === 0 || i === a.length - 1).join(".")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 20)

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { toast } from "sonner"
import { permitFormOf } from "@/core/permitView"
import { toastFor, type RuleError } from "@/core/ptwErrors"
import { useCell, useData } from "@/data/context"
import type { Act, PermitAct } from "@/data/port"
import type { AttachKind, TemplateVersion } from "@/registry/types"
import type { PermitAction } from "./reducer"
import type { Permit, PermitAttachment, PermitData } from "./types"

/**
 * Permits, signatures, revisions and files read from the data port. The API decides writes and expiry;
 * `reducer.ts` supplies the pure checks used to explain an action before sending it.
 */
export { permitReducer, type PermitAction, type PermitCtx, type PermitStep } from "./reducer"

type Store = PermitData & {
  /**
   * Each act returns null when written, or the refusal (code + message; the screen shows it with `toastFor`).
   * Where the answer comes later (`api`), this is the core's own check and a later refusal is shown as a
   * toast; a dialog that must wait for the server uses `usePermitActs()` (`@/data/hooks`).
   */
  sign: (a: Omit<Extract<PermitAction, { kind: "sign" }>, "kind">) => RuleError | null
  refuse: (a: Omit<Extract<PermitAction, { kind: "refuse" }>, "kind">) => RuleError | null
  stop: (a: Omit<Extract<PermitAction, { kind: "stop" }>, "kind">) => RuleError | null
  answer: (a: Omit<Extract<PermitAction, { kind: "answer" }>, "kind">) => RuleError | null
  resume: (a: Omit<Extract<PermitAction, { kind: "resume" }>, "kind">) => RuleError | null
  extend: (a: Omit<Extract<PermitAction, { kind: "extend" }>, "kind">) => RuleError | null
  /** Saves a captured file on the permit (blob + attachment) and returns its row; null when refused. */
  capture: (permitId: string, personId: string, itemId: string, kind: AttachKind, file: File) => Promise<PermitAttachment | null>
  /** Where the browser reads a stored file from (an object URL in the simulation). */
  urlOf: (sha256: string) => string | undefined
  /** The form a permit shows: frozen at Enviar, else the version's. */
  formOf: (p: Permit, ver: TemplateVersion) => ReturnType<typeof permitFormOf>
}
const Ctx = createContext<Store | null>(null)

/** A refusal that only came with the final answer (the server's, in `api` mode) is shown as the screens show the immediate one. */
function immediate(act: Act): RuleError | null {
  if (!act.refused) void act.done.then((e) => { if (e) { const t = toastFor(e); toast.error(t.title, { description: t.description }) } })
  return act.refused
}

export function PermitProvider({ children }: { children: ReactNode }) {
  const port = useData()
  const data = useCell(port.permits)

  const value = useMemo<Store>(() => {
    const run = (a: PermitAct) => immediate(port.permits.act(a))
    return {
      ...data,
      sign: (a) => run({ kind: "sign", ...a }),
      refuse: (a) => run({ kind: "refuse", ...a }),
      stop: (a) => run({ kind: "stop", ...a }),
      answer: (a) => run({ kind: "answer", ...a }),
      resume: (a) => run({ kind: "resume", ...a }),
      extend: (a) => run({ kind: "extend", ...a }),
      capture: port.permits.capture,
      urlOf: port.permits.urlOf,
      formOf: (p, ver) => permitFormOf(p, ver, port.permits.get().formSnapshots, port.registry.get().optionLists),
    }
  }, [data, port])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePermits() {
  const d = useContext(Ctx)
  if (!d) throw new Error("PermitProvider ausente")
  return d
}

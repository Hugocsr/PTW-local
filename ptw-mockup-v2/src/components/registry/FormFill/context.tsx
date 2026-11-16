/** What a form needs from where it is filled: assets, location path, files. */
import { createContext, useContext } from "react"
import { useSim } from "@/sim/SimProvider"
import type { PermitAttachment } from "@/permit/types"
import { useRegistry } from "@/registry/store"
import { type FormContext } from "@/core/form"
import type { AttachKind } from "@/registry/types"

/**
 * Facts a form needs from where it is filled: the PT's assets (an isolation point may be one of them)
 * and the PT's location with its ancestors (the scope a "Pessoa" must be eligible in; absent in Testar).
 */
export const FillContext = createContext<{ assetIds?: string[]; pathIds?: string[] }>({})

/**
 * Where a form's files live. An answer keeps only attachment ids (as the database does); the
 * metadata is the PT's `attachments` and the bytes are reached by SHA-256 (`urlOf`). `capture`
 * stores a new file (SHA-256 of its bytes, allowed type) and returns its attachment, or null when
 * refused. The PT provides it; Testar keeps files in memory.
 */
export interface FormFiles {
  attachments: PermitAttachment[]
  urlOf(sha256: string): string | undefined
  capture(itemId: string, kind: AttachKind, file: File): Promise<PermitAttachment | null>
}
export const FormFilesContext = createContext<FormFiles | null>(null)

/** People, today (in the unit's zone), the instant and the place, for the checks that need them. */
export function useFormContext(): FormContext {
  const { state } = useRegistry()
  const { now, today } = useSim()
  const { pathIds } = useContext(FillContext)
  return { people: state.people, today, now, lists: state.optionLists, ...(pathIds ? { pathIds } : {}) }
}

export const rowId = (p: string) => `${p}_${Math.random().toString(16).slice(2, 10)}`

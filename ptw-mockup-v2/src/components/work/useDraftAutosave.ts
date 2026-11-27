/**
 * SPEC 014: saves the New PT / Edit draft form by itself. The draft is created once the database has
 * what it needs (model, location, scope: `draftReady`), then every change is saved after the wait
 * the server configures (`PTW_DRAFT_AUTOSAVE_SECONDS`, 5 s by default) with no further change, when
 * the person leaves the screen and when they close the tab. Nothing is kept in the browser: the draft
 * lives in the database, like the rest.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { draftMissing, draftReady, draftSnapshot, hasUnsaved, type DraftFields, type SaveState } from "@/core/draftSave"
import { wallOf } from "@/core/time"
import { useData } from "@/data/context"
import { useSim } from "@/sim/SimProvider"

interface Options {
  /** The id the new draft will have (kept for retries: the server treats a repeated create as the same). */
  id: string
  /** Editing a draft that already exists. */
  existing: boolean
  fields: DraftFields
  /** The model version the draft is created on. */
  versionId: string | undefined
  /** Why the fields cannot be saved right now (e.g. the window is invalid); the last saved values stay. */
  blocked: string
  /** The draft was just created (first save). */
  onCreated?: (id: string) => void
}

export interface DraftAutosave {
  state: SaveState
  /** What is still missing before the first save ("" when ready), for the indicator. */
  missing: string
  /** The draft's id once it exists (read it after `flush`, not during render). */
  draftId: () => string | null
  /** Saves now, whatever is pending. True when everything is saved (or there was nothing to save). */
  flush: () => Promise<boolean>
  /** The person changed something since the form opened. */
  touched: boolean
  /** Leaving now would lose something. */
  unsaved: boolean
}

/** What the last call said; the indicator is derived from it and from what is pending now. */
type Result = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; snap: string; message?: string } | { kind: "offline"; snap: string }

export function useDraftAutosave({ id, existing, fields, versionId, blocked, onCreated }: Options): DraftAutosave {
  const port = useData()
  const sim = useSim()
  const snap = draftSnapshot(fields)
  const [initial] = useState(snap)
  const [savedSnap, setSavedSnap] = useState<string | null>(existing ? snap : null)
  const [result, setResult] = useState<Result>({ kind: "idle" })
  const created = useRef<string | null>(existing ? id : null)
  const saved = useRef<string | null>(existing ? snap : null)
  const timer = useRef<number>(0)
  const inflight = useRef<Promise<void> | null>(null)
  // The latest values, for the timer, the unmount and the tab close (they must not use a stale render).
  const live = useRef({ fields, versionId, blocked, serverDown: sim.serverDown, now: sim.now, tz: sim.tz, onCreated })
  useEffect(() => { live.current = { fields, versionId, blocked, serverDown: sim.serverDown, now: sim.now, tz: sim.tz, onCreated } })
  const ready = draftReady(fields)
  const pending = snap !== savedSnap
  const touched = snap !== initial

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current)
    if (inflight.current) await inflight.current
    const cur = live.current
    const wanted = draftSnapshot(cur.fields)
    if (wanted === saved.current) return true
    if (!draftReady(cur.fields) || cur.blocked || cur.serverDown) return false
    const f = cur.fields
    const input = { locationId: f.locationId, assetIds: f.assetIds, team: f.team, windowStart: f.windowStart, windowEnd: f.windowEnd, scope: f.scope.trim() }
    setResult({ kind: "saving" })
    let ok = false
    const run = (async () => {
      const r = created.current
        ? await port.permits.updateDraft?.(created.current, input)
        : await port.permits.create?.({ ...input, id, templateId: f.templateId, versionId: cur.versionId })
      if (!r || "code" in r) {
        const code = r && "code" in r ? r.code : ""
        setResult(code === "sem_servidor" ? { kind: "offline", snap: wanted }
          : { kind: "error", snap: wanted, message: code === "PTA06" ? "o rascunho foi alterado em outra aba; recarregue a página" : r && "message" in r ? r.message : undefined })
        return
      }
      const first = !created.current
      created.current = r.id
      saved.current = wanted
      ok = true
      setSavedSnap(wanted)
      setResult({ kind: "saved", at: wallOf(live.current.now, live.current.tz).slice(11, 16) })
      if (first) live.current.onCreated?.(r.id)
    })()
    inflight.current = run
    try { await run } finally { if (inflight.current === run) inflight.current = null }
    // Something changed while it was saving: the effect below schedules the next save.
    return ok && draftSnapshot(live.current.fields) === saved.current
  }, [port, id])

  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })

  useEffect(() => {
    if (!pending || !ready || blocked || sim.serverDown) return
    timer.current = window.setTimeout(() => void flushRef.current(), sim.draftAutosaveMs)
    return () => window.clearTimeout(timer.current)
  }, [snap, pending, ready, blocked, sim.serverDown, sim.draftAutosaveMs])

  // Leaving the screen by any path (menu, link, back): save what is pending.
  useEffect(() => () => {
    const cur = live.current
    if (draftSnapshot(cur.fields) !== saved.current && draftReady(cur.fields) && !cur.blocked && !cur.serverDown) void flushRef.current()
  }, [])

  // The indicator: what is pending now decides first; the last call's answer only while it still applies.
  const state: SaveState = !pending
    ? (result.kind === "saved" ? { kind: "saved", at: result.at } : { kind: "idle" })
    : !ready ? { kind: "incomplete" }
    : blocked ? { kind: "blocked", message: blocked }
    : sim.serverDown || (result.kind === "offline" && result.snap === snap) ? { kind: "offline" }
    : result.kind === "error" && result.snap === snap ? { kind: "error", message: result.message }
    : result.kind === "saving" ? { kind: "saving" }
    : { kind: "waiting" }

  const unsaved = hasUnsaved(state.kind, touched)
  // Closing the tab with something not saved asks first (the browser shows its own text).
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [unsaved])

  return { state, missing: draftMissing(fields), draftId: () => created.current, flush, touched, unsaved }
}

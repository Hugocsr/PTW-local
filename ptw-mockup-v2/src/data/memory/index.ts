/**
 * The data layer in browser memory: one scenario (registry, permits, audit chain, where the clock
 * starts), written by the app's own pure rules. A reload, or "Restaurar exemplo", starts it again.
 *
 * Everything here used to live inside the four providers (`SimProvider`, `AuditProvider`,
 * `RegistryProvider`, `PermitProvider`); they now only read these cells. Nothing here knows React.
 */
import { accessEvent, appendEvents, asUndoDraft, exportBaseName, exportJsonl, exportManifest, eventIso, sha256Hex, verifyChain, type AuditCtx, type AuditDraft, type AuditEvent } from "@/core/audit"
import { boardRows, createBoardCache } from "@/core/board"
import { dueToExpire } from "@/core/permitView"
import { addMinutes, DEFAULT_TZ, dayOf } from "@/core/time"
import type { Scenario } from "@/demo/types"
import { uuidv7 } from "@/lib/id"
import { permitReducer, type PermitAction } from "@/permit/reducer"
import type { PermitAttachment, PermitData } from "@/permit/types"
import type { RegistryState } from "@/registry/types"
import { isUndoing, settled, type Cell, type DataPort, type SessionState } from "../port"
import { assetLocal, auditFacetsOf, auditPageOf, auditRows, boardLocal, pageOf } from "./query"
import { registryStep } from "./registry"

/** A value with listeners. Setting the very same value tells nobody. */
export interface Box<T> extends Cell<T> { set(next: T): void }
export function box<T>(initial: T): Box<T> {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set(next) { if (next === value) return; value = next; for (const f of [...subs]) f() },
    subscribe(f) { subs.add(f); return () => { subs.delete(f) } },
  }
}

/** Reads a captured file: its SHA-256 (the blob's key), type and size. Mime outside the database's rule is refused later. */
export async function readCapture(file: File): Promise<{ sha256: string; size: number; mime: string; url: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { sha256: sha256Hex(bytes), size: bytes.length, mime: (file.type || "application/octet-stream").toLowerCase(), url: URL.createObjectURL(file) }
}

/** A read noted twice in a row by the same person within this (real) time is one read (a remount). */
const SETTLE_MS = 1500

/**
 * Writes that still reach the server while it is down: none, except the stop (Parar stays available)
 * and the system's own notes. A stop keeps every event of its step (the state change it causes too).
 */
const isStopStep = (input: AuditDraft[]) =>
  input.some((d) => d.action === "pt.parada" || (d.action === "pt.estado" && typeof d.data.para === "object" && d.data.para !== null && !Array.isArray(d.data.para) && d.data.para.hold_reason != null))
const survivesDown = (d: AuditDraft, stopStep: boolean) => d.action.startsWith("sistema.") || stopStep

const dayShift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export interface MemoryOptions {
  /** The unit's time zone. */
  tz?: string
  /** "Restaurar exemplo": the app builds a new port from the scenario (and remounts the screens). */
  onReset?: () => void
}

export function createMemoryPort(scenario: Scenario, { tz = DEFAULT_TZ, onReset }: MemoryOptions = {}): DataPort {
  /** The unit whose chain this is. */
  const unit = scenario.registry.units[0].id

  /* ----- who, when, server ----- */
  // The scenario says where the simulation starts: its person and its clock.
  const sessionOf = (personId: string, now: string, serverDown: boolean): SessionState =>
    ({ status: "aberta", personId, now, today: dayOf(now, tz), tz, serverDown, isAuditor: scenario.auditors.includes(personId), devLogin: true, passwordLogin: false, grants: ["cadastro", "modelos", "auditoria", "exportacao"] })
  const session = box(sessionOf(scenario.defaultPerson, scenario.start, false))
  const setSession = (patch: Partial<Pick<SessionState, "personId" | "now" | "serverDown">>) => {
    const s = { ...session.get(), ...patch }
    session.set(sessionOf(s.personId, s.now, s.serverDown))
  }

  /* ----- the audit trail ----- */
  const log = box<AuditEvent[]>(scenario.audit)
  let lastRead: { key: string; t: number } | null = null
  const record = (input: AuditDraft[]) => {
    const down = session.get().serverDown
    const stopStep = isStopStep(input)
    const out: AuditDraft[] = []
    for (const raw of input) {
      if (down && !survivesDown(raw, stopStep)) continue
      const d = isUndoing() ? asUndoDraft(raw) : raw
      if (d.action.startsWith("acesso.")) {
        const key = `${d.actor}|${d.action}|${d.entityId}|${d.text}|${JSON.stringify(d.data)}`, t = Date.now()
        if (lastRead && lastRead.key === key && t - lastRead.t < SETTLE_MS) continue
        lastRead = { key, t }
      }
      out.push(d)
    }
    if (out.length) log.set(appendEvents(log.get(), out, unit))
  }
  const ctx = (): AuditCtx => {
    const s = session.get()
    return { at: s.now, actorId: s.personId, roleId: null, auth: "sessao", client: null, requestId: null, reason: isUndoing() ? "Desfazer" : null }
  }

  /* ----- registry and permits ----- */
  const registry = box<RegistryState>(scenario.registry)
  const permits = box<PermitData>(scenario.permits)

  // One synchronous step from the latest data; its drafts go to the audit log once.
  const runPermit = (a: PermitAction, auditCtx: AuditCtx = ctx()) => {
    const step = permitReducer(permits.get(), a, { serverDown: session.get().serverDown, audit: auditCtx, registry: registry.get() })
    permits.set(step.data)
    record(step.events)
    return step.denied ?? null
  }

  // The server's clock: what passed its window expires (ptw.expire_due), with no person.
  const expireDue = () => {
    const s = session.get()
    if (s.serverDown) return
    for (const p of dueToExpire(permits.get().permits, s.now)) {
      const step = permitReducer(permits.get(), { kind: "expire", permitId: p.id }, { audit: { at: s.now, actorId: null, auth: "sistema" }, registry: registry.get() })
      permits.set(step.data)
      record(step.events)
    }
  }
  const setNow = (now: string) => { setSession({ now }); expireDue() }

  const boardCache = createBoardCache()

  return {
    mode: "memoria",
    whole: true,

    session: {
      get: session.get, subscribe: session.subscribe,
      setPerson: (personId) => setSession({ personId }),
      advance: (minutes) => setNow(addMinutes(session.get().now, minutes, tz)),
      setServerDown: (serverDown) => setSession({ serverDown }),
      reset: () => onReset?.(),
    },

    registry: {
      get: registry.get, subscribe: registry.subscribe,
      // Every write is described in the audit log; a refused one changes nothing and is recorded as denied.
      write(action) {
        const step = registryStep(registry.get(), action, permits.get().permits, ctx())
        record(step.events)
        if (step.denied) return settled(step.denied)
        registry.set(step.state)
        return settled(null)
      },
    },

    permits: {
      get: permits.get, subscribe: permits.subscribe,
      act: (a) => settled(runPermit(a)),
      async capture(permitId, personId, itemId, kind, file) {
        const c = await readCapture(file)
        const at = ctx().at
        const attachment: PermitAttachment = {
          id: uuidv7(Date.parse(at)), permitId, itemId, kind, sha256: c.sha256, fileName: file.name || "arquivo",
          previewSha256: null, width: null, height: null, durationMs: null, capturedBy: personId, capturedAt: at,
        }
        const ok = !runPermit({ kind: "attach", permitId, personId, attachment, blob: { sha256: c.sha256, size: c.size, mime: c.mime, storedAt: at, url: c.url } })
        return ok ? attachment : null
      },
      urlOf: (sha) => permits.get().blobs[sha]?.url,
      load: async (key) => permits.get().permits.find((p) => p.id === key || p.number === key) ?? null,
    },

    audit: {
      get: log.get, subscribe: log.subscribe,
      record, ctx,
      verify: async () => verifyChain(log.get()),
      /** ptw-auditoria/2: JSONL + manifest, checkable with ptw-server/tools/ptw_verifica.py. */
      async exportAll(reason) {
        const all = log.get(), s = session.get()
        const u = registry.get().units[0]
        const jsonl = exportJsonl(all)
        const bytes = new TextEncoder().encode(jsonl)
        const jsonlSha256 = sha256Hex(bytes)
        const first = all.length ? dayOf(eventIso(all[0])) : s.today
        const lastDay = all.length ? dayOf(eventIso(all[all.length - 1])) : s.today
        const manifest = `${JSON.stringify(exportManifest(all, { unitCode: u.code, tz: u.timezone, from: first, to: dayShift(lastDay, 1), reason, generatedAt: s.now, jsonlBytes: bytes.length, jsonlSha256 }), null, 2)}\n`
        record([accessEvent("acesso.exportacao", {
          reason,
          data: { primeiro_seq: all[0]?.seq ?? null, ultimo_seq: all[all.length - 1]?.seq ?? null, arquivo_sha256: jsonlSha256, manifesto_sha256: sha256Hex(manifest) },
        }, ctx())])
        return { baseName: exportBaseName(u.code, all), jsonl, manifest, events: all.length }
      },
    },

    queries: {
      changed: box(0),
      async permitBoard(view) {
        const r = registry.get(), d = permits.get(), s = session.get()
        const rows = boardRows({ permits: d.permits, signatures: d.signatures, people: r.people, locations: r.locations, templates: r.templates, personId: s.personId, today: s.today, now: s.now }, boardCache)
        return pageOf(rows, view, boardLocal(r.assets, r.locations))
      },
      async assets(view) {
        const r = registry.get()
        return pageOf(r.assets, view, assetLocal(r.locations))
      },
      auditEvents: async (q) => auditPageOf(auditRows(log.get(), q), q.before, q.limit),
      auditFacets: async () => auditFacetsOf(log.get(), registry.get().people),
    },

    start() {
      // What is already past its window when the scenario opens expires at once.
      expireDue()
      // The simulated clock runs like a real one (one second per second); "Avançar" jumps it ahead.
      const t = setInterval(() => setNow(addMinutes(session.get().now, 1 / 60, tz)), 1000)
      return () => clearInterval(t)
    },
  }
}

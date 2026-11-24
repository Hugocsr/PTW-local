/**
 * The `api` implementation of `DataPort` (package F1-09): the app reading from and writing to the
 * server (`ptw-server/api/openapi.yaml`) with the cookie session. The server decides every rule and
 * writes the audit trail; the app shows what it answers.
 *
 * - session: `GET /session` at start; entry by `POST /session/dev-login` (only with the development
 *   entry on); 401 anywhere → `status: "ausente"` (the app shows the entry screen).
 * - clock: the real clock set by the server's (`GET /health`); `serverDown` follows `GET /status`
 *   and every call that gets no answer (or 502/503).
 * - synchronisation (`start()`): `GET /events` (SSE) and a 30 s reading, which ask Minha área again
 *   (only what changed), keep the reference data in step and bump `queries.changed`.
 */
import type { AuditCtx, AuditEvent } from "@/core/audit"
import type { RuleError } from "@/core/ptwErrors"
import { DEFAULT_TZ, dayOf, isoAt, msOf } from "@/core/time"
import type { Person, RegistryState } from "@/registry/types"
import { box } from "../cell"
import { isUndoing, type AuditExportFiles, type AuditPort, type DataPort, type EntryPerson, type SessionGrant, type SessionPort, type SessionState } from "../port"
import { createHttp, noServer, type HttpOptions } from "./http"
import { createQueries } from "./queries"
import { createPermitPort } from "./permits"
import { createRegistryWrites, loadReference, syncReference } from "./registry"
import { emptyPermits, emptyRegistry, type Shared } from "./state"
import { createClientTimings } from "./performance"
import { createAppearancePort } from "./appearance"
import { createGroupPort } from "./groups"
import { createDelegationPort } from "./delegations"

interface Session { person: Person; unit: { timezone: string }; auth: AuditCtx["auth"]; csrfToken: string; devLogin?: boolean; grants: SessionGrant[]; now: string }
interface Health { now: string; devLogin: boolean; passwordLogin: boolean }

export interface ApiOptions extends Pick<HttpOptions, "fetch" | "base"> {
  /** Reading and event-stream intervals (ms); tests make them long. */
  statusEvery?: number
  syncEvery?: number
  /** `EventSource` constructor (absent in tests). */
  eventSource?: typeof EventSource
}

const CLIENT_KEY = "ptw.aparelho"
/** The device's name, kept on the device (`X-Ptw-Client`). */
function deviceName(): string {
  try {
    const old = globalThis.localStorage?.getItem(CLIENT_KEY)
    if (old) return old
    const n = `app-${Math.random().toString(36).slice(2, 10)}`
    globalThis.localStorage?.setItem(CLIENT_KEY, n)
    return n
  } catch { return "app" }
}

export async function createApiPort(opts: ApiOptions = {}): Promise<DataPort> {
  const timings = createClientTimings()
  const bootstrapDone = timings.start("bootstrap")
  const device = deviceName()
  let csrf: string | null = null
  let sessionEpoch = 0
  let auth: AuditCtx["auth"] = "sessao"
  let lastActivityAt = -Infinity
  let tz = DEFAULT_TZ
  /** Server's clock minus the device's, in ms (`GET /health`). */
  let offset = 0
  const nowIso = () => isoAt(Date.now() + offset, tz)

  const stateOf = (p: Partial<SessionState> & Pick<SessionState, "status">): SessionState => {
    const now = nowIso()
    return { personId: "", now, today: dayOf(now, tz), tz, serverDown: false, isAuditor: false, devLogin: false, passwordLogin: false, grants: [], ...p }
  }
  const session = box<SessionState>(stateOf({ status: "carregando" }))
  const patch = (p: Partial<SessionState>) => { const c = session.get(); session.set({ ...c, ...p }) }

  const down = (d: boolean) => { if (session.get().serverDown !== d) patch({ serverDown: d }) }
  const http = createHttp({
    timings,
    fetch: opts.fetch, base: opts.base,
    clientName: () => device, csrf: () => csrf, sessionVersion: () => sessionEpoch,
    onUnauthorized: () => {
      ++sessionEpoch; csrf = null; lastActivityAt = -Infinity
      permits.resetSession()
      s.permits.set(emptyPermits()); s.registry.set(emptyRegistry()); s.audit.set([]); s.assets.clear()
      patch({ status: "ausente", personId: "", isAuditor: false, grants: [], error: null })
    },
    // A login response may already have changed the browser cookie, before enter() changes the
    // cached identity. Only the authenticated poll flushes pending stops, never an arbitrary response.
    onReach: (up) => down(!up),
  })

  const audit = box<AuditEvent[]>([])
  const s: Shared = {
    http, session, audit,
    registry: box<RegistryState>(emptyRegistry()),
    permits: box(emptyPermits()),
    changed: box(0),
    assets: new Map(),
    tz: () => tz,
    now: nowIso,
    ctx: (): AuditCtx => ({ at: nowIso(), actorId: session.get().personId || null, roleId: null, auth, client: device, requestId: null, reason: isUndoing() ? "Desfazer" : null }),
  }

  const registry = createRegistryWrites(s)
  const permits = createPermitPort(s)
  const queries = createQueries(s)
  let syncedAt: string | null = null

  /** Someone is in: the unit's reference data and Minha área. */
  async function enter(x: Session, epoch: number): Promise<RuleError | null> {
    if (epoch !== sessionEpoch) return null
    csrf = x.csrfToken
    auth = x.auth
    lastActivityAt = -Infinity
    tz = x.unit.timezone || DEFAULT_TZ
    offset = msOf(x.now, tz) - Date.now()
    patch({ status: "carregando", personId: x.person.id, error: null, devLogin: x.devLogin === true, grants: x.grants })
    s.assets.clear(); s.permits.set(emptyPermits()); s.registry.set(emptyRegistry()); s.audit.set([])
    permits.resetSession()
    const since = nowIso()
    const e = (await loadReference(s)) ?? (await permits.loadMine())
    if (epoch !== sessionEpoch) return null
    if (e) {
      if (session.get().status !== "ausente") patch({ status: "carregando", error: e })
      return e
    }
    syncedAt = since
    const now = nowIso()
    session.set({ ...session.get(), status: "aberta", personId: x.person.id, now, today: dayOf(now, tz), tz, serverDown: false, isAuditor: x.person.roles.length === 0, devLogin: x.devLogin === true, grants: x.grants })
    return e
  }

  async function readHealth(): Promise<RuleError | null> {
    const r = await http.request<Health>({ method: "GET", path: "/health" })
    if (!r.ok) return r.error
    offset = msOf(r.data.now, tz) - Date.now()
    patch({ devLogin: r.data.devLogin === true, passwordLogin: r.data.passwordLogin === true })
    return null
  }

  async function signIn(path: string, body: { login: string; password?: string }): Promise<RuleError | null> {
    const finish = timings.start("login")
    let ok = false
    try {
    const epoch = ++sessionEpoch
    const r = await http.request<Session>({ method: "POST", path, body })
    // A refusal can itself end an obsolete session; still show its reason on the entry screen.
    if (!r.ok) return r.error
    if (epoch !== sessionEpoch) return null
    const error = await enter(r.data, epoch)
    ok = error === null && session.get().status === "aberta"
    return error
    } finally { finish(ok) }
  }

  async function readSession(): Promise<RuleError | null> {
    const finish = timings.start("restore")
    let ok = false
    try {
    const epoch = sessionEpoch
    const r = await http.request<Session>({ method: "GET", path: "/session" })
    if (epoch !== sessionEpoch) return null
    if (r.ok) { const error = await enter(r.data, epoch); ok = error === null && session.get().status === "aberta"; return error }
    if (r.down || r.status !== 401) { patch({ status: "carregando", serverDown: r.down, error: r.error }); return r.error }
    patch({ status: "ausente", personId: "", error: null })
    return null
    } finally { finish(ok) }
  }

  const sessionPort: SessionPort & { devLogin(login: string): Promise<RuleError | null> } = {
    get: session.get, subscribe: session.subscribe,
    async retry() {
      const [healthError, sessionError] = await Promise.all([readHealth(), readSession()])
      return sessionError ?? healthError
    },
    async entryPeople() {
      const r = await http.request<{ items: EntryPerson[] }>({ method: "GET", path: "/session/dev-people" })
      if (!r.ok && r.status === 404) { patch({ devLogin: false }); return [] }
      if (r.ok) patch({ devLogin: true })
      return r.ok ? r.data.items : r.error
    },
    async devLogin(login) {
      return signIn("/session/dev-login", { login })
    },
    async login(login, password) {
      return signIn("/session/login", { login, password })
    },
    async activity() {
      const current = session.get()
      if (current.status !== "aberta" || current.serverDown || Date.now() - lastActivityAt < 60_000) return null
      lastActivityAt = Date.now()
      const r = await http.request<void>({ method: "POST", path: "/session/activity" })
      return r.ok ? null : r.error
    },
    setPerson(personId) {
      const login = s.registry.get().people.find((p) => p.id === personId)?.login
      if (login) void sessionPort.devLogin(login)
    },
    async logout() {
      const epoch = ++sessionEpoch
      const r = await http.request<void>({ method: "POST", path: "/session/logout" })
      if (epoch !== sessionEpoch) return null
      if (!r.ok && r.status !== 401) return r.error
      csrf = null
      permits.resetSession()
      s.permits.set(emptyPermits()); s.registry.set(emptyRegistry()); s.audit.set([])
      patch({ status: "ausente", personId: "", isAuditor: false, grants: [] })
      return null
    },
  }

  const auditPort: AuditPort = {
    get: audit.get, subscribe: audit.subscribe,
    // Only a PT opened on screen needs a note from here; the server writes every other one when the data is read.
    record(drafts) {
      if (session.get().serverDown) return
      for (const d of drafts) {
        if (d.action !== "acesso.pt.aberta" || !d.permit) continue
        if (permits.readJustNow(d.permit)) continue
        void http.request<void>({ method: "POST", path: `/permits/${d.permit}/access` })
      }
    },
    ctx: s.ctx,
    async verify() {
      const r = await http.request<{ headSeq: number; headHash: string; verified: { ok: boolean; upToSeq: number; firstBroken?: number | null } | null }>({ method: "POST", path: "/audit/chain/verify" })
      if (!r.ok) throw r.error
      const { headSeq, headHash, verified } = r.data
      if (verified && !verified.ok) return { ok: false, count: verified.upToSeq, head: headHash, firstBroken: verified.firstBroken ?? 0 }
      return { ok: true, count: headSeq, head: headHash }
    },
    async exportAll(reason): Promise<AuditExportFiles | RuleError> {
      const to = isoAt(Date.now() + offset + 86_400_000, tz)
      const made = await http.request<{ id: string; events: number; fileName: string }>({ method: "POST", path: "/audit/exports", body: { from: "1970-01-01T00:00:00Z", to, reason }, key: crypto.randomUUID() })
      if (!made.ok) return made.error
      const [jsonl, manifest] = await Promise.all([
        http.request<string>({ method: "GET", path: `/audit/exports/${made.data.id}/events.jsonl`, as: "text" }),
        http.request<string>({ method: "GET", path: `/audit/exports/${made.data.id}/manifest.json`, as: "text" }),
      ])
      if (!jsonl.ok) return jsonl.error
      if (!manifest.ok) return manifest.error
      return { baseName: made.data.fileName, jsonl: jsonl.data, manifest: manifest.data, events: made.data.events }
    },
  }

  const port: DataPort & { session: typeof sessionPort; permits: typeof permits; audit: typeof auditPort } = {
    appearance: createAppearancePort(http),
    groups: createGroupPort(http),
    delegations: createDelegationPort(http),
    mode: "api",
    whole: false,
    session: sessionPort,
    registry: { get: s.registry.get, subscribe: s.registry.subscribe, ...registry },
    permits,
    audit: auditPort,
    queries,

    start() {
      let stopped = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let source: EventSource | undefined

      const changed = () => s.changed.set(s.changed.get() + 1)
      const refresh = async () => {
        if (session.get().status !== "aberta") return
        const since = nowIso()
        const e = syncedAt ? await syncReference(s, syncedAt) : null
        if (!e) syncedAt = since
        await permits.loadMine()
        changed()
      }
      let pending: ReturnType<typeof setTimeout> | undefined
      const soon = () => { clearTimeout(pending); pending = setTimeout(() => void refresh(), 300) }

      const poll = async () => {
        if (stopped) return
        if (session.get().status !== "aberta") {
          const error = await readHealth()
          if (!error && session.get().status === "carregando") await readSession()
          if (!stopped) timer = setTimeout(() => void poll(), opts.statusEvery ?? 5000)
          return
        }
        const st = await http.request<{ now: string; devLogin?: boolean }>({ method: "GET", path: "/status" })
        if (st.ok) {
          offset = msOf(st.data.now, tz) - Date.now()
          patch({ devLogin: st.data.devLogin === true })
          if (session.get().status === "carregando") await readSession()
        } else if (st.down) {
          // The API may answer while the database does not: the clock still comes from /health.
          const h = await http.request<{ now: string }>({ method: "GET", path: "/health" })
          if (h.ok) offset = msOf(h.data.now, tz) - Date.now()
          patch({ serverDown: true })
        }
        if (session.get().serverDown === false) void permits.flushStops()
        if (!stopped) timer = setTimeout(() => void poll(), opts.statusEvery ?? 5000)
      }

      const tick = setInterval(() => { const n = nowIso(); patch({ now: n, today: dayOf(n, tz) }) }, 1000)
      const every = setInterval(() => void refresh(), opts.syncEvery ?? 30_000)
      const ES = opts.eventSource ?? (typeof EventSource === "undefined" ? undefined : EventSource)
      let streamPerson = ""
      const connect = () => {
        const current = session.get()
        const wanted = current.status === "aberta" ? current.personId : ""
        if (wanted === streamPerson) return
        streamPerson = wanted
        source?.close(); source = undefined
        if (ES && wanted) {
          source = new ES(http.url("/events"), { withCredentials: true })
          source.addEventListener("ptw", soon)
        }
      }
      const offSession = session.subscribe(connect)
      connect()
      void (async () => { if (session.get().status === "carregando") await readSession(); void poll() })()
      return () => { stopped = true; offSession(); clearTimeout(timer); clearTimeout(pending); clearInterval(tick); clearInterval(every); source?.close() }
    },
  }

  try { const healthError = await readHealth(); const sessionError = await readSession(); bootstrapDone(!healthError && !sessionError) }
  catch (error) { bootstrapDone(false); throw error }
  return port
}

export { noServer }

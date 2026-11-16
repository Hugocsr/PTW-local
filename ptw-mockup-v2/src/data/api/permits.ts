/**
 * The PTs over the API. The state of a PT changes on screen only with the server's answer (A17); the one
 * exception is a form answer, which shows at once and goes back if refused, and a Parar made while the
 * server is down, which is kept, shown, and sent again with the same `Idempotency-Key`.
 */
import type { ItemAnswer } from "@/core/form"
import type { RuleError } from "@/core/ptwErrors"
import { uuidv7 } from "@/lib/id"
import { permitReducer } from "@/permit/reducer"
import type { Permit, PermitAttachment, PermitData } from "@/permit/types"
import type { AttachKind } from "@/registry/types"
import { settled, type Act, type PermitAct, type PermitPort } from "../port"
import { noServer, type Res } from "./http"
import { addAssets, mergeDetail, refusal, undoNow, type PermitDetail, type Shared } from "./state"

interface QueuedStop { permitId: string; reason: string; key: string; personId: string }
const QUEUE_KEY = "ptw.fila.parar"

const readQueue = (): QueuedStop[] => {
  try { return JSON.parse(globalThis.localStorage?.getItem(QUEUE_KEY) ?? "[]") as QueuedStop[] } catch { return [] }
}
const writeQueue = (q: QueuedStop[]) => { try { globalThis.localStorage?.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* no storage: kept in memory only */ } }

export function createPermitPort(s: Shared) {
  const { http } = s
  /** PTs read with `GET /permits/{id}` (that read is already the server's `acesso.pt.aberta`), by id → when. */
  const justRead = new Map<string, number>()
  /** PTs a person asked for by hand: `gone` from Minha área does not drop them. */
  const opened = new Set<string>()
  let mineSince: string | null = null
  let sessionVersion = 0
  const stops: QueuedStop[] = readQueue()
  let flushing = false

  const permitOf = (id: string) => s.permits.get().permits.find((p) => p.id === id)

  /** Versions whose content the registry lacks (an archived one) are read before the PT shows. */
  async function ensureVersion(p: Permit) {
    const v = s.registry.get().templates.find((t) => t.id === p.templateId)?.versions.find((x) => x.id === p.versionId)
    if (!v || v.stages) return
    const r = await http.request<import("@/registry/types").TemplateVersion>({ method: "GET", path: `/templates/${p.templateId}/versions/${p.versionId}` })
    if (!r.ok) return
    const reg = s.registry.get()
    s.registry.set({ ...reg, templates: reg.templates.map((t) => (t.id === p.templateId ? { ...t, versions: t.versions.map((x) => (x.id === p.versionId ? r.data : x)) } : t)) })
  }

  async function take(d: PermitDetail, epoch = sessionVersion) {
    if (epoch !== sessionVersion) return
    await ensureVersion(d.permit)
    if (epoch !== sessionVersion) return
    mergeDetail(s, d)
  }

  /** Minha área's set (`GET /permits/mine`); after the first read only what changed. */
  async function loadMine(): Promise<RuleError | null> {
    const sessionAtStart = sessionVersion
    const r = await http.request<{ items: PermitDetail[]; gone?: string[]; asOf: string }>({ method: "GET", path: "/permits/mine", query: { updatedSince: mineSince ?? undefined } })
    if (!r.ok) return r.error
    if (sessionAtStart !== sessionVersion) return null
    for (const d of r.data.items) await take(d, sessionAtStart)
    if (sessionAtStart !== sessionVersion) return null
    const gone = (r.data.gone ?? []).filter((id) => !opened.has(id))
    if (gone.length) {
      const data = s.permits.get()
      s.permits.set({ ...data, permits: data.permits.filter((p) => !gone.includes(p.id)) })
    }
    mineSince = r.data.asOf
    return null
  }

  /** Sends one Parar; true when it is settled (written, or refused for good). */
  async function sendStop(q: QueuedStop): Promise<Res<PermitDetail>> {
    return http.request<PermitDetail>({ method: "POST", path: `/permits/${q.permitId}/stop`, body: { reason: q.reason }, key: q.key })
  }

  /** The kept stops go out again, in order, with their own keys. Stops at the first "server down". */
  async function flushStops() {
    if (flushing) return
    flushing = true
    try {
      while (stops.length && s.session.get().status === "aberta") {
        const index = stops.findIndex((q) => q.personId === s.session.get().personId)
        if (index < 0) return
        const epoch = sessionVersion
        const r = await sendStop(stops[index])
        if (!r.ok && r.down) return
        if (!r.ok && r.status === 401) return
        stops.splice(index, 1); writeQueue(stops)
        if (epoch !== sessionVersion) return
        if (r.ok) await take(r.data, epoch); else await loadMine()
      }
    } finally { flushing = false }
  }

  /** What to ask the server for one act. */
  function call(a: PermitAct, p: Permit, undo: boolean, key: string): Promise<Res<PermitDetail>> {
    const path = `/permits/${p.id}`
    switch (a.kind) {
      case "sign":
        if (p.state === "rascunho" || p.state === "devolvida") return http.request({ method: "POST", path: `${path}/submit`, ifMatch: p.rowVersion, key, undo })
        return http.request({ method: "POST", path: `${path}/signatures`, body: { id: uuidv7(), slotId: a.slotId, rev: p.revision }, key, undo })
      case "refuse": return http.request({ method: "POST", path: `${path}/return`, body: { reason: a.reason }, ifMatch: p.rowVersion, undo })
      case "resume": return http.request({ method: "POST", path: `${path}/resume`, body: { reason: a.reason }, ifMatch: p.rowVersion, undo })
      case "extend": return http.request({ method: "POST", path: `${path}/extensions`, body: { newEnd: a.newEnd, reason: a.reason }, ifMatch: p.rowVersion, key, undo })
      case "stop": return sendStop({ permitId: p.id, reason: a.reason, key, personId: s.session.get().personId })
      case "answer": throw new Error("answer has its own path")
    }
  }

  /** One request at a time per form item, so two quick answers to the same item land in order. */
  const chains = new Map<string, Promise<unknown>>()
  const inOrder = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn)
    chains.set(key, run)
    return run
  }

  function answer(a: Extract<PermitAct, { kind: "answer" }>, p: Permit, pre: Permit | undefined, undo: boolean): Act {
    const epoch = sessionVersion
    const before: { value: ItemAnswer | undefined; meta: Permit["answerMeta"][string] | undefined } = { value: p.answers[a.itemId], meta: p.answerMeta[a.itemId] }
    const patch = (value: typeof before.value, meta: typeof before.meta) => {
      if (epoch !== sessionVersion) return
      const data = s.permits.get()
      s.permits.set({ ...data, permits: data.permits.map((x) => {
        if (x.id !== p.id) return x
        const answers = { ...x.answers }, answerMeta = { ...x.answerMeta }
        if (value === undefined) { delete answers[a.itemId]; delete answerMeta[a.itemId] } else { answers[a.itemId] = value; answerMeta[a.itemId] = meta! }
        return { ...x, answers, answerMeta }
      }) })
    }
    // Shown at once; goes back if the server refuses.
    const shown: ItemAnswer | undefined = pre?.answers[a.itemId]
    if (pre) patch(shown, pre.answerMeta[a.itemId])
    const done = inOrder(`${p.id}|${a.itemId}`, async (): Promise<RuleError | null> => {
      if (epoch !== sessionVersion) return refusal("PTA02", "A sessão mudou. Confira a resposta antes de salvar novamente.")
      const base = { path: `/permits/${p.id}/answers/${a.itemId}`, undo }
      const r = a.value === null
        ? await http.request<void>({ method: "DELETE", ...base })
        : await http.request<{ value: NonNullable<typeof before.value>; answeredBy: string; answeredAt: string }>({ method: "PUT", ...base, body: a.value })
      if (!r.ok) {
        if (permitOf(p.id)?.answers[a.itemId] === shown) patch(before.value, before.meta)
        return r.error
      }
      if (a.value !== null) { const d = (r as Extract<typeof r, { ok: true }>).data as { value: NonNullable<typeof before.value>; answeredBy: string; answeredAt: string }; patch(d.value, { answeredBy: d.answeredBy, answeredAt: d.answeredAt }) }
      return null
    })
    return { refused: null, done }
  }

  const port: PermitPort & { resetSession(): void; flushStops(): Promise<void>; loadMine(): Promise<RuleError | null>; waiting(): number } = {
    get: s.permits.get,
    subscribe: s.permits.subscribe,
    async create(input) {
      if (s.session.get().serverDown) return noServer()
      const epoch = sessionVersion
      const r = await http.request<PermitDetail>({ method: "POST", path: "/permits", body: { ...input, id: input.id ?? uuidv7() }, key: input.id ?? uuidv7() })
      if (!r.ok) return r.error
      await take(r.data, epoch); s.changed.set(s.changed.get() + 1)
      return r.data.permit
    },
    async updateDraft(id, input) {
      if (s.session.get().serverDown) return noServer()
      const epoch = sessionVersion
      const p = permitOf(id)
      if (!p) return refusal("PTA04", "PT não encontrada")
      const r = await http.request<PermitDetail>({ method: "PATCH", path: `/permits/${id}`, body: input, ifMatch: p.rowVersion })
      if (!r.ok) return r.error
      await take(r.data, epoch); s.changed.set(s.changed.get() + 1)
      return r.data.permit
    },
    async discard(id, reason) {
      if (s.session.get().serverDown) return noServer()
      const epoch = sessionVersion
      const p = permitOf(id)
      if (!p) return refusal("PTA04", "PT não encontrada")
      const r = await http.request<PermitDetail>({ method: "POST", path: `/permits/${id}/discard`, body: { reason }, ifMatch: p.rowVersion })
      if (!r.ok) return r.error
      await take(r.data, epoch); s.changed.set(s.changed.get() + 1)
      return null
    },

    act(a): Act {
      const p = permitOf(a.permitId)
      if (!p) return settled(refusal("PTA04", "A PT não existe nesta unidade"))
      const undo = undoNow()
      const down = s.session.get().serverDown
      // The core checks first (the refusal is known at once); the server still decides and records a denial.
      const me = s.session.get().personId
      const epoch = sessionVersion
      const pre = permitReducer(s.permits.get(), { ...a, personId: me }, { serverDown: down, audit: s.ctx(), registry: s.registry.get() })
      const refused = pre.denied ?? null
      if (a.kind === "answer") {
        if (down) return settled(noServer())
        return { ...answer(a, p, refused ? undefined : pre.data.permits.find((x) => x.id === p.id), undo), refused }
      }
      if (down && a.kind !== "stop") return settled(noServer())
      const key = uuidv7()
      const done = (async (): Promise<RuleError | null> => {
        if (down) return queueStop(a as Extract<PermitAct, { kind: "stop" }>, p, refused ? null : pre.data, key, me, epoch)
        const r = await call(a, p, undo, key)
        if (r.ok) { await take(r.data, epoch); return null }
        if (r.down && a.kind === "stop") return queueStop(a, p, refused ? null : pre.data, key, me, epoch)
        if (r.error.code === "PTA06") void loadMine()
        return r.error
      })()
      return { refused, done }
    },

    async capture(permitId, _personId, itemId, kind: AttachKind, file): Promise<PermitAttachment | null> {
      if (s.session.get().serverDown) return null
      const epoch = sessionVersion
      const bytes = await file.arrayBuffer()
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
      const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")
      if (epoch !== sessionVersion) return null
      const has = await http.request<void>({ method: "HEAD", path: `/blobs/${sha256}` })
      if (epoch !== sessionVersion) return null
      if (!has.ok) {
        const up = await http.request<{ sha256: string; size: number; mime: string; storedAt: string }>({ method: "PUT", path: `/blobs/${sha256}`, file: new Blob([bytes], { type: file.type || "application/octet-stream" }) })
        if (!up.ok) return null
      }
      if (epoch !== sessionVersion) return null
      const r = await http.request<PermitAttachment>({
        method: "POST", path: `/permits/${permitId}/attachments`, key: uuidv7(),
        body: { id: uuidv7(), itemId, kind, sha256, fileName: file.name || "arquivo", previewSha256: null, width: null, height: null, durationMs: null },
      })
      if (!r.ok || epoch !== sessionVersion) return null
      const data = s.permits.get()
      s.permits.set({
        ...data, attachments: [...data.attachments.filter((x) => x.id !== r.data.id), r.data],
        blobs: data.blobs[sha256] ? data.blobs : { ...data.blobs, [sha256]: { sha256, size: bytes.byteLength, mime: file.type || "application/octet-stream", storedAt: s.now(), url: "" } },
      })
      return r.data
    },

    urlOf(sha) {
      const att = s.permits.get().attachments
      const full = att.find((x) => x.sha256 === sha)
      if (full) return http.url(`/attachments/${full.id}/content`, { mode: "visto" })
      const thumb = att.find((x) => x.previewSha256 === sha)
      return thumb ? http.url(`/attachments/${thumb.id}/preview`) : undefined
    },

    async load(key) {
      const epoch = sessionVersion
      const have = s.permits.get().permits.find((p) => p.id === key || p.number === key)
      if (have) { opened.add(have.id); return have }
      const r = await http.request<PermitDetail>({ method: "GET", path: `/permits/${encodeURIComponent(key)}` })
      if (!r.ok) { if (r.status === 404) return null; throw r.error }
      justRead.set(r.data.permit.id, Date.now())
      opened.add(r.data.permit.id)
      await take(r.data, epoch)
      return r.data.permit
    },

    resetSession() { sessionVersion++; mineSince = null; opened.clear(); justRead.clear() },
    flushStops, loadMine,
    waiting: () => stops.length,
  }

  /** A Parar the server did not get: shown now (the core's answer, never "liberado"), kept, sent again later. */
  function queueStop(a: Extract<PermitAct, { kind: "stop" }>, p: Permit, shown: PermitData | null, key: string, personId: string, epoch: number): RuleError | null {
    if (!shown) return noServer()
    stops.push({ permitId: p.id, reason: a.reason, key, personId }); writeQueue(stops)
    if (epoch === sessionVersion) s.permits.set(shown)
    return null
  }

  return Object.assign(port, {
    /** The opening of a PT the screen already holds is noted by the server; a PT just read by `load` already was. */
    readJustNow(id: string): boolean {
      const t = justRead.get(id)
      if (t === undefined) return false
      justRead.delete(id)
      return Date.now() - t < 10_000
    },
    addAssets: (items: Parameters<typeof addAssets>[1]) => addAssets(s, items),
  })
}

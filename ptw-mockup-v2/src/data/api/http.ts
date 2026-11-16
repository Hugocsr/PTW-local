/**
 * The HTTP client of the `api` data layer: `fetch` with the cookie session, the headers the contract
 * asks for, and one error shape. Pure plumbing; it knows no screen and no cache.
 *
 * Headers (ptw-server/api/openapi.yaml): `X-Request-Id` and `X-Ptw-Client` on every call; `X-Ptw-Csrf` on
 * writes; `Idempotency-Key` on a creating write (the caller keeps the key to send it again); `If-Match`
 * with the revision read; `X-Ptw-Undo: true` for a "Desfazer"; `X-Ptw-Reason` percent-encoded UTF-8.
 * An error body `{ code, message, detail? }` becomes a `RuleError` with the code as it came (`PTWnn`,
 * SQLSTATE, `PTAnn`). No answer (network) or 503/502 is the "sem servidor" refusal.
 */
import type { DenyCode, RuleError } from "@/core/ptwErrors"
import { uuidv7 } from "@/lib/id"

/** The refusal for "the server did not answer" (shown as "Servidor fora do ar"). */
export const noServer = (): RuleError => ({ code: "sem_servidor", message: "O servidor não respondeu" })

type Scalar = string | number | boolean | null | undefined
export type Query = Record<string, Scalar | readonly Scalar[]>

export interface Req {
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE"
  /** Path under the base ("/permits/…"). */
  path: string
  query?: Query
  /** JSON body. */
  body?: unknown
  /** Raw body (a file); sent as is, with `type` as its content type. */
  file?: Blob
  /** Revision read (`If-Match: "<n>"`). */
  ifMatch?: number
  /** `Idempotency-Key`; the caller makes it once per user act and reuses it to send the same act again. */
  key?: string
  /** `X-Ptw-Reason` (percent-encoded here). */
  reason?: string
  /** `X-Ptw-Undo: true`. Read `isUndoing()` when the write starts, not when it is sent. */
  undo?: boolean
  /** How to read a good answer. Default json; `none` ignores the body. */
  as?: "json" | "text" | "none"
}

export type Res<T> =
  | { ok: true; data: T; status: number; etag: number | null; replayed: boolean }
  | { ok: false; error: RuleError; status: number; /** Nothing answered, or 502/503: the server is down. */ down: boolean }

export interface HttpOptions {
  fetch?: typeof fetch
  /** Where the contract is served (`servers[0].url`). */
  base?: string
  /** The device's name (`X-Ptw-Client`). */
  clientName?: () => string
  /** The session's `csrfToken`. */
  csrf?: () => string | null
  /** Changes as soon as another login begins, before its new CSRF can arrive. */
  sessionVersion?: () => number
  /** A 401 came back: the session is gone. */
  onUnauthorized?: () => void
  /** Every answer (or none) tells whether the server is reachable. */
  onReach?: (up: boolean) => void
}

export interface Http {
  request<T>(r: Req): Promise<Res<T>>
  /** An address under the base, with the query (for `<img src>` and downloads). */
  url(path: string, query?: Query): string
}

const READS = new Set(["GET", "HEAD"])

function search(q: Query | undefined): string {
  if (!q) return ""
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined && x !== null && x !== "") p.append(k, String(x))
  }
  const s = p.toString()
  return s ? `?${s}` : ""
}

/** `"7"` → 7. */
const revisionOf = (etag: string | null): number | null => {
  const m = etag ? /^"?(\d+)"?$/.exec(etag) : null
  return m ? Number(m[1]) : null
}

/** The error of a non-2xx answer: the body's `{ code, message, detail? }`, or one made from the status. */
export function errorOf(status: number, text: string): RuleError {
  try {
    const b = JSON.parse(text) as { code?: unknown; message?: unknown; detail?: unknown }
    if (b && typeof b.code === "string" && typeof b.message === "string") {
      return b.detail === undefined || b.detail === null ? { code: b.code as DenyCode, message: b.message } : { code: b.code as DenyCode, message: b.message, detail: String(b.detail) }
    }
  } catch { /* not JSON: a proxy page */ }
  if (status === 502 || status === 503) return noServer()
  return { code: "PTA99", message: `Erro inesperado do servidor (HTTP ${status})` }
}

/** The lockout (`PTA12`, HTTP 429) says how long to wait: `retry-after` in seconds, rounded up to minutes. */
export function lockoutWait(status: number, error: RuleError, retryAfter: string | null): RuleError {
  const s = retryAfter !== null && /^\s*\d+\s*$/.test(retryAfter) ? Number(retryAfter) : NaN
  if (status !== 429 || error.code !== "PTA12" || !Number.isFinite(s)) return error
  const m = Math.max(1, Math.ceil(s / 60))
  const when = s < 60 ? "em 1 minuto" : `em ${m} ${m === 1 ? "minuto" : "minutos"}`
  return { ...error, message: `Tentativas demais. Tente de novo ${when}.` }
}

export function createHttp(o: HttpOptions = {}): Http {
  const base = o.base ?? "/api/v1"
  const doFetch: typeof fetch = (...a) => (o.fetch ?? globalThis.fetch)(...a)
  const url = (path: string, q?: Query) => `${base}${path}${search(q)}`

  async function request<T>(r: Req): Promise<Res<T>> {
    const sessionToken = o.csrf?.()
    const sessionVersion = o.sessionVersion?.()
    const h: Record<string, string> = { Accept: "application/json", "X-Request-Id": `ptw-${uuidv7()}` }
    const client = o.clientName?.()
    if (client) h["X-Ptw-Client"] = client
    if (!READS.has(r.method) && sessionToken) h["X-Ptw-Csrf"] = sessionToken
    if (r.ifMatch !== undefined) h["If-Match"] = `"${r.ifMatch}"`
    if (r.key) h["Idempotency-Key"] = r.key
    if (r.undo) h["X-Ptw-Undo"] = "true"
    if (r.reason !== undefined) h["X-Ptw-Reason"] = encodeURIComponent(r.reason)
    let body: BodyInit | undefined
    if (r.file) { body = r.file; h["Content-Type"] = r.file.type || "application/octet-stream" }
    else if (r.body !== undefined) { body = JSON.stringify(r.body); h["Content-Type"] = "application/json" }

    let res: Response
    try {
      res = await doFetch(url(r.path, r.query), { method: r.method, headers: h, body, credentials: "same-origin", signal: AbortSignal.timeout(r.file ? 120_000 : 20_000) })
    } catch {
      o.onReach?.(false)
      return { ok: false, error: noServer(), status: 0, down: true }
    }
    const down = res.status === 502 || res.status === 503
    o.onReach?.(!down)
    if (!res.ok) {
      const error = lockoutWait(res.status, errorOf(res.status, await res.text().catch(() => "")), res.headers.get("Retry-After"))
      if (res.status === 401 && o.csrf?.() === sessionToken && o.sessionVersion?.() === sessionVersion) o.onUnauthorized?.()
      return { ok: false, error, status: res.status, down }
    }
    const etag = revisionOf(res.headers.get("ETag"))
    const replayed = res.headers.get("Idempotency-Replayed") === "true"
    const as = r.as ?? "json"
    if (as === "none" || res.status === 204 || r.method === "HEAD") return { ok: true, data: undefined as T, status: res.status, etag, replayed }
    try {
      const text = await res.text()
      return { ok: true, data: (as === "text" ? text : JSON.parse(text)) as T, status: res.status, etag, replayed }
    } catch {
      return { ok: false, status: res.status, down: false, error: { code: "PTA99", message: "O servidor devolveu uma resposta incompleta. Tente novamente." } }
    }
  }

  return { request, url }
}

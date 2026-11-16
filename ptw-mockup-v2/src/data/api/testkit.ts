/**
 * Test kit of the `api` layer: a `fetch` that answers from handlers (the contract's shapes, built from
 * the `exemplo` scenario, which already has them), and the fixtures.
 */
import { exemplo } from "@/demo/exemplo"
import type { Permit } from "@/permit/types"
import type { RegistryState, TypeDef } from "@/registry/types"
import type { DataPort } from "../port"
import { createApiPort } from "./index"
import type { PermitDetail } from "./state"

export interface Call { method: string; path: string; query: URLSearchParams; headers: Headers; body: unknown; raw: BodyInit | null | undefined }
export interface Answer { status?: number; body?: unknown; text?: string; headers?: Record<string, string> }
export type Handler = (c: Call) => Answer | Promise<Answer>

export const BASE = "/api/v1"
export const reg: RegistryState = exemplo.registry
export const pageOf = <T>(items: T[]) => ({ items, total: items.length, page: 0, pageSize: 1000 })
export const err = (status: number, code: string, message: string, detail?: string): Answer => ({ status, body: { code, message, ...(detail ? { detail } : {}) } })

/** `fetch` over handlers keyed "METHOD /path" (path without the base; `:id` matches one segment). */
export function fakeServer(handlers: Record<string, Handler>) {
  const calls: Call[] = []
  const table = Object.entries(handlers).map(([k, h]) => {
    const [method, pattern] = k.split(" ")
    return { method, re: new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, "[^/]+")}$`), h }
  })
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input), "http://x")
    const path = u.pathname.slice(BASE.length)
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined
    const call: Call = { method: init?.method ?? "GET", path, query: u.searchParams, headers: new Headers(init?.headers), body, raw: init?.body }
    calls.push(call)
    const hit = table.find((t) => t.method === call.method && t.re.test(path))
    if (!hit) return new Response(JSON.stringify({ code: "PTA04", message: `sem rota ${call.method} ${path}` }), { status: 404 })
    const a = await hit.h(call)
    if (a.status === -1) throw new TypeError("Failed to fetch")
    const status = a.status ?? 200
    const noBody = status === 204 || call.method === "HEAD"
    return new Response(noBody ? null : (a.text ?? JSON.stringify(a.body ?? {})), { status, headers: a.headers })
  }) as typeof fetch
  return { fetch: fetchFn, calls, find: (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path)) }
}

export const NETWORK: Answer = { status: -1 }

const wireTypes = (list: TypeDef[], family: string) => list.map((t) => ({ ...t, family }))
export const allTypes = () => [
  ...wireTypes(reg.locationTypes, "local"), ...wireTypes(reg.assetTypes, "ativo"),
  ...wireTypes(reg.roleTypes, "cargo"), ...wireTypes(reg.relationKinds, "relacao"),
]

export const person = (name: string) => reg.people.find((p) => p.name === name)!
export const permitIn = (state: Permit["state"]) => exemplo.permits.permits.find((p) => p.state === state)!

export function detailOf(p: Permit, patch: Partial<Permit> = {}): PermitDetail {
  const d = exemplo.permits
  const permit = { ...p, ...patch }
  return {
    permit,
    form: { sections: [] },
    signatures: d.signatures.filter((x) => x.permitId === p.id),
    revisions: d.revisions.filter((x) => x.permitId === p.id),
    extensions: d.extensions.filter((x) => x.permitId === p.id),
    attachments: d.attachments.filter((x) => x.permitId === p.id),
    blobs: {}, assets: reg.assets.filter((a) => p.assetIds.includes(a.id)),
    currentStageId: null, released: false, now: exemplo.start,
  }
}

export const sessionOf = (name: string, extra: object = {}) => ({
  person: person(name), unit: reg.units[0], auth: "sessao", grants: ["cadastro", "modelos", "auditoria", "exportacao"], expiresAt: exemplo.start, now: exemplo.start, csrfToken: "csrf-1", devLogin: true, ...extra,
})

/** The routes every signed-in test needs: session, reference data, Minha área (with these PTs), status. */
export function baseRoutes(as: string, mine: PermitDetail[], extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    "GET /health": () => ({ body: { ok: true, now: exemplo.start, devLogin: true, passwordLogin: false } }),
    "GET /session": () => ({ body: sessionOf(as) }),
    "GET /unit": () => ({ body: reg.units[0] }),
    "GET /types": () => ({ body: pageOf(allTypes()) }),
    "GET /locations": () => ({ body: pageOf(reg.locations) }),
    "GET /people": () => ({ body: pageOf(reg.people) }),
    "GET /option-lists": () => ({ body: pageOf(reg.optionLists) }),
    "GET /templates": () => ({ body: pageOf(reg.templates) }),
    "GET /asset-relations": () => ({ body: pageOf(reg.relations) }),
    "GET /assets": (c) => ({ body: pageOf(reg.assets.filter((a) => !c.query.has("id") || c.query.getAll("id").includes(a.id))) }),
    "GET /permits/mine": () => ({ body: { items: mine, asOf: exemplo.start } }),
    "GET /status": () => ({ body: { now: exemplo.start, version: "t", db: { ok: true }, storage: { ok: true }, clock: { driftMs: 0, ok: true }, devLogin: true } }),
    ...extra,
  }
}

export const slotOf = (p: Permit) => reg.templates.find((t) => t.id === p.templateId)!.versions.find((v) => v.id === p.versionId)!.stages.flatMap((s) => s.slots)[0].id

export type Port = DataPort & { permits: DataPort["permits"] & { flushStops(): Promise<void>; waiting(): number; loadMine(): Promise<unknown> } }

/** A signed-in port over a fake server. */
export async function boot(as: string, mine: Permit[], extra: Record<string, Handler> = {}) {
  const srv = fakeServer(baseRoutes(as, mine.map((p) => detailOf(p)), extra))
  const port = (await createApiPort({ fetch: srv.fetch, eventSource: undefined })) as Port
  return { port, srv }
}
export const stateOf = (port: DataPort, p: Permit) => port.permits.get().permits.find((x) => x.id === p.id)!
export const rowKey = (p: Permit) => `/permits/${p.id}`
export const wait = (ms = 10) => new Promise((r) => setTimeout(r, ms))

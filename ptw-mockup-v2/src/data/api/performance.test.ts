import { expect, it } from "vitest"
import { createClientTimings, normalizedEndpoint, type ClientTiming } from "./performance"
import { createHttp } from "./http"

it("does not collect or emit when disabled", () => {
  const events: ClientTiming[] = []
  const timings = createClientTimings({ enabled: false, emit: e => events.push(e) })
  timings.start("login")(true); timings.request("r", "/people/SECRET", "GET")(200, 10)
  expect(events).toEqual([])
})

it("correlates nested spans and requests without sensitive paths or payloads", async () => {
  const events: ClientTiming[] = []; let now = 0
  const timings = createClientTimings({ enabled: true, emit: e => events.push(e), now: () => now })
  const bootstrap = timings.start("bootstrap"); const restore = timings.start("restore")
  const http = createHttp({ timings, fetch: async () => { now=12; return new Response('{"name":"SECRET"}') } })
  await http.request({ method: "GET", path: "/people/SECRET", query: { password: "SECRET" } })
  restore(true); bootstrap(true)
  expect(events[0]).toMatchObject({ kind: "request", endpoint: "/people/:id", status: 200, totalMs: 12, bodyBytes: 17 })
  expect(events[1]).toMatchObject({ kind: "span", phase: "restore", spanId: events[0]!.spanId })
  expect(JSON.stringify(events)).not.toMatch(/SECRET|password|name/)
  expect(normalizedEndpoint("/permits/abc/attachments/def?token=secret")).toBe("/permits/:id/attachments/:id")
})

it("records network failures and HTTP refusals while preserving caller behavior", async () => {
  const events: ClientTiming[] = []
  const timings = createClientTimings({ enabled: true, emit: e => events.push(e) })
  const unavailable = createHttp({ timings, fetch: async () => { throw new Error("private") } })
  expect(await unavailable.request({ method: "GET", path: "/unit" })).toMatchObject({ ok: false, status: 0 })
  const denied = createHttp({ timings, fetch: async () => new Response('{"code":"PTA02","message":"private"}', { status: 401 }) })
  expect(await denied.request({ method: "GET", path: "/session" })).toMatchObject({ ok: false, status: 401 })
  expect(events).toHaveLength(2)
  expect(JSON.stringify(events)).not.toContain("private")
})

it("a failed diagnostic sink never prevents completion", async () => {
  const timings = createClientTimings({ enabled: true, emit: () => { throw new Error("collector offline") } })
  const done = timings.start("login")
  const http = createHttp({ timings, fetch: async () => new Response("{}") })
  expect(await http.request({ method: "GET", path: "/unit" })).toMatchObject({ ok: true })
  expect(() => done(true)).not.toThrow()
})

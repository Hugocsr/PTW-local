import { afterEach, expect, it, vi } from "vitest"
import { createApiPort } from "./index"
import { baseRoutes, boot, fakeServer, pageOf, reg } from "./testkit"
class Stream extends EventTarget {
  static current: Stream
  constructor() { super(); Stream.current = this }
  close() {}
  notice(domains?: string[]) { this.dispatchEvent(new MessageEvent("ptw", { data: JSON.stringify({ seq: 1, permit: null, ...(domains ? { domains } : {}) }) })) }
}
afterEach(() => vi.useRealTimers())
it("remoção por evento recupera a coleção inteira quando o total diverge", async () => {
  vi.useFakeTimers()
  let removed = false
  const srv = fakeServer(baseRoutes("Marina Costa", [], {
    "GET /locations": c => ({ body: pageOf(!removed ? reg.locations : c.query.has("updatedSince") ? [] : reg.locations.slice(1)) }),
  }))
  const port = await createApiPort({ fetch: srv.fetch, eventSource: Stream as unknown as typeof EventSource })
  const stop = port.start()
  try {
    removed = true; Stream.current.notice(["locations", "assets", "permits", "audit"])
    await vi.advanceTimersByTimeAsync(350)
    expect(port.registry.get().locations.map(l => l.id)).toEqual(reg.locations.slice(1).map(l => l.id))
    expect(srv.find("GET", /^\/locations$/).filter(c => !c.query.has("updatedSince")).length).toBeGreaterThan(2)
  } finally { stop() }
})
it("audit não recarrega referências; ativos invalidam contagens e legado recupera cadastros", async () => {
  vi.useFakeTimers()
  const srv = fakeServer(baseRoutes("Marina Costa", []))
  const port = await createApiPort({ fetch: srv.fetch, eventSource: Stream as unknown as typeof EventSource })
  const stop = port.start()
  try {
    const old = srv.calls.length, assets = port.queries.changes!.assets!.get()
    Stream.current.notice(["audit"]); await vi.advanceTimersByTimeAsync(350)
    expect(srv.calls.slice(old).filter(c => /locations|templates|permits/.test(c.path))).toHaveLength(0)
    Stream.current.notice(["assets", "permits", "audit"]); await vi.advanceTimersByTimeAsync(350)
    expect(port.queries.changes!.assets!.get()).toBe(assets + 1)
    expect(srv.calls.slice(old).filter(c => /locations|templates/.test(c.path))).toHaveLength(0)
    Stream.current.notice(); await vi.advanceTimersByTimeAsync(350)
    expect(srv.calls.slice(old).some(c => c.path === "/locations")).toBe(true)
    expect(srv.calls.slice(old).some(c => c.path === "/templates")).toBe(true)
  } finally { stop() }
})
it("lote normalizado e total global são compartilhados; invalidação cria outra geração", async () => {
  const ids = reg.locations.slice(0, 2).map(l => l.id)
  const { port, srv } = await boot("Marina Costa", [], {
    "GET /locations/asset-counts": c => ({ body: { items: c.query.getAll("locationIds").map(locationId => ({ locationId, count: 0 })) } }),
  })
  const [a, b] = await Promise.all([port.queries.locationAssetCounts!(ids), port.queries.locationAssetCounts!([...ids].reverse())])
  expect(a).toEqual(b); expect(srv.find("GET", /asset-counts/)).toHaveLength(1)
  const view = { q: "", sort: null, page: 0, pageSize: 25 }
  await Promise.all([port.queries.assets(view), port.queries.assets({ ...view, q: "P" })])
  expect(srv.find("GET", /^\/assets$/).filter(c => c.query.get("pageSize") === "1")).toHaveLength(1)
})

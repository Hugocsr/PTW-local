import { afterEach, expect, it, vi } from "vitest"
import { DOMAINS, noticeDomains, syncCoordinator } from "./sync"
import { readCache } from "./readCache"
afterEach(() => vi.useRealTimers())
it("conserva mensagens desconhecidas e legadas; audit isolada não vira atualização ampla", () => {
  expect(noticeDomains('{"domains":["audit"]}')).toEqual(["audit"])
  for (const raw of ["bad", "{}", '{"domains":["future"]}', '{"domains":[]}']) expect(noticeDomains(raw)).toEqual(DOMAINS)
})
it("100 avisos em voo são consolidados sem execução concorrente", async () => {
  let finish!: (ok: boolean) => void
  const batches: string[][] = []
  let active = 0, max = 0
  const sync = syncCoordinator(async domains => {
    batches.push(domains); active++; max = Math.max(max, active)
    const result = await new Promise<boolean>(resolve => { finish = resolve })
    active--; return result
  }, () => true, 30000)
  sync.request(["permits"])
  for (let i = 0; i < 100; i++) sync.request(["assets", "locations"])
  finish(true); await Promise.resolve(); await Promise.resolve()
  expect(batches).toEqual([["permits"], ["assets", "locations"]]); expect(max).toBe(1)
  sync.request(["people"]); finish(true); await Promise.resolve(); await Promise.resolve()
  expect(batches[2]).toEqual(["people"])
  sync.close(); finish(true)
})
it("falha espera fallback; fechar impede novas publicações/rodadas", async () => {
  vi.useFakeTimers()
  const run = vi.fn(async (domains: string[]) => { expect(domains.length).toBeGreaterThan(0); return false })
  const sync = syncCoordinator(run, () => true, 30000)
  sync.request(["assets"]); await Promise.resolve(); await Promise.resolve()
  sync.request(["people"]); expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(29999); expect(run).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1); expect(run).toHaveBeenCalledTimes(2)
  expect(new Set(run.mock.calls[1][0])).toEqual(new Set(["people", "assets"]))
  sync.close(); await vi.advanceTimersByTimeAsync(60000); expect(run).toHaveBeenCalledTimes(2)
})
it("compartilha promessa e resultado; erro libera retry e geração antiga não polui nova", async () => {
  const cache = readCache<number>(); let done!: (n: number) => void
  const load = vi.fn(() => new Promise<number>(resolve => { done = resolve }))
  const old = cache("s1:g1", "counts", load)
  expect(cache("s1:g1", "counts", load)).toBe(old)
  expect(load).toHaveBeenCalledTimes(1)
  expect(await cache("s1:g2", "counts", async () => 2)).toBe(2)
  done(1); expect(await old).toBe(1)
  expect(await cache("s1:g2", "counts", async () => 3)).toBe(2)
  await expect(cache("s2:g1", "counts", async () => { throw Error("offline") })).rejects.toThrow("offline")
  expect(await cache("s2:g1", "counts", async () => 4)).toBe(4)
  cache.clear()
  expect(await cache("s2:g1", "counts", async () => 5)).toBe(5)
})
it("volta da rede durante falha em voo recupera uma vez sem esperar o timer", async () => {
  vi.useFakeTimers()
  let release!: (ok: boolean) => void
  const run = vi.fn((domains: string[]) => {
    expect(domains.length).toBeGreaterThan(0)
    return run.mock.calls.length === 1 ? new Promise<boolean>(r => { release = r }) : Promise.resolve(true)
  })
  const sync = syncCoordinator(run, () => true, 30000)
  sync.request(["assets"]); sync.request(["people"], true)
  release(false); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  expect(run).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(60000); expect(run).toHaveBeenCalledTimes(2)
  sync.close()
})

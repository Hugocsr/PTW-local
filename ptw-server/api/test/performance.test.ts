import { expect, it, vi } from "vitest"
import type { FastifyBaseLogger } from "fastify"
import { buildApp } from "../src/app.js"
import { Db, withCtx, type Tx } from "../src/db.js"
import { loadConfig } from "../src/config.js"
import { newTiming, timingContext, timedTransaction, timingSummary } from "../src/observability/performance.js"
import { deploymentMetadata } from "../src/observability/hooks.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { ANA, makeApp, testConfig, UNIT } from "./helpers/app.js"

it("disabled instrumentation leaves transactions untouched", async () => {
  const driver = new FakeDriver()
  const t = newTiming()
  await new Db(driver).withContext({ unitId: UNIT, personId: null, auth: "sistema" }, async tx => { await tx`select ${"secret"}` })
  expect(t.queries).toBe(0)
  expect(driver.transactions[0]!.outcome).toBe("commit")
})

it("counts tags and unsafe lazily without duplicating execution or exposing parameters", async () => {
  const timing = newTiming(); let executions = 0
  const query = () => ({ then(resolve: (v: number[]) => unknown) { executions++; return Promise.resolve([1]).then(resolve) } })
  const tx = Object.assign(() => query(), { unsafe: () => query() }) as unknown as Tx
  const driver = { begin: async <T>(fn: (tx: Tx) => Promise<T>) => fn(tx), listen: vi.fn(), end: vi.fn() }
  await timingContext.run(timing, () => timedTransaction(driver, async observed => {
    const pending = observed`select ${"PASSWORD-and-cookie"}`
    expect(executions).toBe(0)
    await pending; await pending
    await observed.unsafe("select $1", ["SECRET"])
  }))
  expect(executions).toBe(2)
  expect(timing).toMatchObject({ queries: 2, transactions: 1, queryFailures: 0 })
  expect(JSON.stringify(timingSummary(timing))).not.toMatch(/PASSWORD|SECRET|select|cookie/)
})

it("records errors and rollback without changing the thrown error", async () => {
  const timing = newTiming(); const driver = new FakeDriver().fail(/broken/, { code: "42501", message: "private-value" })
  await expect(timingContext.run(timing, () => new Db(driver).withContext({ unitId: UNIT, personId: null, auth: "sistema" }, async tx => { await tx`select broken()` }))).rejects.toThrow("private-value")
  expect(timing).toMatchObject({ queries: 2, queryFailures: 1, transactions: 1 })
  expect(driver.transactions[0]!.outcome).toBe("rollback")
  expect(JSON.stringify(timingSummary(timing))).not.toContain("private-value")
})

it("isolates concurrent requests and excludes work after completion", async () => {
  const traces = await Promise.all([1, 2, 3, 4].map(async n => {
    const trace = newTiming(); const driver = new FakeDriver()
    await timingContext.run(trace, async () => {
      await timedTransaction(driver, async tx => { for (let i=0;i<n;i++) await tx`select ${i}` })
      trace.active = false
      await timedTransaction(driver, async tx => { await tx`select 99` })
    })
    return trace.queries
  }))
  expect(traces).toEqual([1, 2, 3, 4])
})

it("validates sampling and rejects unbounded metadata", () => {
  const env = { PTW_UNIT: UNIT, PTW_DB_PASSWORD: "x", PTW_PERF: "1", PTW_PERF_SAMPLE_RATE: "1" }
  expect(loadConfig(env).performance).toEqual({ sampleRate: 1 })
  expect(loadConfig({ ...env, PTW_PERF: "0" }).performance).toBeUndefined()
  expect(() => loadConfig({ ...env, PTW_PERF_SAMPLE_RATE: "2" })).toThrow()
  expect(deploymentMetadata({ VERCEL_REGION: "secret\nheader=value" }).region).toBe("unknown")
})

it("emits one normalized timing per real HTTP response, including refused paths", async () => {
  const records: Record<string, unknown>[] = []
  const log = vi.fn((obj: Record<string, unknown>) => { if (obj?.event) records.push(obj) })
  const logger = { level: "info", info: log, warn: log, error: log, fatal: log, debug: log, trace: log, silent: log, child: () => logger } as FastifyBaseLogger
  const app = await buildApp({ config: testConfig({ performance: { sampleRate: 1 } }), driver: new FakeDriver(), logger, autoload: false,
    routes: [api => { api.op("getHealth", () => ({ ok: true, now: new Date().toISOString(), devLogin: false, passwordLogin: false }), { standalone: true }) }] })
  try {
    const response = await app.inject({ url: "/api/v1/health?password=SECRET", headers: { cookie: "SECRET", "x-ptw-client": "SECRET" } })
    expect(response.statusCode).toBe(200)
    await app.inject({ url: "/private-SECRET-path" })
    const requests = records.filter(r => r.event === "ptw.performance.request")
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({ operation: "getHealth", status: 200, queries: 0 })
    expect(requests[1]).toMatchObject({ operation: "unmatched", status: 404 })
    expect(JSON.stringify(records)).not.toMatch(/SECRET|cookie|password|private-/)
    expect(requests[0]!.requestId).toBe(response.headers["x-request-id"])
  } finally { await app.close() }
})

it("keeps context through HTTP authentication and refuses a revoked account", async () => {
  const records: Record<string, unknown>[] = []
  const log = vi.fn((obj: Record<string, unknown>) => { if (obj?.event === "ptw.performance.request") records.push(obj) })
  const logger = { level: "info", info: log, warn: log, error: log, fatal: log, debug: log, trace: log, silent: log, child: () => logger } as FastifyBaseLogger
  const { app, login, people } = await makeApp({ config: { performance: { sampleRate: 1 } }, build: { logger },
    routes: [api => { api.op("getUnit", req => withCtx(req, async tx => {
      await tx`select ${"PRIVATE-PARAM"}`
      return { id: UNIT, code: "UN-01", name: "Unidade", timezone: "America/Sao_Paulo" }
    })) }] })
  try {
    const session = await login()
    const response = await app.inject({ url: "/api/v1/unit", headers: session.headers })
    expect(response.statusCode).toBe(200)
    const metric = records.find(r => r.requestId === response.headers["x-request-id"])
    // SPEC 002: +1 na autenticação (permissões dos grupos) e +1 no contexto (ptw.grants).
    expect(metric).toMatchObject({ transactions: 2, queries: 6, queryFailures: 0 })
    expect(Number(metric!.authMs)).toBeGreaterThan(0)
    people.get(ANA)!.enabled = false
    expect((await app.inject({ url: "/api/v1/unit", headers: session.headers })).statusCode).toBe(401)
    expect(JSON.stringify(records)).not.toMatch(/PRIVATE-PARAM|cookie|csrf|Ana Souza/)
  } finally { await app.close() }
})

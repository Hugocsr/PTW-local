import { beforeEach, expect, it, vi } from "vitest"
import postgres from "postgres"
import { postgresDriver } from "../src/db.js"
import { toApiError } from "../src/errors/dbError.js"
import { testConfig } from "./helpers/app.js"

vi.mock("postgres", () => ({ default: vi.fn(() => ({
  begin: vi.fn(), listen: vi.fn(async () => ({ unlisten: vi.fn(async () => {}) })), end: vi.fn(async () => {}),
})) }))
interface Pool { listen: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
const pools = (): Pool[] => vi.mocked(postgres).mock.results.map((r) => r.value as unknown as Pool)
beforeEach(() => { vi.clearAllMocks() })

it("consultas usam transações e o LISTEN só abre sessão quando solicitado", async () => {
  const driver = postgresDriver({ ...testConfig().db, port: 6543, listenPort: 5432, prepare: false, idleSeconds: 5, tls: true })
  expect(vi.mocked(postgres).mock.calls).toHaveLength(1)
  expect(vi.mocked(postgres).mock.calls[0]![0]).toMatchObject({ port: 6543, prepare: false, idle_timeout: 5, ssl: { rejectUnauthorized: true } })
  const stop = await driver.listen("ptw", () => {})
  expect(vi.mocked(postgres).mock.calls[1]![0]).toMatchObject({ port: 5432, max: 1, prepare: false, ssl: { rejectUnauthorized: true } })
  await stop(); await stop()
  expect(pools()[1]!.end).toHaveBeenCalledTimes(1)
  expect(pools()[0]!.end).not.toHaveBeenCalled()
  await driver.end()
  expect(pools()[0]!.end).toHaveBeenCalledTimes(1)
})
it("conexão de sessão que falha é fechada sem derrubar o pool de consultas", async () => {
  const driver = postgresDriver({ ...testConfig().db, listenPort: 5432 })
  vi.mocked(postgres).mockImplementationOnce(() => ({ listen: vi.fn(async () => { throw new Error("offline") }), end: vi.fn(async () => {}) }) as unknown as ReturnType<typeof postgres>)
  await expect(driver.listen("ptw", () => {})).rejects.toThrow("offline")
  expect(pools()[1]!.end).toHaveBeenCalledTimes(1)
  expect(pools()[0]!.end).not.toHaveBeenCalled()
  await driver.end()
})
it("configuração local preserva uma conexão compartilhada e os padrões anteriores", async () => {
  const driver = postgresDriver(testConfig().db)
  const stop = await driver.listen("ptw", () => {})
  expect(vi.mocked(postgres).mock.calls).toHaveLength(1)
  expect(vi.mocked(postgres).mock.calls[0]![0]).toMatchObject({ port: 5432, prepare: true, idle_timeout: 60 })
  await stop(); expect(pools()[0]!.end).not.toHaveBeenCalled()
  await driver.end()
})
it("saturação do pool é indisponibilidade; outros erros internos continuam inesperados", () => {
  expect(toApiError({ code: "XX000", message: "(EMAXCONNSESSION) max clients reached in session mode" })).toMatchObject({ status: 503, code: "PTA01" })
  expect(toApiError({ code: "XX000", message: "Max client connections reached" })).toMatchObject({ status: 503, code: "PTA01" })
  expect(toApiError({ code: "XX000", message: "internal error" })).toMatchObject({ status: 500, code: "PTA99" })
})

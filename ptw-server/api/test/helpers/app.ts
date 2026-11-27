/** Monta a API para os testes: configuração de teste, driver falso com um cadastro mínimo, e entrada. */
import type { FastifyInstance, LightMyRequestResponse } from "fastify"
import { buildApp, type BuildOptions, type RouteModule } from "../../src/app.js"
import { defaultOpenapiPath, type Config } from "../../src/config.js"
import type { Driver } from "../../src/db.js"
import { MemorySessionStore } from "../../src/session/store.js"
import sessionRoutes from "../../src/routes/session.js"
import systemRoutes from "../../src/routes/system.js"
import { FakeDriver } from "./fakeDb.js"

/**
 * As rotas deste pacote, sem o carregamento automático: os testes da base registram rotas de teste
 * sobre operações que outros pacotes vão implementar (o carregamento automático é conferido em
 * `contract.test.ts`).
 */
export const BASE_ROUTES: RouteModule[] = [sessionRoutes, systemRoutes]

export const UNIT = "00000000-0000-7000-8000-000000000001"
export const ANA = "00000000-0000-7000-8000-0000000000d1"
export const BIA = "00000000-0000-7000-8000-0000000000d2"
export const PERMIT = "00000000-0000-7000-8000-0000000000e1"
export const HOST = "ptw.planta.local"
export const ORIGIN = `https://${HOST}`

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    host: "127.0.0.1",
    port: 0,
    basePath: "/api/v1",
    unit: UNIT,
    devLogin: true,
    ldap: null,
    sessionIdleMs: 30 * 60_000,
    draftAutosaveSeconds: 5,
    db: { host: "db", port: 5432, database: "ptw", user: "ptw_api", password: "x", max: 4 },
    storageUrl: "http://storage:8333",
    sessionTtlMs: 12 * 3_600_000,
    clockDriftLimitMs: 2000,
    tickMs: 60_000,
    background: false,
    checkResponses: true,
    openapiPath: defaultOpenapiPath(),
    version: "teste",
    bodyLimit: 1024 * 1024,
    logLevel: "silent",
    ...over,
  }
}

interface FakePerson {
  id: string
  name: string
  login: string | null
  enabled: boolean
  status: "ativo" | "em_revisao" | "inativo"
  account_expires: Date | null
}

/** Cadastro mínimo do driver falso: uma unidade e duas pessoas (Bia com a conta desativada). */
export function seedFake(driver: FakeDriver): { people: Map<string, FakePerson> } {
  const people = new Map<string, FakePerson>([
    [ANA, { id: ANA, name: "Ana Souza", login: "ana", enabled: true, status: "ativo", account_expires: null }],
    [BIA, { id: BIA, name: "Bia Lima", login: "bia", enabled: false, status: "ativo", account_expires: null }],
  ])
  const row = (p: FakePerson) => ({
    id: p.id, unit_id: UNIT, name: p.name, company: "", employee_id: "", login: p.login, enabled: p.enabled,
    account_expires: p.account_expires, ad_object_guid: null, origin: "manual", status: p.status, revision: 1,
    updated_at: new Date("2026-11-01T12:00:00Z"), roles: [],
  })
  driver
    .on(/from ptw\.person p /, ([id, , login]) => {
      const p = [...people.values()].find((x) => (id ? x.id === id : x.login?.toLowerCase() === String(login).toLowerCase()))
      return p ? [row(p)] : []
    })
    .on(/select login, enabled, account_expires, status from ptw\.person/, ([id]) => {
      const p = people.get(String(id))
      return p ? [{ login: p.login, enabled: p.enabled, account_expires: p.account_expires, status: p.status }] : []
    })
    .on(/from ptw\.unit where/, [{ id: UNIT, code: "UN-01", name: "Planta de teste", timezone: "America/Sao_Paulo" }])
    .on(/select clock_timestamp\(\) as now/, () => [{ now: new Date() }])
    .on(/from ptw\.schema_info/, [{ files: { "00_base.sql": "a".repeat(64) } }])
    .on(/select ptw\.expire_due\(/, [{ n: 0 }])

  // ptw.idempotency_begin / _finish como o banco faz: a chave só vale se a transação for confirmada.
  const keys = new Map<string, { operation: unknown; hash: unknown; status: unknown; response: unknown }>()
  const pending = new WeakMap<object, Map<string, { operation: unknown; hash: unknown }>>()
  const person = (tx: { statements: { params: unknown[] }[] }) => String(tx.statements[0]?.params[1])
  driver
    .on(/from ptw\.idempotency_begin\(/, ([key, operation, hash], _st, tx) => {
      const id = `${person(tx)}:${String(key)}`
      const done = keys.get(id)
      if (done) {
        return done.operation === operation && done.hash === hash
          ? [{ situacao: "repetida", status: done.status, response: done.response }]
          : [{ situacao: "diferente", status: null, response: null }]
      }
      const mine = pending.get(tx) ?? new Map<string, { operation: unknown; hash: unknown }>()
      pending.set(tx, mine)
      mine.set(id, { operation, hash })
      return [{ situacao: "nova", status: null, response: null }]
    })
    .on(/select ptw\.idempotency_finish\(/, ([key, status, response], _st, tx) => {
      const id = `${person(tx)}:${String(key)}`
      const reserved = pending.get(tx)?.get(id)
      if (!reserved) throw Object.assign(new Error("Idempotência: chave não reservada nesta sessão"), { code: "PTW14" })
      tx.onCommit.push(() => keys.set(id, { ...reserved, status, response: JSON.parse(String(response)) }))
      return []
    })
  return { people }
}

export interface TestApp {
  app: FastifyInstance
  driver: FakeDriver
  people: Map<string, FakePerson>
  /** Entra (entrada de desenvolvimento) e devolve os cabeçalhos de uma escrita autenticada. */
  login(login?: string): Promise<{ cookie: string; csrf: string; headers: Record<string, string>; response: LightMyRequestResponse }>
}

export async function makeApp(opts: { config?: Partial<Config>; routes?: RouteModule[]; build?: Partial<BuildOptions>; driver?: FakeDriver } = {}): Promise<TestApp> {
  const driver = opts.driver ?? new FakeDriver()
  const { people } = seedFake(driver)
  const app = await buildApp({
    config: testConfig(opts.config),
    driver: driver as Driver,
    autoload: false,
    routes: [...BASE_ROUTES, ...(opts.routes ?? [])],
    sessions: new MemorySessionStore(),
    storageProbe: async () => ({ ok: true, latencyMs: 1 }),
    logger: false,
    ...opts.build,
  })
  await app.ready()
  return {
    app,
    driver,
    people,
    login: async (login = "ana") => {
      const response = await app.inject({ method: "POST", url: "/api/v1/session/dev-login", headers: { host: HOST, origin: ORIGIN }, payload: { login } })
      if (response.statusCode !== 200) throw new Error(`entrada falhou: ${response.statusCode} ${response.body}`)
      const cookie = cookiePair(response)
      const csrf = (response.json() as { csrfToken: string }).csrfToken
      return { cookie, csrf, response, headers: { host: HOST, origin: ORIGIN, cookie, "x-ptw-csrf": csrf } }
    },
  }
}

/** `ptw_session=<valor>` do `Set-Cookie` de uma resposta. */
export function cookiePair(res: LightMyRequestResponse): string {
  const raw = res.headers["set-cookie"]
  const line = Array.isArray(raw) ? raw[0] : raw
  if (typeof line !== "string") throw new Error("resposta sem Set-Cookie")
  return line.split(";")[0]!
}

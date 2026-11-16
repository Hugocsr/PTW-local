/**
 * Base da API (pacote F1-01): contexto, erros e negações, If-Match, idempotência, sessão e sistema.
 *
 * Duas partes:
 *  - SEM BANCO (rodam sempre, `npm test`): um driver falso mostra o que a API manda ao banco.
 *  - COM BANCO (só com PTW_TEST_DB=1, pelo `api/compose.test.yaml`): provam o que só o PostgreSQL
 *    decide — a trilha gravada, o RLS, o `NOTIFY`. Estão no fim, em "com banco".
 */
import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { buildApp, type RouteModule } from "../src/app.js"
import { errorMapCodes, loadContract } from "../src/contract/openapi.js"
import { defaultOpenapiPath } from "../src/config.js"
import { postgresDriver, withCtx } from "../src/db.js"
import { pta } from "../src/errors/apiError.js"
import { statusOfDbCode } from "../src/errors/dbError.js"
import { idempotent } from "../src/http/idempotency.js"
import { requireIfMatch, setEtag, staleOrMissing } from "../src/http/ifMatch.js"
import { recordStarted, recordStopped, tick } from "../src/routes/system.js"
import { loadPerson } from "../src/session/person.js"
import { DbSessionStore, MemorySessionStore } from "../src/session/store.js"
import { ANA, BASE_ROUTES, BIA, HOST, ORIGIN, PERMIT, UNIT, cookiePair, makeApp, testConfig, type TestApp } from "./helpers/app.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { HAS_DB, T_ANA, T_UNIT, T_UNIT_CODE, createTestDb, type TestDb } from "./helpers/realDb.js"

const V1 = "/api/v1"
const SET_CONTEXT = /^select ptw\.set_context\(/

/** Rotas de teste sobre operações reais do contrato, para exercitar o que é transversal. */
const probe: RouteModule = (api) => {
  // Parar: aceita Idempotency-Key, sem If-Match. O "banco" decide pela frase do motivo.
  api.op("stopPermit", (req, reply) =>
    idempotent(req, reply, async (tx) => {
      await tx`select test_act(${req.params.id}::uuid, ${req.body.reason}::text)`
      return { parada: req.body.reason, rowVersion: 4 }
    }, { reason: req.body.reason, etag: (b) => b.rowVersion }) as never)
  // Devolver: exige If-Match (concorrência otimista sobre row_version).
  api.op("returnPermit", async (req, reply) => {
    const rev = requireIfMatch(req)
    const rows = await withCtx(req, async (tx) => {
      const done = await tx<{ row_version: number }[]>`update ptw.permit set state = 'devolvida' where id = ${req.params.id}::uuid and row_version = ${rev} returning row_version`
      if (done.length > 0) return done
      const cur = await tx<{ row_version: number }[]>`select row_version from ptw.permit where id = ${req.params.id}::uuid`
      return staleOrMissing(cur[0]?.row_version)
    })
    setEtag(reply, rows[0]!.row_version)
    return {} as never
  })
  // Uma rota errada de propósito: guarda a transação e consulta depois que withCtx terminou.
  api.op("getUnit", async (req) => {
    const leaked = await withCtx(req, async (tx) => tx)
    await leaked`select id from ptw.unit`
    return {} as never
  })
  // Resposta fora do contrato.
  api.op("listTypes", () => ({ total: "muitos" }) as never)
}

let t: TestApp
const open: TestApp[] = []
async function start(opts: Parameters<typeof makeApp>[0] = {}): Promise<TestApp> {
  const made = await makeApp(opts)
  open.push(made)
  return made
}
afterEach(async () => {
  for (const x of open.splice(0)) await x.app.close()
})

const denials = (d: FakeDriver) => d.find(/select ptw\.audit_denied\(/)
const act = (d: FakeDriver) => d.find(/select test_act\(/)
const stop = (h: Record<string, string>, reason: string, extra: Record<string, string> = {}) =>
  t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}/stop`, headers: { ...h, ...extra }, payload: { reason } })

describe("contexto: toda transação começa por set_context", () => {
  it("vale para sessão, leitura, escrita, negação e sistema", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    await t.app.inject({ url: `${V1}/session`, headers: s.headers })
    await t.app.inject({ url: `${V1}/status`, headers: s.headers })
    await stop(s.headers, "ok")
    t.driver.fail(/select test_act\(/, { code: "PTW25", message: "A PT não está em campo" })
    await stop(s.headers, "recusa")
    await t.app.inject({ url: `${V1}/session` }) // 401
    await recordStarted(t.app.ptw)
    await tick(t.app.ptw, { driftRecordedAt: null })
    await t.app.inject({ method: "POST", url: `${V1}/session/logout`, headers: s.headers })

    expect(t.driver.transactions.length).toBeGreaterThan(10)
    for (const [i, tx] of t.driver.transactions.entries()) {
      expect(tx.statements[0]?.text, `transação ${i}`).toMatch(SET_CONTEXT)
      expect(tx.statements[0]?.params[0], `unidade da transação ${i}`).toBe(UNIT)
    }
  })

  it("leva pessoa, autenticação, aparelho, id da requisição, motivo e desfazer", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.reset()
    const res = await stop(s.headers, "Vazamento na linha", { "x-request-id": "req-77", "x-ptw-client": "tablet-07", "x-ptw-undo": "true" })
    expect(res.statusCode).toBe(200)
    expect(res.headers["x-request-id"]).toBe("req-77")
    const tx = act(t.driver)[0]!.tx
    expect(t.driver.contextOf(tx)).toEqual({ unit: UNIT, person: ANA, role: null, auth: "sessao", client: "tablet-07", request: "req-77", reason: "Vazamento na linha", undo: true })
  })

  it("sem X-Request-Id a API gera um e devolve", async () => {
    t = await start()
    const res = await t.app.inject({ url: `${V1}/health` })
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("uma rota que consulta fora de withCtx falha", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/unit`, headers: s.headers })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toMatchObject({ code: "PTA99" })
  })

  it("nenhum arquivo de rota abre conexão própria com o banco", () => {
    const dir = join(import.meta.dirname, "..", "src", "routes")
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.ts$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8")
      expect(src, f).not.toMatch(/from\s+["']postgres["']|postgresDriver|\.driver\b|\.begin\(/)
    }
  })
})

describe("erros: o mapa do contrato", () => {
  const contract = loadContract(defaultOpenapiPath())
  const map = errorMapCodes(contract)

  it("cada código do banco citado no x-ptw-error-map dá o status do mapa", () => {
    let n = 0
    for (const [status, codes] of map) {
      for (const code of codes) {
        if (code.startsWith("PTA")) continue
        // PTW12 aparece duas vezes no contrato (repete; depois 500): vale o 500.
        expect(statusOfDbCode(code), code).toBe(status)
        n++
      }
    }
    expect(n).toBeGreaterThanOrEqual(40)
    expect(statusOfDbCode("22P02")).toBe(400)
    expect(statusOfDbCode("08006")).toBe(503)
    expect(statusOfDbCode("53300")).toBe(503)
    expect(statusOfDbCode("57P01")).toBe(503)
    expect(statusOfDbCode("XX000")).toBeNull()
  })

  it("cada PTAnn da API tem o status do mapa", () => {
    const mine = [
      pta.unavailable(), pta.unauthorized(), pta.forbidden(), pta.notFound(), pta.badRequest("x"), pta.staleRevision(1), pta.ifMatchRequired(),
      pta.idempotencyMismatch(), pta.blobMismatch(), pta.importStale(), pta.tooLarge(), pta.tooMany(), pta.notImplemented(), pta.unexpected(),
    ]
    const inMap = new Map<string, number>()
    for (const [status, codes] of map) for (const c of codes) if (c.startsWith("PTA")) inMap.set(c, status)
    expect([...inMap.keys()].sort()).toEqual(mine.map((e) => e.code).sort())
    for (const e of mine) expect(e.status, e.code).toBe(inMap.get(e.code))
  })
})

describe("erros: recusa do banco → status + negação na trilha", () => {
  it("PTWnn simulado: 422 com a frase do banco, transação desfeita e audit_denied em outra transação", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.on(/select 1 from ptw\.permit/, [{ ok: 1 }])
    t.driver.fail(/select test_act\(/, { code: "PTW25", message: "A PT não está em campo", detail: "estado: rascunho", hint: "Envie a PT antes" })
    t.driver.reset()
    const res = await stop(s.headers, "parar", { "x-request-id": "req-neg" })

    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ code: "PTW25", message: "A PT não está em campo", detail: "estado: rascunho · Envie a PT antes" })
    const tried = act(t.driver)[0]!
    expect(t.driver.transactions[tried.tx]!.outcome).toBe("rollback")
    const d = denials(t.driver)
    expect(d).toHaveLength(1)
    expect(d[0]!.tx).toBeGreaterThan(tried.tx)
    expect(t.driver.transactions[d[0]!.tx]!.outcome).toBe("commit")
    expect(d[0]!.statement.params.slice(0, 4)).toEqual(["pt.parada", "PTW25", "A PT não está em campo", PERMIT])
    expect(JSON.parse(String(d[0]!.statement.params[4]))).toMatchObject({ operacao: "stopPermit", status: 422 })
    expect(t.driver.contextOf(d[0]!.tx)).toMatchObject({ unit: UNIT, person: ANA, auth: "sessao", request: "req-neg", undo: false })
  })

  it("PT que não existe na unidade: a negação é gravada sem PT", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.fail(/select test_act\(/, { code: "PTW24", message: "Sem login ativo" })
    await stop(s.headers, "parar")
    expect(denials(t.driver)[0]!.statement.params[3]).toBeNull()
  })

  it.each([
    ["PTW10", 409, true],
    ["23505", 409, true],
    ["23503", 409, true],
    ["23514", 422, true],
    ["42501", 403, true],
    ["PTW14", 500, false],
    ["PTW13", 500, false],
    ["22P02", 400, false],
    ["57014", 504, false],
    ["XX000", 500, false],
  ])("%s → %i (negação na trilha: %s)", async (code, status, audited) => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.fail(/select test_act\(/, { code, message: "frase do banco", detail: PERMIT })
    const res = await stop(s.headers, "parar")
    expect(res.statusCode).toBe(status)
    const body = res.json() as { code: string; message: string; detail?: string }
    expect(body.code).toBe(code === "XX000" ? "PTA99" : code)
    expect(body.code).toMatch(/^[A-Z0-9]{5}$/)
    if (code === "PTW10") expect(body.detail).toBe(PERMIT)
    expect(denials(t.driver)).toHaveLength(audited ? 1 : 0)
  })

  it("banco fora do ar → 503 PTA01 com Retry-After, sem negação", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.down = true
    const res = await stop(s.headers, "parar")
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ code: "PTA01" })
    expect(res.headers["retry-after"]).toBeDefined()
    t.driver.down = false
  })

  it("corrida (40001) e hora fora de ordem (PTW12) repetem a transação até 2 vezes", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.fail(/select test_act\(/, { code: "40001", message: "could not serialize" }, 2)
    expect((await stop(s.headers, "a")).statusCode).toBe(200)
    expect(act(t.driver)).toHaveLength(3)

    t.driver.reset()
    t.driver.fail(/select test_act\(/, { code: "PTW12", message: "Hora do evento fora de ordem" })
    const res = await stop(s.headers, "b")
    expect(res.statusCode).toBe(500)
    expect(res.json()).toMatchObject({ code: "PTW12" })
    expect(act(t.driver)).toHaveLength(3)

    t.driver.reset()
    t.driver.fail(/select test_act\(/, { code: "40P01", message: "deadlock detected" })
    const dead = await stop(s.headers, "c")
    expect(dead.statusCode).toBe(503)
    expect(dead.headers["retry-after"]).toBeDefined()
  })

  it("401 sem sessão grava a negação (PTA02), sem pessoa", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const res = await t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}/stop`, headers: { host: HOST, origin: ORIGIN }, payload: { reason: "x" } })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: "PTA02" })
    const d = denials(t.driver)
    expect(d).toHaveLength(1)
    expect(d[0]!.statement.params.slice(0, 2)).toEqual(["pt.parada", "PTA02"])
    expect(t.driver.contextOf(d[0]!.tx)).toMatchObject({ unit: UNIT, person: null })
    expect(act(t.driver)).toHaveLength(0)
  })

  it("GET /session sem cookie é a abertura do app: 401 sem negação; com cookie inválido, grava", async () => {
    t = await start()
    expect((await t.app.inject({ url: `${V1}/session` })).statusCode).toBe(401)
    expect(denials(t.driver)).toHaveLength(0)
    const res = await t.app.inject({ url: `${V1}/session`, headers: { cookie: `ptw_session=${"A".repeat(43)}` } })
    expect(res.statusCode).toBe(401)
    expect(denials(t.driver)).toHaveLength(1)
  })

  it("403: escrita sem X-Ptw-Csrf, com o token errado, sem Origin ou de outro endereço grava a negação (PTA03)", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const bad: Record<string, string>[] = [
      { host: HOST, origin: ORIGIN, cookie: s.cookie },
      { host: HOST, origin: ORIGIN, cookie: s.cookie, "x-ptw-csrf": "errado" },
      { host: HOST, cookie: s.cookie, "x-ptw-csrf": s.csrf },
      { host: HOST, origin: "https://outro.exemplo", cookie: s.cookie, "x-ptw-csrf": s.csrf },
    ]
    for (const [i, headers] of bad.entries()) {
      const res = await stop(headers, "x")
      expect(res.statusCode, `caso ${i}`).toBe(403)
      expect(res.json()).toMatchObject({ code: "PTA03" })
      expect(denials(t.driver), `caso ${i}`).toHaveLength(i + 1)
    }
    expect(t.driver.contextOf(denials(t.driver)[0]!.tx)).toMatchObject({ person: ANA })
    expect(act(t.driver)).toHaveLength(0)
    // Leitura não exige CSRF nem Origin.
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(200)
  })
})

describe("requisição fora do contrato", () => {
  it("corpo inválido → 400 PTA05 com o campo; nada vai ao banco além da sessão", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    for (const payload of [{}, { reason: "" }, { reason: "x", outro: 1 }, { reason: "x".repeat(501) }]) {
      const res = await t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}/stop`, headers: s.headers, payload })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ code: "PTA05" })
      expect((res.json() as { detail: string }).detail).toMatch(/^body/)
    }
    const semCorpo = await t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}/stop`, headers: s.headers })
    expect(semCorpo.statusCode).toBe(400)
    expect(act(t.driver)).toHaveLength(0)
    expect(denials(t.driver)).toHaveLength(0)
  })

  it("JSON quebrado, X-Request-Id e Idempotency-Key fora do formato → 400 PTA05", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const broken = await t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}/stop`, headers: { ...s.headers, "content-type": "application/json" }, payload: "{reason" })
    expect(broken.statusCode).toBe(400)
    expect(broken.json()).toMatchObject({ code: "PTA05" })
    const id = await t.app.inject({ url: `${V1}/health`, headers: { "x-request-id": "tem espaço" } })
    expect(id.statusCode).toBe(400)
    expect((await stop(s.headers, "x", { "idempotency-key": "não-é-uuid" })).statusCode).toBe(400)
  })

  it("endereço que não existe → 404 PTA04 no formato único", async () => {
    t = await start()
    const res = await t.app.inject({ url: `${V1}/nao-existe` })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: "PTA04" })
    expect(res.headers["x-request-id"]).toBeDefined()
  })

  it("resposta 2xx fora do esquema do contrato é erro da API (500 PTA99)", async () => {
    t = await start({ routes: [probe] })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/types`, headers: s.headers })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toMatchObject({ code: "PTA99" })
    expect((res.json() as { detail: string }).detail).toMatch(/^response/)
  })
})

describe("If-Match (concorrência otimista)", () => {
  const url = `${V1}/permits/${PERMIT}/return`

  it("ausente → 428 PTA07, antes de qualquer escrita", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const res = await t.app.inject({ method: "POST", url, headers: s.headers, payload: { reason: "falta APR" } })
    expect(res.statusCode).toBe(428)
    expect(res.json()).toMatchObject({ code: "PTA07" })
    expect(t.driver.find(/update ptw\.permit/)).toHaveLength(0)
  })

  it("antigo → 409 PTA06 com a revisão atual em detail; certo → 200 com ETag novo; fora do formato → 400", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.on(/update ptw\.permit/, ([, rev]) => (rev === 7 ? [{ row_version: 8 }] : []))
    t.driver.on(/select row_version from ptw\.permit/, [{ row_version: 7 }])

    const stale = await t.app.inject({ method: "POST", url, headers: { ...s.headers, "if-match": '"5"' }, payload: { reason: "falta APR" } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual({ code: "PTA06", message: expect.any(String), detail: "7" })
    expect(denials(t.driver)).toHaveLength(0)

    const ok = await t.app.inject({ method: "POST", url, headers: { ...s.headers, "if-match": '"7"' }, payload: { reason: "falta APR" } })
    expect(ok.statusCode).toBe(200)
    expect(ok.headers.etag).toBe('"8"')

    const bad = await t.app.inject({ method: "POST", url, headers: { ...s.headers, "if-match": "7" }, payload: { reason: "falta APR" } })
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toMatchObject({ code: "PTA05" })
  })

  it("registro que não existe → 404 PTA04", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const res = await t.app.inject({ method: "POST", url, headers: { ...s.headers, "if-match": '"1"' }, payload: { reason: "x" } })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: "PTA04" })
  })
})

describe("Idempotency-Key", () => {
  const KEY = "018f3b2a-7c11-7000-8000-00000000aaaa"

  it("a mesma chave com o mesmo corpo não repete a escrita e devolve a resposta original", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    const first = await stop(s.headers, "Vazamento", { "idempotency-key": KEY })
    const again = await stop(s.headers, "Vazamento", { "idempotency-key": KEY })
    expect(first.statusCode).toBe(200)
    expect(first.headers["idempotency-replayed"]).toBeUndefined()
    expect(again.statusCode).toBe(200)
    expect(again.headers["idempotency-replayed"]).toBe("true")
    expect(again.json()).toEqual(first.json())
    expect(again.headers.etag).toBe('"4"')
    expect(first.headers.etag).toBe('"4"')
    expect(act(t.driver)).toHaveLength(1)
    // A chave é reservada na transação da escrita, e a resposta entra antes do commit.
    const begin = t.driver.find(/from ptw\.idempotency_begin\(/)[0]!
    expect(begin.tx).toBe(act(t.driver)[0]!.tx)
    expect(begin.statement.params.slice(0, 2)).toEqual([KEY, "stopPermit"])
    expect(t.driver.find(/select ptw\.idempotency_finish\(/)[0]!.tx).toBe(begin.tx)
  })

  it("sem Idempotency-Key a escrita é uma transação comum", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    expect((await stop(s.headers, "Vazamento")).statusCode).toBe(200)
    expect((await stop(s.headers, "Vazamento")).statusCode).toBe(200)
    expect(act(t.driver)).toHaveLength(2)
    expect(t.driver.find(/idempotency_/)).toHaveLength(0)
  })

  it("a mesma chave com outro corpo → 422 PTA08, sem escrita", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    await stop(s.headers, "Vazamento", { "idempotency-key": KEY })
    const res = await stop(s.headers, "Outro motivo", { "idempotency-key": KEY })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTA08" })
    expect(act(t.driver)).toHaveLength(1)
  })

  it("escrita recusada solta a chave: a nova tentativa executa", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    const s = await t.login()
    t.driver.fail(/select test_act\(/, { code: "PTW25", message: "A PT não está em campo" }, 1)
    expect((await stop(s.headers, "Vazamento", { "idempotency-key": KEY })).statusCode).toBe(422)
    const again = await stop(s.headers, "Vazamento", { "idempotency-key": KEY })
    expect(again.statusCode).toBe(200)
    expect(again.headers["idempotency-replayed"]).toBeUndefined()
    expect(act(t.driver)).toHaveLength(2)
  })

  it("a chave é de quem a usou: outra pessoa com a mesma chave executa", async () => {
    t = await start({ routes: [probe], config: { checkResponses: false } })
    t.people.get(BIA)!.enabled = true
    const a = await t.login("ana")
    const b = await t.login("bia")
    await stop(a.headers, "Vazamento", { "idempotency-key": KEY })
    const res = await stop(b.headers, "Vazamento", { "idempotency-key": KEY })
    expect(res.headers["idempotency-replayed"]).toBeUndefined()
    expect(act(t.driver)).toHaveLength(2)
  })
})

describe("sessão", () => {
  it("entrada de desenvolvimento: cookie com os atributos de A9, corpo no contrato, sessao.entrada na trilha", async () => {
    t = await start()
    const s = await t.login()
    const raw = String(s.response.headers["set-cookie"])
    expect(raw).toMatch(/^ptw_session=[A-Za-z0-9_-]{43};/)
    const attrs = raw.split(";").map((x) => x.trim())
    expect(attrs).toEqual(expect.arrayContaining(["Path=/api", "HttpOnly", "Secure", "SameSite=Strict", "Max-Age=43200"]))
    // O servidor guarda só o SHA-256 do valor.
    const value = s.cookie.split("=")[1]!
    const stored = [...(t.app.ptw.sessions as MemorySessionStore).sessions.keys()]
    expect(stored).toEqual([createHash("sha256").update(value).digest("hex")])
    expect(JSON.stringify(t.driver.transactions)).not.toContain(value)

    const body = s.response.json() as { person: { id: string }; grants: string[]; auth: string; devLogin: boolean; csrfToken: string }
    expect(body.person.id).toBe(ANA)
    expect(body.auth).toBe("sessao")
    expect(body.devLogin).toBe(true)
    // D1: nesta fase toda pessoa com sessão pode tudo.
    expect(body.grants).toEqual(["cadastro", "modelos", "auditoria", "exportacao"])
    expect(s.response.headers["cache-control"]).toBe("no-store")

    const log = t.driver.find(/select ptw\.audit_log\('sessao\.entrada', true/)
    expect(log).toHaveLength(1)
    expect(t.driver.contextOf(log[0]!.tx)).toMatchObject({ unit: UNIT, person: ANA, auth: "sessao" })
  })

  it("sem PTW_DEV_LOGIN a entrada de desenvolvimento responde 404, com qualquer corpo", async () => {
    t = await start({ config: { devLogin: false } })
    for (const payload of [{ login: "ana" }, {}, { qualquer: 1 }]) {
      const res = await t.app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: { host: HOST, origin: ORIGIN }, payload })
      expect(res.statusCode).toBe(404)
      expect(res.json()).toMatchObject({ code: "PTA04" })
      expect(res.headers["set-cookie"]).toBeUndefined()
    }
    expect(t.driver.transactions).toHaveLength(0)
  })

  it("login da empresa sem configuração: 503, sem fallback", async () => {
    t = await start()
    const res = await t.app.inject({ method: "POST", url: `${V1}/session/login`, headers: { host: HOST, origin: ORIGIN }, payload: { login: "ana", password: "x" } })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ code: "PTA01" })
    expect(res.headers["set-cookie"]).toBeUndefined()
  })

  it("login desconhecido ou conta desativada: 401, sem cookie, sessao.entrada com falha (e não uma negação a mais)", async () => {
    t = await start()
    for (const login of ["ninguem", "bia"]) {
      const res = await t.app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: { host: HOST, origin: ORIGIN }, payload: { login } })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toMatchObject({ code: "PTA02" })
      expect(res.headers["set-cookie"]).toBeUndefined()
    }
    const failed = t.driver.find(/select ptw\.audit_log\('sessao\.entrada', false/)
    expect(failed).toHaveLength(2)
    expect(failed[1]!.statement.params[2]).toBe(BIA)
    expect(t.driver.transactions[failed[0]!.tx]!.outcome).toBe("commit")
    expect(denials(t.driver)).toHaveLength(0)
  })

  it("entrada vinda de outro endereço é recusada", async () => {
    t = await start()
    const res = await t.app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: { host: HOST, origin: "https://outro.exemplo" }, payload: { login: "ana" } })
    expect(res.statusCode).toBe(403)
    expect(res.headers["set-cookie"]).toBeUndefined()
  })

  it("GET /session: quem está, com o mesmo token de CSRF e a hora do servidor", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { csrfToken: string; now: string; expiresAt: string; unit: { code: string } }
    expect(body.csrfToken).toBe(s.csrf)
    expect(body.unit.code).toBe("UN-01")
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.parse(body.now))
  })

  it("sair: 204, cookie apagado, sessao.saida na trilha, e a sessão não vale mais", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ method: "POST", url: `${V1}/session/logout`, headers: s.headers })
    expect(res.statusCode).toBe(204)
    expect(String(res.headers["set-cookie"])).toMatch(/^ptw_session=; .*Max-Age=0/)
    const out = t.driver.find(/select ptw\.audit_log\('sessao\.saida', true/)
    expect(out).toHaveLength(1)
    expect(t.driver.contextOf(out[0]!.tx)).toMatchObject({ person: ANA })
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(401)
  })

  it("trocar de pessoa: a sessão anterior sai (sessao.saida) e deixa de valer", async () => {
    t = await start()
    t.people.get(BIA)!.enabled = true
    const a = await t.login("ana")
    const res = await t.app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: { host: HOST, origin: ORIGIN, cookie: a.cookie }, payload: { login: "bia" } })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { person: { id: string } }).person.id).toBe(BIA)
    const out = t.driver.find(/select ptw\.audit_log\('sessao\.saida', true/)
    expect(out).toHaveLength(1)
    expect(t.driver.contextOf(out[0]!.tx)).toMatchObject({ person: ANA })
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: a.cookie } })).statusCode).toBe(401)
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: cookiePair(res) } })).statusCode).toBe(200)
  })

  it("conta desativada no meio da sessão: 401 na requisição seguinte e a sessão cai", async () => {
    t = await start()
    const s = await t.login()
    t.people.get(ANA)!.enabled = false
    const res = await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ code: "PTA02" })
    t.people.get(ANA)!.enabled = true
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(401)
  })

  it("no banco (ptw.api_session): guarda só o SHA-256, cria junto com a entrada e encerra junto com a saída", async () => {
    const driver = new FakeDriver()
    const rows = new Map<string, Record<string, unknown>>()
    driver
      .on(/insert into ptw\.api_session/, ([hash, person, auth, client, expires, grants]) => {
        rows.set(String(hash), { hash, unit_id: UNIT, person_id: person, auth, grants, client, created_at: new Date(), seen_at: new Date(), expires_at: expires, ended_at: null })
        return []
      })
      .on(/from ptw\.api_session where/, ([hash]) => (rows.has(String(hash)) ? [rows.get(String(hash))!] : []))
      .on(/update ptw\.api_session set ended_at/, ([hash]) => {
        const r = rows.get(String(hash))
        if (!r || r.ended_at) return []
        r.ended_at = new Date()
        return [{ id: "x" }]
      })
    t = await start({ driver, build: { sessions: new DbSessionStore() } })
    const s = await t.login()
    const value = s.cookie.split("=")[1]!
    const hash = createHash("sha256").update(value).digest("hex")
    expect([...rows.keys()]).toEqual([hash])
    expect(JSON.stringify(driver.transactions)).not.toContain(value)
    const created = driver.find(/insert into ptw\.api_session/)[0]!
    expect(created.tx).toBe(driver.find(/audit_log\('sessao\.entrada', true/)[0]!.tx)

    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(200)
    expect((await t.app.inject({ method: "POST", url: `${V1}/session/logout`, headers: s.headers })).statusCode).toBe(204)
    const ended = driver.find(/update ptw\.api_session set ended_at/)[0]!
    expect(ended.tx).toBe(driver.find(/audit_log\('sessao\.saida', true/)[0]!.tx)
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(401)
  })

  it("sessão vencida: 401", async () => {
    const clock = { now: new Date("2026-11-10T08:00:00Z") }
    t = await start({ config: { sessionIdleMs: 24 * 3_600_000 }, build: { now: () => clock.now } })
    const s = await t.login()
    clock.now = new Date("2026-11-10T19:59:00Z")
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(200)
    clock.now = new Date("2026-11-10T20:00:00Z")
    expect((await t.app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })).statusCode).toBe(401)
  })
})

describe("sistema", () => {
  it("GET /health responde sem sessão e sem banco", async () => {
    t = await start()
    t.driver.down = true
    const res = await t.app.inject({ url: `${V1}/health` })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, now: expect.any(String), devLogin:true, passwordLogin:false })
    expect(t.driver.transactions).toHaveLength(0)
  })

  it("GET /status: banco, armazenamento, relógio, versão; exige sessão", async () => {
    t = await start()
    expect((await t.app.inject({ url: `${V1}/status` })).statusCode).toBe(401)
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/status`, headers: { cookie: s.cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ version: "teste", db: { ok: true }, storage: { ok: true }, clock: { ok: true }, devLogin: true, schema: { "00_base.sql": "a".repeat(64) } })
  })

  it("GET /status com o banco fora → 503 PTA01", async () => {
    t = await start()
    const s = await t.login()
    t.driver.down = true
    const res = await t.app.inject({ url: `${V1}/status`, headers: { cookie: s.cookie } })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ code: "PTA01" })
    t.driver.down = false
  })

  it("liga e desliga ficam na trilha como sistema (sem pessoa)", async () => {
    t = await start()
    await recordStarted(t.app.ptw)
    await recordStopped(t.app.ptw)
    const on = t.driver.find(/select ptw\.audit_system\('sistema\.servidor\.iniciado'/)
    const off = t.driver.find(/select ptw\.audit_system\('sistema\.servidor\.parado'/)
    expect(on).toHaveLength(1)
    expect(off).toHaveLength(1)
    expect(t.driver.contextOf(on[0]!.tx)).toMatchObject({ unit: UNIT, person: null, auth: "sistema" })
    expect(JSON.parse(String(on[0]!.statement.params[0]))).toMatchObject({ versao: "teste" })
  })

  it("com o serviço ligado: iniciado ao subir, parado ao fechar, e o banco é fechado por último", async () => {
    const driver = new FakeDriver()
    const made = await makeApp({ driver, config: { background: true } })
    await new Promise((r) => setTimeout(r, 20))
    expect(driver.find(/sistema\.servidor\.iniciado/)).toHaveLength(1)
    expect(driver.listening("ptw")).toBe(1)
    await made.app.close()
    expect(driver.find(/sistema\.servidor\.parado/)).toHaveLength(1)
    expect(driver.listening("ptw")).toBe(0)
    expect(driver.ended).toBe(true)
  })

  it("o minuto da API expira as PTs vencidas, como sistema", async () => {
    t = await start()
    t.driver.on(/select ptw\.expire_due\(/, [{ n: 3 }])
    const out = await tick(t.app.ptw, { driftRecordedAt: null })
    expect(out.expired).toBe(3)
    const call = t.driver.find(/select ptw\.expire_due\(/)[0]!
    expect(call.statement.params).toEqual([UNIT])
    expect(t.driver.contextOf(call.tx)).toMatchObject({ person: null, auth: "sistema" })
    expect(t.driver.find(/sistema\.relogio\.desvio/)).toHaveLength(0)
  })

  it("desvio de relógio acima do limite é gravado uma vez por hora enquanto durar", async () => {
    const clock = { now: new Date("2026-11-10T08:00:00Z") }
    t = await start({ build: { now: () => clock.now } })
    // O banco está 10 s atrás da API.
    t.driver.on(/select clock_timestamp\(\) as now/, () => [{ now: new Date(clock.now.getTime() - 10_000) }])
    const memo = { driftRecordedAt: null as number | null }
    const first = await tick(t.app.ptw, memo)
    expect(first.driftMs).toBeGreaterThan(9000)
    await tick(t.app.ptw, memo)
    expect(t.driver.find(/sistema\.relogio\.desvio/)).toHaveLength(1)
    clock.now = new Date(clock.now.getTime() + 3_600_000)
    await tick(t.app.ptw, memo)
    const drift = t.driver.find(/sistema\.relogio\.desvio/)
    expect(drift).toHaveLength(2)
    expect(JSON.parse(String(drift[0]!.statement.params[1]))).toMatchObject({ limite_ms: 2000 })

    const s = await t.login()
    const status = await t.app.inject({ url: `${V1}/status`, headers: { cookie: s.cookie } })
    expect(status.json()).toMatchObject({ clock: { ok: false } })
  })

  it("GET /events (SSE) repassa o NOTIFY ptw só da unidade da sessão", async () => {
    t = await start()
    const s = await t.login()
    expect((await t.app.inject({ url: `${V1}/events` })).statusCode).toBe(401)
    const address = await t.app.listen({ host: "127.0.0.1", port: 0 })
    const ac = new AbortController()
    const res = await fetch(`${address}${V1}/events`, { headers: { cookie: s.cookie, "last-event-id": "40" }, signal: ac.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ""
    const until = async (re: RegExp) => {
      while (!re.test(text)) {
        const { value, done } = await reader.read()
        if (done) throw new Error(`fluxo fechou antes de ${String(re)}: ${text}`)
        text += decoder.decode(value, { stream: true })
      }
    }
    // Reconexão: manda reler (PT nula).
    await until(/data: \{"seq":40,"permit":null\}\n\n/)
    for (let i = 0; i < 50 && t.driver.listening("ptw") === 0; i++) await new Promise((r) => setTimeout(r, 10))
    t.driver.notify("ptw", { unit: "00000000-0000-7000-8000-000000000002", permit: PERMIT, seq: 41 })
    t.driver.notify("ptw", { unit: UNIT, permit: PERMIT, seq: 42 })
    await until(/id: 42\nevent: ptw\ndata: \{"seq":42,"permit":"[0-9a-f-]{36}"\}\n\n/)
    expect(text).not.toContain('"seq":41')
    ac.abort()
    await reader.cancel().catch(() => {})
  })
})

// =====================================================================================================
// COM BANCO — só com PTW_TEST_DB=1:
//   docker compose -f compose.yaml -f api/compose.test.yaml run --rm --build api-test
// =====================================================================================================
describe.skipIf(!HAS_DB)("com banco (PostgreSQL de verdade, como ptw_api)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const H = { host: HOST, origin: ORIGIN }

  const rule: RouteModule = (api) => {
    // Uma escrita que o banco recusa (login repetido → 23505), para ver a negação de verdade.
    api.op("createPerson", (req, reply) =>
      idempotent(req, reply, async (tx) => {
        await tx`insert into ptw.person (unit_id, name, login) values (ptw.current_unit(), ${req.body.name}::text, ${req.body.login ?? null}::text)`
        return (await loadPerson(tx, { login: String(req.body.login) }))!
      }, { status: 201, etag: (p) => p.revision }) as never)
  }

  const events = (action: string) =>
    db.owner<{ action: string; ok: boolean; actor_id: string | null; auth: string; request_id: string | null; data: Record<string, unknown> }[]>`
      select action, ok, actor_id, auth, request_id, data from ptw.audit_event where action = ${action} order by seq`

  const enter = async () => {
    const res = await app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: H, payload: { login: "ana" } })
    expect(res.statusCode, res.body).toBe(200)
    const cookie = cookiePair(res)
    return { cookie, headers: { ...H, cookie, "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken } }
  }

  beforeAll(async () => {
    db = await createTestDb("base")
    app = await buildApp({
      config: testConfig({ unit: T_UNIT, db: db.config, checkResponses: true }),
      driver: postgresDriver(db.config),
      autoload: false,
      routes: [...BASE_ROUTES, rule],
      storageProbe: async () => ({ ok: true }),
      logger: false,
    })
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  it("entrada, GET /session no contrato e saída, com sessao.entrada e sessao.saida na trilha", async () => {
    const s = await enter()
    const me = await app.inject({ url: `${V1}/session`, headers: { cookie: s.cookie } })
    expect(me.statusCode, me.body).toBe(200)
    expect(me.json()).toMatchObject({ person: { id: T_ANA, login: "ana" }, unit: { id: T_UNIT, code: T_UNIT_CODE }, auth: "sessao" })
    expect((await app.inject({ method: "POST", url: `${V1}/session/logout`, headers: s.headers })).statusCode).toBe(204)
    const ins = await events("sessao.entrada")
    expect(ins.at(-1)).toMatchObject({ ok: true, actor_id: T_ANA, auth: "sessao" })
    expect((await events("sessao.saida")).at(-1)).toMatchObject({ ok: true, actor_id: T_ANA })
  })

  it("entrada recusada (conta desativada) fica na trilha com ok = false", async () => {
    const res = await app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: H, payload: { login: "bia" } })
    expect(res.statusCode).toBe(401)
    expect((await events("sessao.entrada")).some((e) => e.ok === false)).toBe(true)
  })

  it("recusa de regra do banco: status do mapa, nada gravado, e o evento negado na trilha", async () => {
    const s = await enter()
    const before = await db.owner<{ n: number }[]>`select count(*)::int as n from ptw.person`
    const dup = await app.inject({ method: "POST", url: `${V1}/people`, headers: { ...s.headers, "x-request-id": "req-dup" }, payload: { name: "Outra Ana", login: "ANA" } })
    expect(dup.statusCode, dup.body).toBe(409)
    expect(dup.json()).toMatchObject({ code: "23505" })
    const after = await db.owner<{ n: number }[]>`select count(*)::int as n from ptw.person`
    expect(after[0]!.n).toBe(before[0]!.n)
    const denied = await db.owner<{ ok: boolean; actor_id: string; data: { erro: string } }[]>`
      select ok, actor_id, data from ptw.audit_event where request_id = 'req-dup' and not ok`
    expect(denied).toHaveLength(1)
    expect(denied[0]).toMatchObject({ ok: false, actor_id: T_ANA, data: { erro: "23505" } })
  })

  it("Idempotency-Key no banco: duas chamadas ao mesmo tempo escrevem uma vez; a repetição devolve a mesma resposta", async () => {
    const s = await enter()
    const key = "018f3b2a-7c11-7000-8000-00000000bbbb"
    const call = () => app.inject({ method: "POST", url: `${V1}/people`, headers: { ...s.headers, "idempotency-key": key }, payload: { name: "Dora Reis", login: "dora" } })
    const [a, b] = await Promise.all([call(), call()])
    expect([a.statusCode, b.statusCode], a.body + b.body).toEqual([201, 201])
    expect([a.headers["idempotency-replayed"], b.headers["idempotency-replayed"]].filter(Boolean)).toEqual(["true"])
    const again = await call()
    expect(again.headers["idempotency-replayed"]).toBe("true")
    expect(again.json()).toEqual(a.json())
    const n = await db.owner<{ n: number }[]>`select count(*)::int as n from ptw.person where login = 'dora'`
    expect(n[0]!.n).toBe(1)
    const other = await app.inject({ method: "POST", url: `${V1}/people`, headers: { ...s.headers, "idempotency-key": key }, payload: { name: "Outra", login: "outra" } })
    expect(other.statusCode).toBe(422)
    expect(other.json()).toMatchObject({ code: "PTA08" })
  })

  it("401 sem sessão e 403 sem CSRF gravam a negação", async () => {
    const no = await app.inject({ method: "POST", url: `${V1}/people`, headers: { ...H, "x-request-id": "req-401" }, payload: { name: "X" } })
    expect(no.statusCode).toBe(401)
    const s = await enter()
    const csrf = await app.inject({ method: "POST", url: `${V1}/people`, headers: { ...H, cookie: s.cookie, "x-request-id": "req-403" }, payload: { name: "X" } })
    expect(csrf.statusCode).toBe(403)
    const rows = await db.owner<{ request_id: string; data: { erro: string }; actor_id: string | null }[]>`
      select request_id, data, actor_id from ptw.audit_event where request_id in ('req-401', 'req-403') and not ok order by seq`
    expect(rows.map((r) => [r.request_id, r.data.erro, r.actor_id])).toEqual([["req-401", "PTA02", null], ["req-403", "PTA03", T_ANA]])
  })

  it("GET /status lê o relógio e o registro do esquema", async () => {
    const s = await enter()
    const res = await app.inject({ url: `${V1}/status`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as { db: { ok: boolean }; schema: Record<string, string>; clock: { driftMs: number } }
    expect(body.db.ok).toBe(true)
    expect(Object.keys(body.schema)).toContain("00_base.sql")
    expect(Math.abs(body.clock.driftMs)).toBeLessThan(2000)
  })

  it("liga, minuto e desliga: sistema.servidor.iniciado/parado e sistema.relogio.desvio gravados", async () => {
    await recordStarted(app.ptw)
    const skewed = { ...app.ptw, now: () => new Date(Date.now() + 60_000) }
    const out = await tick(skewed, { driftRecordedAt: null })
    expect(out.expired).toBe(0)
    await recordStopped(app.ptw)
    for (const action of ["sistema.servidor.iniciado", "sistema.servidor.parado", "sistema.relogio.desvio"]) {
      const rows = await events(action)
      expect(rows.at(-1), action).toMatchObject({ ok: true, actor_id: null, auth: "sistema" })
    }
  })

  it("GET /events recebe o NOTIFY do banco quando a trilha ganha um evento", async () => {
    const s = await enter()
    const address = await app.listen({ host: "127.0.0.1", port: 0 })
    const ac = new AbortController()
    const res = await fetch(`${address}${V1}/events`, { headers: { cookie: s.cookie }, signal: ac.signal })
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    await new Promise((r) => setTimeout(r, 300))
    await recordStarted(app.ptw)
    let text = ""
    while (!/event: ptw\ndata: \{"seq":\d+,"permit":null\}/.test(text)) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    expect(text).toMatch(/event: ptw\ndata: \{"seq":\d+,"permit":null\}/)
    ac.abort()
    await reader.cancel().catch(() => {})
  })

  it("PTW_UNIT por código (UN-T1) resolve a unidade — depende de ptw.unit_by_code no banco", async () => {
    const other = await buildApp({
      config: testConfig({ unit: T_UNIT_CODE, db: db.config }),
      driver: postgresDriver(db.config),
      autoload: false,
      routes: BASE_ROUTES,
      storageProbe: async () => ({ ok: true }),
      logger: false,
    })
    try {
      expect(await other.ptw.unit()).toBe(T_UNIT)
    } finally {
      await other.close()
    }
  })
})

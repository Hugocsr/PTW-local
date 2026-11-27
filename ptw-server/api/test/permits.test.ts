/**
 * PT (pacote F1-05): Quadro, Minha área, a PT inteira, Histórico, respostas e os atos.
 *
 *  - SEM BANCO (sempre): um driver falso mostra o que a API manda ao banco — cada ato chama a SUA
 *    função (`permit_submit`, `permit_sign`, `permit_return`…), com a pessoa e o motivo no contexto;
 *    If-Match, Idempotency-Key, recusas no mapa e a negação em outra transação; cada abertura grava
 *    `acesso.pt.aberta`. As respostas passam pela conferência do contrato.
 *  - COM BANCO (só com PTW_TEST_DB=1): o ciclo inteiro rascunho → encerrada pela API, devolução e
 *    reenvio, descarte, prorrogação além do prazo (PTW31), trava de equipamento (PTW10 → 409),
 *    assinatura de quem não pode, repetição idempotente e o evento de acesso por abertura.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { buildApp, coverage } from "../src/app.js"
import { defaultOpenapiPath } from "../src/config.js"
import { loadContract } from "../src/contract/openapi.js"
import type { Schemas } from "../src/contract/types.js"
import { postgresDriver, type Tx } from "../src/db.js"
import permitRoutes from "../src/routes/permits/index.js"
import { ANA, BASE_ROUTES, HOST, ORIGIN, PERMIT, UNIT, cookiePair, makeApp, testConfig, type TestApp } from "./helpers/app.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { HAS_DB, T_ANA, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const V1 = "/api/v1"
const contract = loadContract(defaultOpenapiPath())
const PT_OPS = [...contract.operations.values()].filter((o) => o.tags.includes("pt")).map((o) => o.operationId).sort()

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
const TPL = id(0x701)
const VER = id(0x702)
const LOC = id(0x703)
const ASSET = id(0x704)
const SLOT = id(0x705)
const STAGE = id(0x706)
const ROLE = id(0x707)
const SIG = id(0x708)
const OTHER = id(0x709)
const NUMBER = "PT-UN01-2026-00012"
const AT = "2026-11-10T12:00:00.123456+00:00"

/** O driver falso com `tx.unsafe` (o que o `postgres` oferece): o texto vira a consulta marcada. */
class PermitDriver extends FakeDriver {
  override async begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return super.begin(async (tx) => {
      const tag = tx as unknown as (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>
      ;(tx as unknown as { unsafe: unknown }).unsafe = (text: string, params: unknown[] = []) => {
        const strings = text.split(/\$\d+/)
        const values = [...text.matchAll(/\$(\d+)/g)].map((m) => params[Number(m[1]) - 1])
        return tag(Object.assign(strings, { raw: strings }) as unknown as TemplateStringsArray, ...values)
      }
      return fn(tx)
    })
  }
}

const header = (over: Partial<Schemas["PermitHeader"]> = {}): Schemas["PermitHeader"] => ({
  id: PERMIT, number: NUMBER, templateId: TPL, versionId: VER, state: "em_analise", authorId: ANA, locationId: LOC, assetIds: [ASSET],
  team: { [ROLE]: [ANA] }, windowStart: AT, windowEnd: "2026-11-10T20:00:00+00:00", scope: "Troca da gaveta", snapshotSha256: "a".repeat(64),
  snapshotAt: AT, revision: 1, note: null, holdReason: null, holdBy: null, holdAt: null, resumedReason: null, resumedBy: null, resumedAt: null,
  createdAt: AT, updatedAt: AT, rowVersion: 4, ...over,
})

const detail = (over: Partial<Schemas["PermitHeader"]> = {}): Schemas["PermitDetail"] => ({
  permit: { ...header(over), answers: { obs: { t: "texto", v: "ok" } }, answerMeta: { obs: { answeredBy: ANA, answeredAt: AT } } },
  form: { sections: [{ id: "s1", title: "Pedido", items: [{ id: "obs", kind: "texto", label: "Observação" }] }] },
  signatures: [{ id: SIG, permitId: PERMIT, rev: 1, slotId: SLOT, personId: ANA, signedAt: AT, voidedAt: null, voidedReason: null }],
  revisions: [],
  extensions: [],
  attachments: [],
  blobs: {},
  assets: [{ id: ASSET, unitId: UNIT, revision: 1, updatedAt: AT, origin: "manual", status: "ativo", typeId: ROLE, code: "P-101", name: "Bomba", aliases: [], locationIds: [LOC] }],
  currentStageId: STAGE,
  blocker: null,
  released: false,
  now: AT,
})

/** O banco falso de uma PT: a leitura, a revisão e as funções dos atos. */
function seedPermit(d: FakeDriver, opts: { rowVersion?: number } = {}): void {
  d.on(/^select p\.id from ptw\.permit p where/, ([v]) => (v === PERMIT || v === NUMBER ? [{ id: PERMIT }] : []))
    .on(/as d from ptw\.permit p /, () => [{ d: detail({ rowVersion: opts.rowVersion ?? 4 }) }])
    .on(/^select row_version from ptw\.permit where unit_id = ptw\.current_unit\(\) and id = \$1::uuid for no key update$/, ([v]) => (v === PERMIT ? [{ row_version: opts.rowVersion ?? 4 }] : []))
    .on(/^select 1 from ptw\.permit where/, ([v]) => (v === PERMIT ? [{ "?column?": 1 }] : []))
    .on(/ptw\.audit_access\('acesso\.pt\.aberta'/, [{ seq: 10 }])
    .on(/from ptw\.sign_slot s cross join lateral unnest/, [{ role_id: ROLE }])
    .on(/select ptw\.permit_(sign|submit|return|discard|stop|resume|extend)\(/, [{ state: "emitida" }])
    .on(/select ptw\.permit_answer_put\(/, ([, , v]) => [{ value: JSON.parse(String(v)) }])
    .on(/^select value, answered_by, answered_at from ptw\.permit_answer/, [{ value: { t: "texto", v: "ok" }, answered_by: ANA, answered_at: new Date(AT) }])
}

let t: TestApp
const open: TestApp[] = []
async function start(seed: (d: FakeDriver) => void = seedPermit): Promise<TestApp> {
  const driver = new PermitDriver()
  const made = await makeApp({ driver, routes: [permitRoutes] })
  seed(driver)
  open.push(made)
  return made
}
afterEach(async () => {
  for (const x of open.splice(0)) await x.app.close()
})

const calls = (re: RegExp) => t.driver.find(re)
const post = (path: string, headers: Record<string, string>, payload?: unknown) =>
  t.app.inject({ method: "POST", url: `${V1}/permits/${PERMIT}${path}`, headers, ...(payload === undefined ? {} : { payload: payload as object }) })

describe("rotas da PT × contrato", () => {
  it(`as ${PT_OPS.length} operações da tag pt têm rota`, async () => {
    t = await start()
    const { withRoute } = coverage(t.app)
    expect(PT_OPS.filter((op) => !withRoute.includes(op))).toEqual([])
    expect(PT_OPS).toHaveLength(18)
  })
})

describe("abrir a PT", () => {
  it("GET /permits/{id}: a PT inteira no contrato, ETag = rowVersion, e um acesso.pt.aberta por abertura na mesma transação (D5)", async () => {
    t = await start()
    const s = await t.login()
    const a = await t.app.inject({ url: `${V1}/permits/${PERMIT}`, headers: { cookie: s.cookie } })
    expect(a.statusCode, a.body).toBe(200)
    expect(a.headers.etag).toBe('"4"')
    expect((a.json() as Schemas["PermitDetail"]).permit.number).toBe(NUMBER)
    const b = await t.app.inject({ url: `${V1}/permits/${NUMBER}`, headers: { cookie: s.cookie } })
    expect(b.statusCode, b.body).toBe(200)
    const opens = calls(/audit_access\('acesso\.pt\.aberta'/)
    expect(opens).toHaveLength(2)
    expect(opens.map((o) => o.statement.params[0])).toEqual([PERMIT, PERMIT])
    expect(opens[0]!.tx).toBe(calls(/as d from ptw\.permit p /)[0]!.tx)
  })

  it("PT que não existe → 404 PTA04, sem evento de acesso", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/permits/${OTHER}`, headers: { cookie: s.cookie } })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: "PTA04" })
    expect(calls(/audit_access/)).toHaveLength(0)
  })

  it("POST /permits/{id}/access → 204 e um evento por chamada", async () => {
    t = await start()
    const s = await t.login()
    expect((await post("/access", s.headers)).statusCode).toBe(204)
    expect((await post("/access", s.headers)).statusCode).toBe(204)
    expect(calls(/audit_access\('acesso\.pt\.aberta'/)).toHaveLength(2)
  })
})

describe("atos: cada um a sua função do banco, com a pessoa da sessão", () => {
  it("Assinar: permit_sign(unidade, pt, assinatura, rev, id) e o cargo da assinatura no contexto (A4)", async () => {
    t = await start()
    const s = await t.login()
    const res = await post("/signatures", s.headers, { id: SIG, slotId: SLOT, rev: 1 })
    expect(res.statusCode, res.body).toBe(200)
    const call = calls(/select ptw\.permit_sign\(/)
    expect(call).toHaveLength(1)
    expect(call[0]!.statement.params).toEqual([PERMIT, SLOT, 1, SIG])
    expect(call[0]!.statement.text).toContain("ptw.current_unit()")
    expect(t.driver.contextOf(call[0]!.tx)).toMatchObject({ unit: UNIT, person: ANA, role: ROLE })
  })

  it("Assinar não aceita outra pessoa no corpo (400 PTA05): a assinatura é sempre de quem está na sessão", async () => {
    t = await start()
    const s = await t.login()
    const res = await post("/signatures", s.headers, { slotId: SLOT, rev: 1, personId: OTHER })
    expect(res.statusCode).toBe(400)
    expect(calls(/permit_sign/)).toHaveLength(0)
  })

  it("Assinar com a mesma Idempotency-Key repete a resposta sem assinar de novo", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "idempotency-key": "018f3b2a-7c11-7000-8000-00000000cccc" }
    const a = await post("/signatures", h, { id: SIG, slotId: SLOT, rev: 1 })
    const b = await post("/signatures", h, { id: SIG, slotId: SLOT, rev: 1 })
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    expect(b.headers["idempotency-replayed"]).toBe("true")
    expect(b.json()).toEqual(a.json())
    expect(calls(/select ptw\.permit_sign\(/)).toHaveLength(1)
  })

  it("Enviar: If-Match obrigatório; confere a revisão e chama permit_submit (que assina a Solicitação)", async () => {
    t = await start()
    const s = await t.login()
    expect((await post("/submit", s.headers)).statusCode).toBe(428)
    const stale = await post("/submit", { ...s.headers, "if-match": '"3"' })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: "PTA06", detail: "4" })
    expect(calls(/permit_submit/)).toHaveLength(0)
    const ok = await post("/submit", { ...s.headers, "if-match": '"4"' })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(calls(/select ptw\.permit_submit\(/)[0]!.statement.params).toEqual([PERMIT])
    expect(calls(/select ptw\.permit_submit\(/)[0]!.statement.text).toMatch(/, true\) as number$/)
  })

  it("trava de equipamento (PTW10) → 409 com a PT que prende em detail; nada gravado; negação pt.estado em outra transação", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.fail(/select ptw\.permit_submit\(/, { code: "PTW10", message: "P-101 já tem a PT-UN01-2026-00001 aberta (Ativa) em P-101", detail: OTHER, hint: "equipamento_ocupado" })
    })
    const s = await t.login()
    const res = await post("/submit", { ...s.headers, "if-match": '"4"' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: "PTW10", detail: `${OTHER} · equipamento_ocupado` })
    const submitTx = calls(/select ptw\.permit_submit\(/)[0]!.tx
    expect(t.driver.transactions[submitTx]!.outcome).toBe("rollback")
    const denied = calls(/select ptw\.audit_denied\(/)
    expect(denied).toHaveLength(1)
    expect(denied[0]!.tx).not.toBe(submitTx)
    expect(denied[0]!.statement.params.slice(0, 2)).toEqual(["pt.estado", "PTW10"])
    expect(denied[0]!.statement.params[3]).toBe(PERMIT)
  })

  it("Devolver, Descartar e Retomar: If-Match, motivo do corpo no contexto e a função própria", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "if-match": '"4"' }
    for (const [path, fn] of [["/return", "permit_return"], ["/discard", "permit_discard"], ["/resume", "permit_resume"]] as const) {
      expect((await post(path, s.headers, { reason: "Falta o bloqueio" })).statusCode, path).toBe(428)
      const res = await post(path, h, { reason: "Falta o bloqueio" })
      expect(res.statusCode, `${path} ${res.body}`).toBe(200)
      const call = calls(new RegExp(`select ptw\\.${fn}\\(`))
      expect(call).toHaveLength(1)
      expect(call[0]!.statement.params).toEqual([PERMIT, "Falta o bloqueio"])
      expect(t.driver.contextOf(call[0]!.tx)).toMatchObject({ person: ANA, reason: "Falta o bloqueio", role: null })
    }
  })

  it("Descartar recusado (PTW17) grava a negação com a ação pt.estado", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.fail(/select ptw\.permit_discard\(/, { code: "PTW17", message: "Só o solicitante descarta o rascunho" })
    })
    const s = await t.login()
    const res = await post("/discard", { ...s.headers, "if-match": '"4"' }, { reason: "Não vai mais" })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW17" })
    expect(calls(/select ptw\.audit_denied\(/)[0]!.statement.params.slice(0, 2)).toEqual(["pt.estado", "PTW17"])
  })

  it("Parar: sem If-Match, com Idempotency-Key (repetida não para de novo), motivo no contexto", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "idempotency-key": "018f3b2a-7c11-7000-8000-00000000dddd" }
    const a = await post("/stop", h, { reason: "Vazamento de gás" })
    const b = await post("/stop", h, { reason: "Vazamento de gás" })
    expect([a.statusCode, b.statusCode], a.body).toEqual([200, 200])
    expect(b.headers["idempotency-replayed"]).toBe("true")
    const call = calls(/select ptw\.permit_stop\(/)
    expect(call).toHaveLength(1)
    expect(call[0]!.statement.params).toEqual([PERMIT, "Vazamento de gás"])
    expect(t.driver.contextOf(call[0]!.tx)).toMatchObject({ reason: "Vazamento de gás" })
  })

  it("Parar com o banco fora do ar → 503 PTA01 (o app guarda e reenvia com a mesma chave)", async () => {
    t = await start()
    const s = await t.login()
    t.driver.down = true
    const res = await post("/stop", s.headers, { reason: "Vazamento" })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toMatchObject({ code: "PTA01" })
  })

  it("Prorrogar: If-Match, permit_extend(novo fim, justificativa); prazo máximo (PTW31) → 422", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "if-match": '"4"' }
    const ok = await post("/extensions", h, { newEnd: "2026-11-10T22:00:00Z", reason: "Chuva atrasou" })
    expect(ok.statusCode, ok.body).toBe(200)
    expect(calls(/select ptw\.permit_extend\(/)[0]!.statement.params).toEqual([PERMIT, "2026-11-10T22:00:00Z", "Chuva atrasou"])
    t.driver.fail(/select ptw\.permit_extend\(/, { code: "PTW31", message: "A janela passa do prazo máximo deste modelo (até 12 horas)" })
    const far = await post("/extensions", h, { newEnd: "2026-11-11T12:00:00Z", reason: "Mais um dia" })
    expect(far.statusCode).toBe(422)
    expect(far.json()).toMatchObject({ code: "PTW31" })
    expect(calls(/select ptw\.audit_denied\(/).at(-1)!.statement.params[0]).toBe("pt.prorrogada")
  })

  it("Revalidar: If-Match, campos estruturados, idempotência e recusa auditada", async () => {
    t = await start()
    const s = await t.login()
    const body = { shiftStart: "2026-11-10T12:00:00Z", shiftEnd: "2026-11-10T23:00:00Z", newEnd: "2026-11-10T22:00:00Z", reason: "Avaliação local", conditionsUnchanged: true, teamUnchanged: true, assessmentConfirmed: true }
    expect((await post("/revalidations", s.headers, body)).statusCode).toBe(428)
    const h = { ...s.headers, "if-match": '"4"', "idempotency-key": "018f3b2a-7c11-7000-8000-00000000ddde" }
    expect((await post("/revalidations", h, body)).statusCode).toBe(200)
    expect((await post("/revalidations", h, body)).headers["idempotency-replayed"]).toBe("true")
    expect(calls(/select ptw\.permit_revalidate\(/)).toHaveLength(1)
    expect(calls(/select ptw\.permit_revalidate\(/)[0]!.statement.params).toEqual([PERMIT, body.shiftStart, body.shiftEnd, body.newEnd, body.reason, true, true, true])
    t.driver.fail(/select ptw\.permit_revalidate\(/, { code: "PTW34", message: "Equipe alterada" })
    const denied = await post("/revalidations", { ...s.headers, "if-match": '"4"' }, { ...body, teamUnchanged: false })
    expect(denied.statusCode).toBe(422)
    expect(denied.json()).toMatchObject({ code: "PTW34" })
    expect(calls(/select ptw\.audit_denied\(/).at(-1)!.statement.params[0]).toBe("pt.revalidada")
  })

  it("id fora do formato num ato → 404, sem chamar o banco", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ method: "POST", url: `${V1}/permits/${NUMBER}/stop`, headers: s.headers, payload: { reason: "x" } })
    expect(res.statusCode).toBe(404)
    expect(calls(/permit_stop/)).toHaveLength(0)
  })
})

describe("rascunho e respostas", () => {
  it("Criar: 201, o solicitante é a pessoa da sessão, ativos e equipe gravados na mesma transação", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/^insert into ptw\.permit \(/, [{ id: PERMIT }])
    })
    const s = await t.login()
    const res = await t.app.inject({
      method: "POST", url: `${V1}/permits`, headers: s.headers,
      payload: { templateId: TPL, locationId: LOC, windowStart: "2026-11-10T12:00:00Z", windowEnd: "2026-11-10T20:00:00Z", scope: "Troca", assetIds: [ASSET], team: { [ROLE]: [ANA] } },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.headers.etag).toBe('"4"')
    const ins = calls(/^insert into ptw\.permit \(/)[0]!
    expect(ins.statement.params).toContain(ANA)
    const tx = ins.tx
    expect(calls(/^insert into ptw\.permit_asset/)[0]!.tx).toBe(tx)
    expect(calls(/^insert into ptw\.permit_team/)[0]!.tx).toBe(tx)
  })

  it("Alterar: UPDATE … WHERE row_version = If-Match; sem linha → 409 PTA06 com a revisão atual", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/^update ptw\.permit set/, ([...p]) => (p.includes(4) ? [{ id: PERMIT }] : []))
      d.on(/^select row_version from ptw\.permit where unit_id = ptw\.current_unit\(\) and id = \$1::uuid$/, [{ row_version: 4 }])
    })
    const s = await t.login()
    const ok = await t.app.inject({ method: "PATCH", url: `${V1}/permits/${PERMIT}`, headers: { ...s.headers, "if-match": '"4"' }, payload: { scope: "Novo escopo" } })
    expect(ok.statusCode, ok.body).toBe(200)
    const stale = await t.app.inject({ method: "PATCH", url: `${V1}/permits/${PERMIT}`, headers: { ...s.headers, "if-match": '"2"' }, payload: { scope: "Novo escopo" } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: "PTA06", detail: "4" })
  })

  it("Responder: permit_answer_put (o banco junta as linhas da verificação) e devolve quem e quando", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ method: "PUT", url: `${V1}/permits/${PERMIT}/answers/obs`, headers: s.headers, payload: { t: "texto", v: "ok" } })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ itemId: "obs", value: { t: "texto", v: "ok" }, answeredBy: ANA, answeredAt: new Date(AT).toISOString() })
    expect(calls(/select ptw\.permit_answer_put\(/)[0]!.statement.params).toEqual([PERMIT, "obs", JSON.stringify({ t: "texto", v: "ok" })])
  })

  it("Resposta recusada pelo item (PTW15) → 422 e negação pt.resposta", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.fail(/select ptw\.permit_answer_put\(/, { code: "PTW15", message: "O item zz não existe no formulário da PT" })
    })
    const s = await t.login()
    const res = await t.app.inject({ method: "PUT", url: `${V1}/permits/${PERMIT}/answers/zz`, headers: s.headers, payload: { t: "texto", v: "x" } })
    expect(res.statusCode).toBe(422)
    expect(calls(/select ptw\.audit_denied\(/)[0]!.statement.params.slice(0, 2)).toEqual(["pt.resposta", "PTW15"])
  })

  it("Apagar a resposta → 204", async () => {
    t = await start()
    const s = await t.login()
    const res = await t.app.inject({ method: "DELETE", url: `${V1}/permits/${PERMIT}/answers/obs`, headers: s.headers })
    expect(res.statusCode).toBe(204)
    expect(calls(/^delete from ptw\.permit_answer/)[0]!.statement.params).toEqual([PERMIT, "obs"])
  })
})

describe("Quadro, totais, Minha área e Histórico", () => {
  const boardRow = (over: Record<string, unknown> = {}) => ({
    id: PERMIT, h: header(), state_label: "Em análise", released: false, author_name: "Ana Souza", location_name: "Área 1",
    location_path: LOC.replace(/-/g, ""), template_name: "Trabalho a quente", version_number: 3, asset_codes: ["P-101"], _total: "41", ...over,
  })

  it("GET /permits: filtros e página no SQL, rascunho de outra pessoa fora, quem move a seguir só para a página", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/from ptw\.v_permit_board b join ptw\.permit p/, [boardRow()])
      d.on(/from ptw\.permit_next_rows\(/, [{ permit_id: PERMIT, stage_id: STAGE, label: "Carla · Emissão", mine: true }])
    })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/permits?q=bomba&segment=campo&sort=-windowStart&page=2&pageSize=10`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as Schemas["PermitBoardPage"]
    expect(body).toMatchObject({ page: 2, pageSize: 10, total: 41 })
    expect(body.items[0]).toMatchObject({ next: "Carla · Emissão", mine: true, currentStageId: STAGE, locationPath: [LOC], assetCodes: ["P-101"] })
    const q = calls(/from ptw\.v_permit_board b join ptw\.permit p/)[0]!.statement
    expect(q.text).toMatch(/b\.number is not null or b\.author_id = \$\d+::uuid/)
    expect(q.text).toMatch(/order by b\.window_start desc nulls last/)
    expect(q.text).toMatch(/limit 10 offset 20$/)
    expect(q.params).toContain(ANA)
    expect(q.params).toContain("bomba")
    expect(q.params).toContain("{ativa,suspensa,entregue}")
    expect(calls(/from ptw\.permit_next_rows\(/)[0]!.statement.params).toEqual([UNIT, `{${PERMIT}}`, ANA])
  })

  it("GET /permits?answers=true: as respostas vêm na linha, sem registrar PT aberta", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/from ptw\.v_permit_board b join ptw\.permit p/, [{ ...boardRow(), answers: { i1: { t: "texto", v: "IT-CCM-01" } } }])
      d.on(/from ptw\.permit_next_rows\(/, [])
    })
    const s = await t.login()
    const plain = await t.app.inject({ url: `${V1}/permits`, headers: { cookie: s.cookie } })
    expect(plain.statusCode, plain.body).toBe(200)
    expect((plain.json() as Schemas["PermitBoardPage"]).items[0]).not.toHaveProperty("answers")
    const res = await t.app.inject({ url: `${V1}/permits?answers=true`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    expect((res.json() as Schemas["PermitBoardPage"]).items[0]!.answers).toEqual({ i1: { t: "texto", v: "IT-CCM-01" } })
    const board = calls(/from ptw\.v_permit_board b join ptw\.permit p/)
    expect(board[0]!.statement.text).not.toMatch(/from ptw\.permit_answer a/)
    expect(board[1]!.statement.text).toMatch(/from ptw\.permit_answer a/)
    expect(calls(/ptw\.audit_access\('acesso\.pt\.aberta'/)).toHaveLength(0)
  })

  it("segmento minhas: o conjunto de my_permits filtrado pela vez da pessoa", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/from ptw\.v_permit_board b join ptw\.permit p/, [])
    })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/permits?segment=minhas`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    expect(calls(/from ptw\.v_permit_board b join ptw\.permit p/)[0]!.statement.text).toMatch(/ptw\.my_permits\(/)
  })

  it("GET /permits/counts: por estado e por segmento", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/group by b\.state$/, [{ state: "ativa", n: "3", mine: "1" }, { state: "em_analise", n: "2", mine: "2" }, { state: "encerrada", n: "5", mine: "0" }])
    })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/permits/counts`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({
      total: 10, byState: { ativa: 3, em_analise: 2, encerrada: 5 },
      bySegment: { minhas: 3, andamento: 5, preparacao: 2, campo: 3, finalizadas: 5, rascunhos: 0 },
    })
  })

  it("GET /permits/mine: as PTs de my_permits, completas, com asOf; com updatedSince, só as mexidas e as que saíram", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/from ptw\.my_permits\(/, [{ id: PERMIT }])
      d.on(/^select now\(\) as now$/, [{ now: new Date(AT) }])
      d.on(/^select p\.id from ptw\.permit p where p\.unit_id = ptw\.current_unit\(\) and p\.changed_at/, [{ id: PERMIT }, { id: OTHER }])
    })
    const s = await t.login()
    const all = await t.app.inject({ url: `${V1}/permits/mine`, headers: { cookie: s.cookie } })
    expect(all.statusCode, all.body).toBe(200)
    expect(all.json()).toMatchObject({ asOf: new Date(AT).toISOString() })
    expect((all.json() as { items: unknown[] }).items).toHaveLength(1)
    expect(calls(/from ptw\.my_permits\(/)[0]!.statement.params).toEqual([UNIT, ANA, 2])
    const since = await t.app.inject({ url: `${V1}/permits/mine?updatedSince=2026-11-10T11:00:00Z&finishedDays=5`, headers: { cookie: s.cookie } })
    expect(since.statusCode, since.body).toBe(200)
    expect(since.json()).toMatchObject({ gone: [OTHER] })
    expect(calls(/from ptw\.my_permits\(/)[1]!.statement.params).toEqual([UNIT, ANA, 5])
  })

  it("GET /permits/{id}/history: v_audit da PT sem acesso.*, cursor por seq", async () => {
    t = await start((d) => {
      seedPermit(d)
      d.on(/from ptw\.v_audit e where .* order by e\.seq desc/, [{
        unit_id: UNIT, seq: "12", at_us: "1794312000123456", ok: true, action: "pt.estado", text: "Em análise → Emitida", reason: null,
        actor_id: ANA, actor_name: "Ana Souza", role_id: null, role_label: null, auth: "sessao", client: null, request_id: "r1", permit_id: PERMIT,
        permit_number: NUMBER, rev: 1, asset_id: null, asset_code: null, entity: "permit", entity_id: PERMIT,
        data: { de: { state: "em_analise" }, para: { state: "emitida" } }, hash: "b".repeat(64), prev_hash: "c".repeat(64), _total: 0,
      }])
      d.on(/^select count\(\*\) as n from ptw\.v_audit/, [{ n: "1" }])
      d.on(/^select count\(\*\) as accesses from ptw\.v_audit/, [{ accesses: "7" }])
    })
    const s = await t.login()
    const res = await t.app.inject({ url: `${V1}/permits/${PERMIT}/history?limit=1&before=99`, headers: { cookie: s.cookie } })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ total: 1, accesses: 7, nextBefore: 12, items: [{ v: 2, seq: 12, at: 1794312000123456, action: "pt.estado", permit: PERMIT }] })
    const q = calls(/from ptw\.v_audit e where .* order by e\.seq desc/)[0]!.statement
    expect(q.text).toContain("left(e.action, 7) <> 'acesso.'")
    expect(q.params).toEqual([PERMIT, 99])
  })
})

// ------------------------------------------------------------------------------------------------
// COM BANCO — só com PTW_TEST_DB=1 (api/compose.test.yaml).
// ------------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)("com banco: o ciclo da PT pela API (PostgreSQL de verdade, como ptw_api)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const H = { host: HOST, origin: ORIGIN }
  const x = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
  const T = { local: x(0x5a1), ativo: x(0x5a2), sol: x(0x5a3), emi: x(0x5a4), exe: x(0x5a5) }
  const L1 = x(0x5b1)
  const A = [x(0x5c1), x(0x5c2), x(0x5c3)] as const
  const P = { carla: x(0x5d3), davi: x(0x5d4), eva: x(0x5d5) }
  const TPLX = x(0x5e1)
  const VERX = x(0x5e2)
  const ST = [x(0x5f0), x(0x5f1), x(0x5f2), x(0x5f3), x(0x5f4)] as const
  const SL = [x(0x5f5), x(0x5f6), x(0x5f7), x(0x5f8), x(0x5f9)] as const

  type Who = "ana" | "carla" | "davi" | "eva"
  const sessions = new Map<Who, Record<string, string>>()
  async function as(who: Who): Promise<Record<string, string>> {
    const cached = sessions.get(who)
    if (cached) return cached
    const res = await app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: H, payload: { login: who } })
    expect(res.statusCode, res.body).toBe(200)
    const cookie = cookiePair(res)
    const h = { ...H, cookie, "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
    sessions.set(who, h)
    return h
  }
  type Detail = Schemas["PermitDetail"]
  async function call(who: Who, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({ method, url: `${V1}${url}`, headers: { ...(await as(who)), ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) })
    return { status: res.statusCode, body: res.body, json: () => res.json() as Detail & { code?: string; detail?: string }, headers: res.headers }
  }
  const rv = (d: Detail) => ({ "if-match": `"${d.permit.rowVersion}"` })
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

  async function draft(asset: string): Promise<Detail> {
    const r = await call("ana", "POST", "/permits", { templateId: TPLX, locationId: L1, windowStart: hours(-0.2), windowEnd: hours(8), scope: "Troca da gaveta", assetIds: [asset] })
    expect(r.status, r.body).toBe(201)
    return r.json()
  }
  async function submitted(asset: string): Promise<Detail> {
    const d = await draft(asset)
    const r = await call("ana", "POST", `/permits/${d.permit.id}/submit`, undefined, rv(d))
    expect(r.status, r.body).toBe(200)
    return r.json()
  }
  async function signAs(who: Who, d: Detail, slot: string): Promise<{ status: number; body: string; json: () => Detail & { code?: string } }> {
    return call(who, "POST", `/permits/${d.permit.id}/signatures`, { id: crypto.randomUUID(), slotId: slot, rev: d.permit.revision })
  }
  const events = (permit: string, action: string) =>
    db.owner<{ ok: boolean; actor_id: string | null; data: Record<string, unknown>; text: string }[]>`
      select ok, actor_id, data, text from ptw.audit_event where permit_id = ${permit}::uuid and action = ${action} order by seq`

  beforeAll(async () => {
    db = await createTestDb("permits")
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-pt')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label) values
        ('${T_UNIT}', '${T.local}', 'local', 'Área'), ('${T_UNIT}', '${T.ativo}', 'ativo', 'Bomba'),
        ('${T_UNIT}', '${T.sol}', 'cargo', 'Solicitante'), ('${T_UNIT}', '${T.emi}', 'cargo', 'Emitente'), ('${T_UNIT}', '${T.exe}', 'cargo', 'Executante')`)
      await tx.unsafe(`insert into ptw.location (unit_id, id, type_id, code, name) values ('${T_UNIT}', '${L1}', '${T.local}', 'A-01', 'Área 1')`)
      await tx.unsafe(`insert into ptw.asset (unit_id, id, type_id, code, name) values
        ('${T_UNIT}', '${A[0]}', '${T.ativo}', 'P-101', 'Bomba 101'), ('${T_UNIT}', '${A[1]}', '${T.ativo}', 'P-102', 'Bomba 102'),
        ('${T_UNIT}', '${A[2]}', '${T.ativo}', 'P-103', 'Bomba 103')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name, login) values
        ('${T_UNIT}', '${P.carla}', 'Carla Dias', 'carla'), ('${T_UNIT}', '${P.davi}', 'Davi Melo', 'davi'), ('${T_UNIT}', '${P.eva}', 'Eva Rocha', 'eva')`)
      await tx.unsafe(`insert into ptw.person_role (unit_id, person_id, role_id, valid_until) values
        ('${T_UNIT}', '${T_ANA}', '${T.sol}', '2099-12-31'), ('${T_UNIT}', '${P.carla}', '${T.emi}', '2099-12-31'),
        ('${T_UNIT}', '${P.davi}', '${T.exe}', '2099-12-31')`)
      await tx.unsafe(`insert into ptw.template (unit_id, id, name) values ('${T_UNIT}', '${TPLX}', 'Trabalho a quente')`)
      await tx.unsafe(`insert into ptw.template_version (unit_id, id, template_id, number, max_window, form) values
        ('${T_UNIT}', '${VERX}', '${TPLX}', 1, interval '12 hours',
         '{"sections": [{"id": "s1", "title": "Pedido", "items": [{"id": "obs", "kind": "texto", "label": "Observação", "required": false, "long": false}]}]}')`)
      await tx.unsafe(`insert into ptw.stage (unit_id, id, version_id, position, name, kind) values
        ('${T_UNIT}', '${ST[0]}', '${VERX}', 0, 'Solicitação', 'solicitacao'), ('${T_UNIT}', '${ST[1]}', '${VERX}', 1, 'Emissão', 'emissao'),
        ('${T_UNIT}', '${ST[2]}', '${VERX}', 2, 'Aceite no campo', 'aceite_campo'), ('${T_UNIT}', '${ST[3]}', '${VERX}', 3, 'Entrega', 'entrega'),
        ('${T_UNIT}', '${ST[4]}', '${VERX}', 4, 'Aceite da área', 'aceite_area')`)
      await tx.unsafe(`insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, role_ids) values
        ('${T_UNIT}', '${SL[0]}', '${VERX}', '${ST[0]}', 0, 'Solicita', array['${T.sol}'::uuid]),
        ('${T_UNIT}', '${SL[1]}', '${VERX}', '${ST[1]}', 0, 'Emite', array['${T.emi}'::uuid]),
        ('${T_UNIT}', '${SL[2]}', '${VERX}', '${ST[2]}', 0, 'Aceita no campo', array['${T.exe}'::uuid]),
        ('${T_UNIT}', '${SL[3]}', '${VERX}', '${ST[3]}', 0, 'Entrega a área', array['${T.exe}'::uuid]),
        ('${T_UNIT}', '${SL[4]}', '${VERX}', '${ST[4]}', 0, 'Aceita a área', array['${T.emi}'::uuid])`)
      await tx.unsafe(`select ptw.version_activate('${T_UNIT}', '${VERX}')`)
    })
    app = await buildApp({
      config: testConfig({ unit: T_UNIT, db: db.config, checkResponses: true }),
      driver: postgresDriver(db.config),
      autoload: false,
      routes: [...BASE_ROUTES, permitRoutes],
      storageProbe: async () => ({ ok: true }),
      logger: false,
    })
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  it("ciclo completo: rascunho → enviar (Solicitação) → emitida → ativa → Parar → Retomar → novo Aceite → entregue → encerrada", async () => {
    let d = await draft(A[0])
    expect(d.permit).toMatchObject({ state: "rascunho", authorId: T_ANA, number: null })
    const pid = d.permit.id
    const ans = await call("ana", "PUT", `/permits/${pid}/answers/obs`, { t: "texto", v: "Área isolada" })
    expect(ans.status, ans.body).toBe(200)
    expect(ans.json()).toMatchObject({ answeredBy: T_ANA })

    let r = await call("ana", "POST", `/permits/${pid}/submit`, undefined, rv(d))
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("em_analise")
    expect(d.permit.number).toMatch(/^PT-UNT1-\d{4}-00001$/)
    expect(d.signatures.filter((g) => g.slotId === SL[0] && g.personId === T_ANA && !g.voidedAt)).toHaveLength(1)
    expect(d.currentStageId).toBe(ST[1])

    r = await signAs("carla", d, SL[1])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("emitida")

    r = await signAs("davi", d, SL[2])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("ativa")
    expect(d.released).toBe(true)

    r = await call("davi", "POST", `/permits/${pid}/stop`, { reason: "Vazamento de gás" })
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit).toMatchObject({ state: "suspensa", holdReason: "Vazamento de gás", holdBy: P.davi })
    expect(d.released).toBe(false)

    r = await call("carla", "POST", `/permits/${pid}/resume`, { reason: "Vazamento contido" }, rv(d))
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit).toMatchObject({ state: "suspensa", holdReason: null, resumedBy: P.carla })
    expect(d.signatures.find((g) => g.slotId === SL[2])!.voidedAt).not.toBeNull()

    r = await signAs("davi", d, SL[2])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit).toMatchObject({ state: "ativa", resumedAt: null })

    r = await signAs("davi", d, SL[3])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("entregue")

    r = await signAs("carla", d, SL[4])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("encerrada")
    expect(d.currentStageId).toBeNull()

    // A trilha: as assinaturas (com o cargo do contexto), a parada e a retomada, na mesma ordem que o banco grava.
    const signs = await events(pid, "pt.assinatura")
    expect(signs.map((e) => e.actor_id)).toEqual([T_ANA, P.carla, P.davi, P.davi, P.davi, P.carla])
    // Parar a PT ativa muda o estado na mesma escrita: o evento é pt.estado (Ativa → Suspensa), de quem parou.
    expect((await events(pid, "pt.estado")).filter((e) => /^Ativa → Suspensa/.test(e.text)).map((e) => e.actor_id)).toEqual([P.davi])
    expect((await events(pid, "pt.retomada")).map((e) => e.actor_id)).toEqual([P.carla])
    const role = await db.owner<{ role_id: string }[]>`select role_id from ptw.audit_event where permit_id = ${pid}::uuid and action = 'pt.assinatura' and actor_id = ${P.carla}::uuid order by seq limit 1`
    expect(role[0]!.role_id).toBe(T.emi)
    // Encerrada solta o equipamento.
    expect(await db.owner`select 1 from ptw.v_equipment_hold where asset_id = ${A[0]}::uuid`).toHaveLength(0)
    const hist = await call("ana", "GET", `/permits/${pid}/history?limit=500`)
    expect(hist.status, hist.body).toBe(200)
    const items = (JSON.parse(hist.body) as Schemas["AuditPage"]).items
    expect(items.some((e) => e.action.startsWith("acesso."))).toBe(false)
    expect(items.filter((e) => e.action === "pt.assinatura")).toHaveLength(6)
  })

  it("Devolver e reenviar: revisão seguinte, assinaturas anteriores anuladas, Solicitação assinada de novo", async () => {
    let d = await submitted(A[1])
    const pid = d.permit.id
    const own = await call("ana", "POST", `/permits/${pid}/return`, { reason: "Falta o bloqueio" }, rv(d))
    expect(own.status).toBe(422)
    expect(own.json().code).toBe("PTW18")
    let r = await call("carla", "POST", `/permits/${pid}/return`, { reason: "Falta o bloqueio" }, rv(d))
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit).toMatchObject({ state: "devolvida", note: "Falta o bloqueio", revision: 1 })
    r = await call("ana", "POST", `/permits/${pid}/submit`, undefined, rv(d))
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit).toMatchObject({ state: "em_analise", revision: 2 })
    expect(d.revisions.map((x) => x.rev)).toEqual([2])
    const sol = d.signatures.filter((g) => g.slotId === SL[0])
    expect(sol.map((g) => [g.rev, g.voidedAt === null])).toEqual([[1, false], [2, true]])
    expect(sol.find((g) => g.rev === 1)!.voidedReason).toMatch(/Reenviada/)
    // Assinar na revisão antiga é recusado (PTW07).
    const old = await call("carla", "POST", `/permits/${pid}/signatures`, { slotId: SL[1], rev: 1 })
    expect(old.status).toBe(422)
    expect(old.json().code).toBe("PTW07")
  })

  it("Descartar rascunho: só o solicitante (PTW17, na trilha), com motivo; vira cancelada", async () => {
    const d = await draft(A[2])
    const pid = d.permit.id
    const other = await call("carla", "POST", `/permits/${pid}/discard`, { reason: "Não vai mais" }, rv(d))
    expect(other.status).toBe(422)
    expect(other.json().code).toBe("PTW17")
    const denied = await db.owner<{ action: string; actor_id: string }[]>`
      select action, actor_id from ptw.audit_event where permit_id = ${pid}::uuid and not ok order by seq desc limit 1`
    expect(denied[0]).toMatchObject({ action: "pt.estado", actor_id: P.carla })
    const blank = await call("ana", "POST", `/permits/${pid}/discard`, { reason: "   " }, rv(d))
    expect(blank.status).toBe(422)
    expect(blank.json().code).toBe("23514")
    const ok = await call("ana", "POST", `/permits/${pid}/discard`, { reason: "Não vai mais" }, rv(d))
    expect(ok.status, ok.body).toBe(200)
    expect(ok.json().permit).toMatchObject({ state: "cancelada", note: "Não vai mais" })
  })

  it("Prorrogar além do prazo máximo do modelo → 422 PTW31; dentro, por quem emite → 200; pelo solicitante → PTW32", async () => {
    let d = await submitted(A[2])
    const r = await signAs("carla", d, SL[1])
    expect(r.status, r.body).toBe(200)
    d = r.json()
    expect(d.permit.state).toBe("emitida")
    const pid = d.permit.id
    const far = await call("carla", "POST", `/permits/${pid}/extensions`, { newEnd: hours(13), reason: "Mais um turno" }, rv(d))
    expect(far.status).toBe(422)
    expect(far.json().code).toBe("PTW31")
    const notIssuer = await call("ana", "POST", `/permits/${pid}/extensions`, { newEnd: hours(9), reason: "Chuva" }, rv(d))
    expect(notIssuer.status).toBe(422)
    expect(notIssuer.json().code).toBe("PTW32")
    const ok = await call("carla", "POST", `/permits/${pid}/extensions`, { newEnd: hours(9), reason: "Chuva" }, rv(d))
    expect(ok.status, ok.body).toBe(200)
    expect(ok.json().extensions).toHaveLength(1)
    // Cada recusa fica na trilha como negada (PTW31 de quem emite; PTW32 do solicitante); só a prorrogação válida é ok.
    const ext = await events(pid, "pt.prorrogada")
    expect(ext.filter((e) => e.ok).map((e) => e.actor_id)).toEqual([P.carla])
    expect(ext.filter((e) => !e.ok).map((e) => [e.actor_id, (e.data as { codigo?: string }).codigo ?? e.text])).toEqual([
      [P.carla, expect.stringContaining("PTW31")],
      [x(0xd1), expect.stringContaining("PTW32")], // ana (pessoa da base)
    ])
  })

  it("trava de equipamento: enviar com o ativo de outra PT aberta → 409 PTW10, detail = a PT que prende; nada muda", async () => {
    const holder = await db.owner<{ permit_id: string }[]>`select permit_id from ptw.v_equipment_hold where asset_id = ${A[2]}::uuid`
    expect(holder).toHaveLength(1)
    const d = await draft(A[2])
    const r = await call("ana", "POST", `/permits/${d.permit.id}/submit`, undefined, rv(d))
    expect(r.status).toBe(409)
    expect(r.json().code).toBe("PTW10")
    expect(r.json().detail).toContain(holder[0]!.permit_id)
    const after = await call("ana", "GET", `/permits/${d.permit.id}`)
    expect(after.json().permit).toMatchObject({ state: "rascunho", number: null })
  })

  it("assinar sem poder é recusado (PTW08: sem o cargo; PTW20: fora da etapa) e fica na trilha", async () => {
    const d = await submitted(A[0])
    const eva = await signAs("eva", d, SL[1])
    expect(eva.status).toBe(422)
    expect(eva.json().code).toBe("PTW08")
    const davi = await signAs("davi", d, SL[1])
    expect(davi.json().code).toBe("PTW08")
    const early = await signAs("davi", d, SL[2])
    expect(early.json().code).toBe("PTW20")
    const denied = await db.owner<{ actor_id: string }[]>`
      select actor_id from ptw.audit_event where permit_id = ${d.permit.id}::uuid and action = 'pt.assinatura' and not ok order by seq`
    expect(denied.map((e) => e.actor_id)).toEqual([P.eva, P.davi, P.davi])
    // Repetir a assinatura (mesma Idempotency-Key; e o mesmo id sem chave) não assina de novo.
    const key = "018f3b2a-7c11-7000-8000-00000000eeee"
    const sigId = "018f3b2a-7c11-7000-8000-00000000ffff"
    const body = { id: sigId, slotId: SL[1], rev: 1 }
    const a = await call("carla", "POST", `/permits/${d.permit.id}/signatures`, body, { "idempotency-key": key })
    const b = await call("carla", "POST", `/permits/${d.permit.id}/signatures`, body, { "idempotency-key": key })
    const c = await call("carla", "POST", `/permits/${d.permit.id}/signatures`, body)
    expect([a.status, b.status, c.status], a.body + c.body).toEqual([200, 200, 200])
    expect(b.headers["idempotency-replayed"]).toBe("true")
    const n = await db.owner<{ n: number }[]>`select count(*)::int as n from ptw.signature where permit_id = ${d.permit.id}::uuid and slot_id = ${SL[1]}::uuid`
    expect(n[0]!.n).toBe(1)
  })

  it("cada abertura grava acesso.pt.aberta (GET e POST /access), e o Quadro não mostra rascunho de outra pessoa", async () => {
    const d = await draft(A[1])
    const count = async () =>
      (await db.owner<{ n: number }[]>`select count(*)::int as n from ptw.audit_event where permit_id = ${d.permit.id}::uuid and action = 'acesso.pt.aberta'`)[0]!.n
    const n0 = await count()
    expect((await call("ana", "GET", `/permits/${d.permit.id}`)).status).toBe(200)
    expect((await call("ana", "GET", `/permits/${d.permit.id}`)).status).toBe(200)
    expect((await call("ana", "POST", `/permits/${d.permit.id}/access`)).status).toBe(204)
    // SPEC 014: o rascunho é só do solicitante; para Carla a PT não existe e nada é gravado.
    expect((await call("carla", "POST", `/permits/${d.permit.id}/access`)).status).toBe(404)
    expect((await call("carla", "GET", `/permits/${d.permit.id}`)).status).toBe(404)
    expect(await count()).toBe(n0 + 3)
    const history = await call("ana", "GET", `/permits/${d.permit.id}/history?limit=100`)
    expect(history.status, history.body).toBe(200)
    const trail = JSON.parse(history.body) as Schemas["PermitHistoryPage"]
    expect(trail.accesses).toBe(n0 + 3)
    expect(trail.items.length).toBeGreaterThan(0)
    expect(trail.items.every(e => !e.action.startsWith("acesso."))).toBe(true)
    expect(await count()).toBe(n0 + 3)
    const mine = await call("ana", "GET", `/permits?state=rascunho&pageSize=100`)
    expect((JSON.parse(mine.body) as Schemas["PermitBoardPage"]).items.map((i) => i.permit.id)).toContain(d.permit.id)
    const theirs = await call("carla", "GET", `/permits?state=rascunho&pageSize=100`)
    expect(theirs.status, theirs.body).toBe(200)
    expect((JSON.parse(theirs.body) as Schemas["PermitBoardPage"]).items.map((i) => i.permit.id)).not.toContain(d.permit.id)
    const counts = await call("carla", "GET", `/permits/counts`)
    expect(counts.status, counts.body).toBe(200)
    const myArea = await call("carla", "GET", `/permits/mine`)
    expect(myArea.status, myArea.body).toBe(200)
  })
})

/**
 * SPEC 014: o rascunho é só do solicitante, em qualquer leitura por id (a PT, o histórico, o registro
 * de abertura e os anexos), no Quadro e em Minha área; e o tempo do salvamento automático chega por
 * `GET /health`. Contra o PostgreSQL de verdade (como ptw_api).
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import { HOST, ORIGIN, cookiePair, testConfig } from "./helpers/app.js"
import { HAS_DB, T_ANA, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const BASE = "/api/v1"
describe.skipIf(!HAS_DB)("com banco: rascunho só do solicitante (SPEC 014)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const x = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
  const CARLOS = x(0x9d1)
  const sessions = new Map<string, Record<string, string>>()
  async function as(who: string) {
    const cached = sessions.get(who)
    if (cached) return cached
    const res = await app.inject({ method: "POST", url: `${BASE}/session/dev-login`, headers: { host: HOST, origin: ORIGIN }, payload: { login: who } })
    expect(res.statusCode, res.body).toBe(200)
    const h = { host: HOST, origin: ORIGIN, cookie: cookiePair(res), "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
    sessions.set(who, h)
    return h
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(who: string, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: string; json: () => any }> {
    const headers: Record<string, string> = { ...(await as(who)), ...extra }
    if (method !== "GET" && !headers["idempotency-key"]) headers["idempotency-key"] = randomUUID()
    const res = await app.inject({ method, url: `${BASE}${url}`, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
    return { status: res.statusCode, body: res.body, json: () => res.json() }
  }
  let permit = "", rowVersion = 0, attachment = ""

  beforeAll(async () => {
    db = await createTestDb("drafts")
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-rascunhos')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name, login) values ('${T_UNIT}', '${CARLOS}', 'Carlos Dias', 'carlos')`)
    })
    app = await buildApp({ config: testConfig({ db: db.config, checkResponses: true, draftAutosaveSeconds: 7 }), driver: postgresDriver(db.config), logger: false })
    await app.ready()
    const type = await call("ana", "POST", "/types", { family: "local", label: "Área" })
    const role = await call("ana", "POST", "/types", { family: "cargo", label: "Responsável" })
    const loc = await call("ana", "POST", "/locations", { typeId: type.json().id, code: "A-01", name: "Área 1" })
    expect(loc.status, loc.body).toBe(201)
    const tpl = await call("ana", "POST", "/templates", { name: "Teste de rascunho", version: {
      id: randomUUID(), form: { sections: [] },
      stages: ["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"].map((kind, i) => ({ id: randomUUID(), kind, name: "Etapa " + i,
        slots: [{ id: randomUUID(), kind: "cargo", roleIds: [role.json().id], personId: null, meaning: "Assina", min: 1, required: true }] })),
      separation: [], locationTypeIds: [], assetTypeIds: [], workTypeIds: [],
    } })
    expect(tpl.status, tpl.body).toBe(201)
    const t = tpl.json(), v = t.versions[0]
    const active = await call("ana", "POST", `/templates/${t.id}/versions/${v.id}/activate`, undefined, { "if-match": `"${v.revision}"` })
    expect(active.status, active.body).toBe(200)
    const draft = await call("ana", "POST", "/permits", { templateId: t.id, versionId: v.id, locationId: loc.json().id, assetIds: [], team: {},
      scope: "Rascunho privado", windowStart: new Date(Date.now() + 60_000).toISOString(), windowEnd: new Date(Date.now() + 3_600_000).toISOString() })
    expect(draft.status, draft.body).toBe(201)
    permit = draft.json().permit.id
    rowVersion = draft.json().permit.rowVersion
    attachment = randomUUID()
    const sha = "ab".repeat(32)
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-anexo')`)
      await tx.unsafe(`insert into ptw.blob (unit_id, sha256, size, mime) values ('${T_UNIT}', decode('${sha}', 'hex'), 3, 'text/plain')`)
      await tx.unsafe(`insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, captured_by) values ('${T_UNIT}', '${attachment}', '${permit}', 'arquivo', 'arquivo', decode('${sha}', 'hex'), 'nota.txt', '${T_ANA}')`)
    })
    await as("carlos")
  })
  afterAll(async () => { await app?.close(); await db?.drop() })

  it("o solicitante lê o próprio rascunho; outra pessoa recebe 404 em tudo", async () => {
    expect((await call("ana", "GET", `/permits/${permit}`)).status).toBe(200)
    expect((await call("ana", "GET", `/permits/${permit}/history`)).status).toBe(200)
    expect((await call("ana", "GET", `/attachments/${attachment}`)).status).toBe(200)
    for (const url of [`/permits/${permit}`, `/permits/${permit}/history`, `/attachments/${attachment}`, `/attachments/${attachment}/content?mode=visto`, `/attachments/${attachment}/preview`]) {
      const r = await call("carlos", "GET", url)
      expect(r.status, `${url}: ${r.body}`).toBe(404)
    }
    expect((await call("carlos", "POST", `/permits/${permit}/access`)).status).toBe(404)
  })

  it("as listas também escondem: Quadro, contagem e Minha área", async () => {
    const mine = await call("ana", "GET", "/permits?pageSize=50")
    expect(JSON.stringify(mine.json())).toContain(permit)
    for (const url of ["/permits?pageSize=50", "/permits?pageSize=50&segment=preparacao", "/permits/mine"]) {
      const r = await call("carlos", "GET", url)
      expect(r.status, r.body).toBe(200)
      expect(r.body).not.toContain(permit)
    }
    expect((await call("ana", "GET", "/permits/mine")).body).toContain(permit)
  })

  it("quem não é o solicitante não altera nem descarta (PTW17, como antes)", async () => {
    const edit = await call("carlos", "PATCH", `/permits/${permit}`, { scope: "invadido" }, { "if-match": `"${rowVersion}"` })
    expect(edit.status, edit.body).toBe(422)
    expect(edit.json().code).toBe("PTW17")
    const discard = await call("carlos", "POST", `/permits/${permit}/discard`, { reason: "x" }, { "if-match": `"${rowVersion}"` })
    expect(discard.json().code).toBe("PTW17")
  })

  it("o rascunho excluído continua escondido dos outros e visível para o autor", async () => {
    const gone = await call("ana", "POST", `/permits/${permit}/discard`, { reason: "Rascunho excluído pelo solicitante" }, { "if-match": `"${rowVersion}"` })
    expect(gone.status, gone.body).toBe(200)
    expect(gone.json().permit.state).toBe("cancelada")
    expect((await call("ana", "GET", `/permits/${permit}`)).status).toBe(200)
    expect((await call("carlos", "GET", `/permits/${permit}`)).status).toBe(404)
  })

  it("o tempo do salvamento automático vem da configuração, por GET /health", async () => {
    const res = await app.inject({ url: `${BASE}/health`, headers: { host: HOST } })
    expect(res.json().draftAutosaveSeconds).toBe(7)
  })
})

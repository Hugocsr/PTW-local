/**
 * SPEC 015: a equipe só aceita quem é elegível para o cargo, no local da PT, hoje (`person_ineligible`):
 * ao criar, ao alterar e ao enviar a PT. Contra o PostgreSQL de verdade (como ptw_api).
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import { HOST, ORIGIN, cookiePair, testConfig } from "./helpers/app.js"
import { HAS_DB, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const BASE = "/api/v1"
describe.skipIf(!HAS_DB)("com banco: equipe só com pessoas elegíveis (SPEC 015)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const x = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
  const OK = x(0x9e1), VENCIDO = x(0x9e2)
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
  let template = "", version = "", location = "", role = "", draft = "", rowVersion = 0
  const when = () => ({ windowStart: new Date(Date.now() + 60_000).toISOString(), windowEnd: new Date(Date.now() + 3_600_000).toISOString() })
  const create = (team: Record<string, string[]>) => call("ana", "POST", "/permits", { templateId: template, versionId: version, locationId: location, assetIds: [], team, scope: "Serviço", ...when() })

  beforeAll(async () => {
    db = await createTestDb("teamelig")
    app = await buildApp({ config: testConfig({ db: db.config, checkResponses: true }), driver: postgresDriver(db.config), logger: false })
    await app.ready()
    const type = await call("ana", "POST", "/types", { family: "local", label: "Área" })
    const r = await call("ana", "POST", "/types", { family: "cargo", label: "Eletricista" })
    role = r.json().id
    const loc = await call("ana", "POST", "/locations", { typeId: type.json().id, code: "A-01", name: "Área 1" })
    location = loc.json().id
    const tpl = await call("ana", "POST", "/templates", { name: "Equipe elegível", version: {
      id: randomUUID(), form: { sections: [] },
      stages: ["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"].map((kind, i) => ({ id: randomUUID(), kind, name: "Etapa " + i,
        slots: [{ id: randomUUID(), kind: "cargo", roleIds: [role], personId: null, meaning: "Assina", min: 1, required: true }] })),
      separation: [], locationTypeIds: [], assetTypeIds: [], workTypeIds: [],
    } })
    const t = tpl.json(), v = t.versions[0]
    template = t.id; version = v.id
    expect((await call("ana", "POST", `/templates/${t.id}/versions/${v.id}/activate`, undefined, { "if-match": `"${v.revision}"` })).status).toBe(200)
    // OK: contato sem login com o cargo válido; VENCIDO: o cargo venceu em 2000.
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-equipe')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name) values ('${T_UNIT}', '${OK}', 'Otávio Elétrica'), ('${T_UNIT}', '${VENCIDO}', 'Vera Vencida')`)
      await tx.unsafe(`insert into ptw.person_role (unit_id, person_id, role_id, valid_until) values ('${T_UNIT}', '${OK}', '${role}', '2099-12-31'), ('${T_UNIT}', '${VENCIDO}', '${role}', '2000-01-01')`)
    })
  })
  afterAll(async () => { await app?.close(); await db?.drop() })

  it("criar com equipe elegível (um contato sem login pode participar) funciona", async () => {
    const res = await create({ [role]: [OK] })
    expect(res.status, res.body).toBe(201)
    draft = res.json().permit.id
    rowVersion = res.json().permit.rowVersion
  })

  it("criar com pessoa não elegível é recusado (PTW08) e nada é gravado", async () => {
    const id = randomUUID()
    const res = await call("ana", "POST", "/permits", { id, templateId: template, versionId: version, locationId: location, assetIds: [], team: { [role]: [VENCIDO] }, scope: "Serviço", ...when() })
    expect(res.status).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW08", message: "Equipe: Vera Vencida não elegível (cargo vencido ou fora do escopo do local)" })
    expect((await call("ana", "GET", `/permits/${id}`)).status).toBe(404)
  })

  it("alterar a equipe com pessoa não elegível é recusado e a equipe anterior fica", async () => {
    const res = await call("ana", "PATCH", `/permits/${draft}`, { team: { [role]: [OK, VENCIDO] } }, { "if-match": `"${rowVersion}"` })
    expect(res.status, res.body).toBe(422)
    expect(res.json().code).toBe("PTW08")
    const now = await call("ana", "GET", `/permits/${draft}`)
    expect(now.json().permit.team).toEqual({ [role]: [OK] })
    rowVersion = now.json().permit.rowVersion
  })

  it("enviar com alguém que deixou de ser elegível é recusado (PTW08) antes de assinar", async () => {
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-venceu')`)
      await tx.unsafe(`update ptw.person_role set valid_until = '2000-01-01' where unit_id = '${T_UNIT}' and person_id = '${OK}'`)
    })
    const res = await call("ana", "POST", `/permits/${draft}/submit`, undefined, { "if-match": `"${rowVersion}"` })
    expect(res.status, res.body).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW08", message: "Equipe: Otávio Elétrica não elegível (cargo vencido ou fora do escopo do local)" })
  })
})

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import routes from "../src/routes/delegations.js"
import permitRoutes from "../src/routes/permits/index.js"
import { MemorySessionStore } from "../src/session/store.js"
import { BASE_ROUTES, HOST, ORIGIN, cookiePair, makeApp, testConfig, type TestApp } from "./helpers/app.js"
import { HAS_DB, T_ANA, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const open: TestApp[] = []
afterEach(async () => { for (const t of open.splice(0)) await t.app.close() })
const start = async () => { const t = await makeApp({ routes: [routes] }); open.push(t); return t }
const id = "00000000-0000-7000-8000-000000000090"
const input = { id, slotId: id, delegatorId: id, delegateId: id, scopeLocationId: null, startsAt: "2026-11-23T12:00:00Z", endsAt: "2026-11-23T20:00:00Z", reason: "Teste" }

it("operador lê somente mandatos próprios e não cria nem revoga", async () => {
  const t = await start(), s = await t.login()
  for (const record of (t.app.ptw.sessions as MemorySessionStore).sessions.values()) record.grants = []
  const read = await t.app.inject({ url: "/api/v1/delegations", headers: s.headers })
  expect(read.statusCode, read.body).toBe(200)
  const query = t.driver.find(/from ptw.delegation/)[0]!.statement
  expect(query.params).toContain(false)
  expect(query.text).toMatch(/delegator_id=ptw.current_person\(\) or delegate_id=ptw.current_person\(\)/)
  for (const [url, payload] of [["/delegations", input], [`/delegations/${id}/revoke`, { reason: "Fim" }]] as const) {
    const r = await t.app.inject({ method: "POST", url: "/api/v1" + url, headers: { ...s.headers, "if-match": '"1"' }, payload })
    expect(r.statusCode, r.body).toBe(403)
  }
  expect(t.driver.find(/insert into ptw.delegation|update ptw.delegation/)).toHaveLength(0)
})

it("revisão obsoleta recusa revogação e não modifica o mandato", async () => {
  const t = await start(), s = await t.login()
  t.driver.on(/select revision from ptw.delegation/, [{ revision: 2 }])
  const r = await t.app.inject({ method: "POST", url: `/api/v1/delegations/${id}/revoke`, headers: { ...s.headers, "if-match": '"1"' }, payload: { reason: "Fim" } })
  expect(r.statusCode, r.body).toBe(409)
  expect(t.driver.find(/update ptw.delegation/)).toHaveLength(0)
})

/**
 * Casos de teste da tela Aprovação › Delegações (SGI Forces) contra o PostgreSQL de verdade, como ptw_api:
 * a cadeia do SGI (Planta Norte/Sul → área), aprovação da gerência nominal e delegável (Joana), Marina com
 * Supervisão na unidade toda, Rafael com Supervisão só na Planta Norte e Paulo sem cargo.
 */
describe.skipIf(!HAS_DB)("com banco: Delegações do SGI (mandato geral, escopo por planta, uso na PT)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const x = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
  const T = { planta: x(0x7a1), area: x(0x7a2), ativo: x(0x7a3), sol: x(0x7a4), sup: x(0x7a5), exe: x(0x7a6) }
  const L = { norte: x(0x7b1), sul: x(0x7b2), cald: x(0x7b3), moagem: x(0x7b4) }
  const AS = [x(0x7c1), x(0x7c2), x(0x7c3)] as const
  let nextAsset = 0
  const P = { joana: x(0x7d1), marina: x(0x7d2), rafael: x(0x7d3), paulo: x(0x7d4) }
  const TPL = x(0x7e1), VER = x(0x7e2)
  const ST = [x(0x7f0), x(0x7f1), x(0x7f2), x(0x7f3), x(0x7f4), x(0x7f5)] as const
  const SL = [x(0x7f6), x(0x7f7), x(0x7f8), x(0x7f9), x(0x7fa), x(0x7fb)] as const
  const APROVA = SL[1]
  type Who = "ana" | "joana" | "marina" | "rafael" | "paulo"
  const sessions = new Map<Who, Record<string, string>>()
  async function as(who: Who) {
    const cached = sessions.get(who)
    if (cached) return cached
    const res = await app.inject({ method: "POST", url: "/api/v1/session/dev-login", headers: { host: HOST, origin: ORIGIN }, payload: { login: who } })
    expect(res.statusCode, res.body).toBe(200)
    const h = { host: HOST, origin: ORIGIN, cookie: cookiePair(res), "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
    sessions.set(who, h)
    return h
  }
  async function call(who: Who, method: "GET" | "POST" | "PUT", url: string, payload?: unknown, extra: Record<string, string> = {}) {
    const res = await app.inject({ method, url: `/api/v1${url}`, headers: { ...(await as(who)), ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.statusCode, body: res.body, json: () => res.json() as any }
  }
  const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
  const mandate = (over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), slotId: null, delegatorId: P.joana, delegateId: P.marina, scopeLocationId: null, startsAt: at(0), endsAt: at(72), reason: "Férias", ...over })
  const create = (body: Record<string, unknown>, who: Who = "ana") => call(who, "POST", "/delegations", body, { "idempotency-key": body.id as string })
  const revoke = (d: { id: string; revision: number }, reason = "Retorno antecipado") =>
    call("ana", "POST", `/delegations/${d.id}/revoke`, { reason }, { "if-match": `"${d.revision}"`, "idempotency-key": crypto.randomUUID() })

  beforeAll(async () => {
    db = await createTestDb("delegations")
    await db.owner.begin(async (tx) => {
      const U = T_UNIT
      await tx.unsafe(`select ptw.set_context('${U}', null, null, 'servico', 'teste', 'semente-delegacao')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label, system_key) values
        ('${U}', '${T.planta}', 'local', 'Planta', 'planta'), ('${U}', '${T.area}', 'local', 'Área', 'area'), ('${U}', '${T.ativo}', 'ativo', 'Bomba', null),
        ('${U}', '${T.sol}', 'cargo', 'Técnico', null), ('${U}', '${T.sup}', 'cargo', 'Supervisão', null), ('${U}', '${T.exe}', 'cargo', 'Líder', null)`)
      await tx.unsafe(`insert into ptw.location (unit_id, id, type_id, parent_id, code, name) values
        ('${U}', '${L.norte}', '${T.planta}', null, 'PNO', 'Planta Norte'), ('${U}', '${L.sul}', '${T.planta}', null, 'PSU', 'Planta Sul')`)
      await tx.unsafe(`insert into ptw.location (unit_id, id, type_id, parent_id, code, name) values
        ('${U}', '${L.cald}', '${T.area}', '${L.norte}', 'PNO-CAL', 'Caldeiraria'), ('${U}', '${L.moagem}', '${T.area}', '${L.sul}', 'PSU-MOA', 'Moagem')`)
      await tx.unsafe(`insert into ptw.asset (unit_id, id, type_id, code, name) values
        ('${U}', '${AS[0]}', '${T.ativo}', 'BP-201', 'Bomba de Polpa 201'), ('${U}', '${AS[1]}', '${T.ativo}', 'MO-01', 'Moinho 01'), ('${U}', '${AS[2]}', '${T.ativo}', 'CA-401', 'Caldeira 401')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name, login) values
        ('${U}', '${P.joana}', 'Joana Reis', 'joana'), ('${U}', '${P.marina}', 'Marina Costa', 'marina'),
        ('${U}', '${P.rafael}', 'Rafael Nunes', 'rafael'), ('${U}', '${P.paulo}', 'Paulo Lima', 'paulo')`)
      await tx.unsafe(`insert into ptw.person_role (unit_id, person_id, role_id, scope_location_id, valid_until) values
        ('${U}', '${T_ANA}', '${T.sol}', null, '2099-12-31'), ('${U}', '${P.joana}', '${T.sup}', null, '2099-12-31'),
        ('${U}', '${P.marina}', '${T.sup}', null, '2099-12-31'), ('${U}', '${P.rafael}', '${T.sup}', '${L.norte}', '2099-12-31'),
        ('${U}', '${P.paulo}', '${T.exe}', null, '2099-12-31')`)
      await tx.unsafe(`insert into ptw.template (unit_id, id, name) values ('${U}', '${TPL}', 'Soldagem em tubulação de vapor')`)
      await tx.unsafe(`insert into ptw.template_version (unit_id, id, template_id, number, max_window, form) values
        ('${U}', '${VER}', '${TPL}', 1, interval '12 hours', '{"sections": [{"id": "s1", "title": "Pedido", "items": [{"id": "obs", "kind": "texto", "label": "Observação", "required": false, "long": false}]}]}')`)
      await tx.unsafe(`insert into ptw.stage (unit_id, id, version_id, position, name, kind) values
        ('${U}', '${ST[0]}', '${VER}', 0, 'Solicitação', 'solicitacao'), ('${U}', '${ST[1]}', '${VER}', 1, 'Aprovação da gerência', null),
        ('${U}', '${ST[2]}', '${VER}', 2, 'Emissão', 'emissao'), ('${U}', '${ST[3]}', '${VER}', 3, 'Aceite no campo', 'aceite_campo'),
        ('${U}', '${ST[4]}', '${VER}', 4, 'Entrega', 'entrega'), ('${U}', '${ST[5]}', '${VER}', 5, 'Aceite da área', 'aceite_area')`)
      await tx.unsafe(`insert into ptw.sign_slot (unit_id, id, version_id, stage_id, position, meaning, kind, role_ids, person_id, delegable) values
        ('${U}', '${SL[0]}', '${VER}', '${ST[0]}', 0, 'Solicita', 'cargo', array['${T.sol}'::uuid], null, false),
        ('${U}', '${SL[1]}', '${VER}', '${ST[1]}', 0, 'Aprova a soldagem (gerência)', 'pessoa', array['${T.sup}'::uuid], '${P.joana}', true),
        ('${U}', '${SL[2]}', '${VER}', '${ST[2]}', 0, 'Emite', 'cargo', array['${T.sup}'::uuid], null, false),
        ('${U}', '${SL[3]}', '${VER}', '${ST[3]}', 0, 'Aceita no campo', 'cargo', array['${T.exe}'::uuid], null, false),
        ('${U}', '${SL[4]}', '${VER}', '${ST[4]}', 0, 'Entrega', 'cargo', array['${T.exe}'::uuid], null, false),
        ('${U}', '${SL[5]}', '${VER}', '${ST[5]}', 0, 'Encerra', 'cargo', array['${T.sup}'::uuid], null, false)`)
      await tx.unsafe(`select ptw.version_activate('${U}', '${VER}')`)
    })
    app = await buildApp({
      config: testConfig({ unit: T_UNIT, db: db.config, checkResponses: true }),
      driver: postgresDriver(db.config), autoload: false, routes: [...BASE_ROUTES, routes, permitRoutes],
      storageProbe: async () => ({ ok: true }), logger: false,
    })
    await app.ready()
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  it("CT-01 nova delegação geral (todas as plantas, todas as aprovações): criada, listada e auditada", async () => {
    expect((await call("ana", "GET", "/delegations")).json()).toEqual([])
    const body = mandate()
    const r = await create(body)
    expect(r.status, r.body).toBe(201)
    expect(r.json()).toMatchObject({ id: body.id, slotId: null, scopeLocationId: null, delegatorId: P.joana, delegateId: P.marina, reason: "Férias", createdBy: T_ANA, revokedAt: null, revision: 1 })
    expect((await call("ana", "GET", "/delegations")).json().map((d: { id: string }) => d.id)).toEqual([body.id])
    const audit = await db.owner`select ok from ptw.audit_event where action = 'delegacao.criada' and entity_id = ${body.id}::uuid`
    expect(audit.map((a) => a.ok)).toEqual([true])
    // Revoga para liberar os próximos casos (um mandato por vez para o mesmo delegante).
    expect((await revoke(r.json())).status).toBe(200)
  })

  it("CT-02 regras preservadas: sem cargo, delegante sem aprovação, auto-delegação, mais de 7 dias, início no passado", async () => {
    const cases: [Record<string, unknown>, number][] = [
      [mandate({ delegateId: P.paulo }), 422],
      [mandate({ delegatorId: P.marina, delegateId: P.joana }), 422],
      [mandate({ delegateId: P.joana }), 422],
      [mandate({ endsAt: at(24 * 7 + 1) }), 422],
      [mandate({ startsAt: at(-2), endsAt: at(10) }), 422],
      [mandate({ delegateId: P.rafael }), 422],
    ]
    for (const [body, status] of cases) {
      const r = await create(body)
      expect(r.status, `${JSON.stringify(body)} → ${r.body}`).toBe(status)
    }
    expect(await db.owner`select 1 from ptw.delegation`).toHaveLength(1)
  })

  it("CT-03 escopo por planta: Rafael só recebe com escopo na Planta Norte; sobreposição recusada", async () => {
    const norte = mandate({ delegateId: P.rafael, scopeLocationId: L.norte, slotId: APROVA, reason: "Viagem técnica" })
    const r = await create(norte)
    expect(r.status, r.body).toBe(201)
    expect(r.json()).toMatchObject({ slotId: APROVA, scopeLocationId: L.norte })
    const sobreposta = await create(mandate({ startsAt: at(1), endsAt: at(5) }))
    expect(sobreposta.status, sobreposta.body).toBe(409)
    const sul = await create(mandate({ delegateId: P.rafael, scopeLocationId: L.sul, startsAt: at(80), endsAt: at(90) }))
    expect(sul.status, sul.body).toBe(422)
    // Agendada para depois do fim da atual: aceita (não sobrepõe).
    const depois = await create(mandate({ startsAt: at(73), endsAt: at(96), reason: "Recesso" }))
    expect(depois.status, depois.body).toBe(201)
  })

  it("CT-04 uso na PT: delegado assina a aprovação em nome da Joana só no escopo; identidade real preservada", async () => {
    const mk = async (loc: string) => {
      const d = await call("ana", "POST", "/permits", { templateId: TPL, locationId: loc, windowStart: at(-0.1), windowEnd: at(8), scope: "Solda na linha de vapor", assetIds: [AS[nextAsset++]] })
      expect(d.status, d.body).toBe(201)
      const s = await call("ana", "POST", `/permits/${d.json().permit.id}/submit`, undefined, { "if-match": `"${d.json().permit.rowVersion}"` })
      expect(s.status, s.body).toBe(200)
      return s.json()
    }
    const norte = await mk(L.cald)
    const sign = (who: Who, p: { permit: { id: string; revision: number } }) => call(who, "POST", `/permits/${p.permit.id}/signatures`, { id: crypto.randomUUID(), slotId: APROVA, rev: p.permit.revision })
    // Paulo não tem mandato nem cargo.
    expect((await sign("paulo", norte)).status).toBe(422)
    const ok = await sign("rafael", norte)
    expect(ok.status, ok.body).toBe(200)
    const sig = ok.json().signatures.find((g: { slotId: string }) => g.slotId === APROVA)
    expect(sig).toMatchObject({ personId: P.rafael, representedPersonId: P.joana })
    expect(sig.delegationId).toBeTruthy()
    // Planta Sul fica fora do escopo do mandato do Rafael.
    const sul = await mk(L.moagem)
    expect((await sign("rafael", sul)).status).toBe(422)
    // A Joana continua podendo aprovar.
    expect((await sign("joana", sul)).status).toBe(200)
  })

  it("CT-05 revogação: recusa novos usos, preserva a assinatura anterior e não aceita revisão velha", async () => {
    const [atual] = (await call("ana", "GET", "/delegations")).json().filter((d: { delegateId: string; revokedAt: string | null }) => d.delegateId === P.rafael && !d.revokedAt)
    const r = await revoke(atual, "Retorno da Joana")
    expect(r.status, r.body).toBe(200)
    expect(r.json()).toMatchObject({ revokedBy: T_ANA, revokedReason: "Retorno da Joana", revision: 2 })
    expect((await revoke(atual)).status).toBe(409)
    expect(await db.owner`select 1 from ptw.signature where delegation_id = ${atual.id}::uuid and voided_at is null`).toHaveLength(1)
    const d = await call("ana", "POST", "/permits", { templateId: TPL, locationId: L.cald, windowStart: at(-0.1), windowEnd: at(8), scope: "Outra solda", assetIds: [AS[nextAsset++]] })
    const s = (await call("ana", "POST", `/permits/${d.json().permit.id}/submit`, undefined, { "if-match": `"${d.json().permit.rowVersion}"` })).json()
    expect((await call("rafael", "POST", `/permits/${s.permit.id}/signatures`, { id: crypto.randomUUID(), slotId: APROVA, rev: s.permit.revision })).status).toBe(422)
    expect((await db.owner`select count(*)::int as n from ptw.audit_event where action = 'delegacao.revogada' and ok`)[0].n).toBe(2)
  })

  const edit = (d: { id: string; revision: number }, body: Record<string, unknown>, who: Who = "ana") =>
    call(who, "PUT", `/delegations/${d.id}`, body, { "if-match": `"${d.revision}"`, "idempotency-key": crypto.randomUUID() })
  const fields = (d: Record<string, unknown>) => ({ slotId: d.slotId, delegateId: d.delegateId, scopeLocationId: d.scopeLocationId, startsAt: d.startsAt, endsAt: d.endsAt, reason: d.reason })

  it("CT-07 SPEC 003: agendada é editada (delegado, período, observação) e a edição é auditada", async () => {
    const r = await create(mandate({ delegateId: P.marina, startsAt: at(200), endsAt: at(230), reason: "Recesso" }))
    expect(r.status, r.body).toBe(201)
    const e = await edit(r.json(), { ...fields(r.json()), delegateId: P.rafael, scopeLocationId: L.norte, endsAt: at(220), reason: "Recesso (ajuste)" })
    expect(e.status, e.body).toBe(200)
    expect(e.json()).toMatchObject({ id: r.json().id, delegatorId: P.joana, delegateId: P.rafael, scopeLocationId: L.norte, reason: "Recesso (ajuste)", createdBy: T_ANA, revision: 2 })
    const audit = await db.owner`select data from ptw.audit_event where action = 'delegacao.alterada' and entity_id = ${r.json().id}::uuid`
    expect(audit).toHaveLength(1)
    // Regras de novo: Rafael sem escopo (todas as plantas) é recusado; mais de 7 dias também.
    expect((await edit(e.json(), { ...fields(e.json()), scopeLocationId: null })).status).toBe(422)
    expect((await edit(e.json(), { ...fields(e.json()), endsAt: at(200 + 24 * 7 + 1) })).status).toBe(422)
    expect((await revoke(e.json())).status).toBe(200)
  })

  it("CT-08 SPEC 003: ativa não é editável (422) e continua só revogável", async () => {
    const r = await create(mandate({ delegateId: P.marina, startsAt: at(0), endsAt: at(2), reason: "Reunião" }))
    expect(r.status, r.body).toBe(201)
    const e = await edit(r.json(), { ...fields(r.json()), reason: "Outra" })
    expect(e.status, e.body).toBe(422)
    expect(e.json().message).toMatch(/já entrou em vigor/)
    expect((await revoke(r.json())).status).toBe(200)
  })

  it("CT-09 SPEC 003: revisão velha na edição dá 409 sem mudar nada", async () => {
    const r = await create(mandate({ delegateId: P.marina, startsAt: at(300), endsAt: at(310), reason: "Treinamento" }))
    const first = await edit(r.json(), { ...fields(r.json()), reason: "Treinamento NR-10" })
    expect(first.status, first.body).toBe(200)
    const stale = await edit(r.json(), { ...fields(r.json()), reason: "Outra coisa" })
    expect(stale.status).toBe(409)
    expect((await db.owner`select reason from ptw.delegation where id = ${r.json().id}::uuid`)[0].reason).toBe("Treinamento NR-10")
  })

  it("CT-06 visibilidade: quem não é cadastro vê só os mandatos em que é parte", async () => {
    await as("paulo"); await as("marina")
    // Sessões sem o papel de cadastro (no LDAP real: fora do grupo). A sessão é imutável para a API; aqui o dono ajusta.
    await db.owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`update ptw.api_session set grants = '{}' where person_id in (${P.paulo}::uuid, ${P.marina}::uuid)`
    })
    expect((await call("paulo", "GET", "/delegations")).json()).toEqual([])
    const marina = (await call("marina", "GET", "/delegations")).json()
    expect(marina.length).toBeGreaterThan(0)
    expect(marina.every((d: { delegateId: string; delegatorId: string }) => d.delegateId === P.marina || d.delegatorId === P.marina)).toBe(true)
    expect((await create(mandate({ startsAt: at(100), endsAt: at(110) }), "marina")).status).toBe(403)
  })

  it("CT-10 SPEC 003: editar sem o papel de cadastro dá 403 e fica registrado como negado", async () => {
    const [d] = (await call("ana", "GET", "/delegations")).json().filter((x: { reason: string }) => x.reason === "Treinamento NR-10")
    const denied = async () => (await db.owner`select count(*)::int as n from ptw.audit_event where action = 'delegacao.alterada' and not ok`)[0].n as number
    const before = await denied()
    const r = await edit(d, { ...fields(d), reason: "Sem permissão" }, "marina")
    expect(r.status).toBe(403)
    expect(await denied()).toBe(before + 1)
  })
})

/**
 * SPEC 002: perfis de acesso por grupo, contra o PostgreSQL de verdade (como ptw_api). As sessões de
 * Paulo e Rafael são abertas sem permissões do diretório (o dono zera `grants` da sessão, como faria
 * o LDAP sem grupos): tudo o que eles ganham vem dos perfis dos grupos, na chamada seguinte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import groupsRoutes from "../src/routes/groups.js"
import locationsRoutes from "../src/routes/registry/locations.js"
import { BASE_ROUTES, HOST, ORIGIN, cookiePair, testConfig } from "./helpers/app.js"
import { HAS_DB, T_ANA, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

describe.skipIf(!HAS_DB)("com banco: Grupos e Perfis de acesso (SPEC 002)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const x = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
  const P = { paulo: x(0x8d1), rafael: x(0x8d2), sofia: x(0x8d3), contato: x(0x8d4) }
  const T = { local: x(0x8a1), planta: x(0x8a2), cargo: x(0x8a3) }
  const L = { norte: x(0x8b1) }
  type Who = "ana" | "paulo" | "rafael"
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(who: Who, method: "GET" | "POST" | "PUT", url: string, payload?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: string; json: () => any }> {
    const headers: Record<string, string> = { ...(await as(who)), ...extra }
    if (method !== "GET" && !headers["idempotency-key"]) headers["idempotency-key"] = crypto.randomUUID()
    const res = await app.inject({ method, url: `/api/v1${url}`, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
    return { status: res.statusCode, body: res.body, json: () => res.json() }
  }
  const grantsOf = async (who: Who) => (await call(who, "GET", "/session")).json() as { grants: string[]; grantSources: { grant: string; from: string; groupId?: string }[] }
  const profile = (name: string, permissions: string[], over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), name, description: "", permissions, active: true, ...over })
  const group = (name: string, over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), name, description: "", active: true, memberIds: [], profileIds: [], plantIds: [], ...over })
  // O corpo é o do formulário: sem revisão (vai no If-Match) e sem os campos calculados do perfil.
  const put = (who: Who, path: string, body: Record<string, unknown>, revision: number) => {
    const { revision: _r, groupIds: _g, peopleCount: _p, ...input } = body
    void _r; void _g; void _p
    return call(who, "PUT", path, input, { "if-match": `"${revision}"` })
  }
  const location = (who: Who, code: string) => call(who, "POST", "/locations", { typeId: T.local, parentId: L.norte, code, name: code })

  beforeAll(async () => {
    db = await createTestDb("access_profiles")
    await db.owner.begin(async (tx) => {
      const U = T_UNIT
      await tx.unsafe(`select ptw.set_context('${U}', null, null, 'servico', 'teste', 'semente-perfis')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label, system_key) values ('${U}', '${T.planta}', 'local', 'Planta', 'planta'), ('${U}', '${T.local}', 'local', 'Área', 'area')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label) values ('${U}', '${T.cargo}', 'cargo', 'Executante')`)
      await tx.unsafe(`insert into ptw.location (unit_id, id, type_id, code, name) values ('${U}', '${L.norte}', '${T.planta}', 'PNO', 'Planta Norte')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name, login) values ('${U}', '${P.paulo}', 'Paulo Lima', 'paulo'), ('${U}', '${P.rafael}', 'Rafael Nunes', 'rafael'), ('${U}', '${P.sofia}', 'Sofia Reis', 'sofia')`)
      await tx.unsafe(`insert into ptw.person (unit_id, id, name) values ('${U}', '${P.contato}', 'Contato Sem Login')`)
    })
    app = await buildApp({
      config: testConfig({ unit: T_UNIT, db: db.config, checkResponses: true }),
      driver: postgresDriver(db.config), autoload: false, routes: [...BASE_ROUTES, groupsRoutes, locationsRoutes],
      storageProbe: async () => ({ ok: true }), logger: false,
    })
    await app.ready()
    // Ana: as 4 permissões (entrada de desenvolvimento). Paulo e Rafael: nenhuma do diretório.
    await as("ana"); await as("paulo"); await as("rafael")
    await db.owner.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`update ptw.api_session set grants = '{}' where person_id in (${P.paulo}::uuid, ${P.rafael}::uuid)`
    })
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  let cadastro: { id: string; revision: number }, admin: { id: string; revision: number }
  let norte: Record<string, unknown> & { id: string; revision: number }
  let admins: Record<string, unknown> & { id: string; revision: number }

  it("CT-01 Ana cria perfis e o grupo Cadastro Norte (perfil, planta e Paulo como membro)", async () => {
    let r = await call("ana", "POST", "/access-profiles", profile("Gestor de cadastros", ["cadastro"]))
    expect(r.status, r.body).toBe(201)
    cadastro = r.json()
    r = await call("ana", "POST", "/access-profiles", profile("Administrador", ["cadastro", "modelos", "auditoria", "exportacao"]))
    expect(r.status, r.body).toBe(201)
    admin = r.json()
    expect(await grantsOf("paulo")).toMatchObject({ grants: [] })
    expect((await location("paulo", "P-ANTES")).status).toBe(403)
    r = await call("ana", "POST", "/person-groups", group("Cadastro Norte", { profileIds: [cadastro.id], plantIds: [L.norte], memberIds: [P.paulo] }))
    expect(r.status, r.body).toBe(201)
    norte = r.json()
    expect(norte).toMatchObject({ profileIds: [cadastro.id], plantIds: [L.norte], memberIds: [P.paulo] })
    const list = (await call("ana", "GET", "/access-profiles")).json() as { id: string; groupIds: string[]; peopleCount: number }[]
    expect(list.find((p) => p.id === cadastro.id)).toMatchObject({ groupIds: [norte.id], peopleCount: 1 })
  })

  it("CT-02 Paulo, na mesma sessão aberta antes, passa a ter Gestão de cadastros pelo grupo", async () => {
    const s = await grantsOf("paulo")
    expect(s.grants).toEqual(["cadastro"])
    expect(s.grantSources).toEqual([{ grant: "cadastro", from: "grupo", groupId: norte.id, profileId: cadastro.id }])
    const r = await location("paulo", "P-DEPOIS")
    expect(r.status, r.body).toBe(201)
    const access = await call("paulo", "GET", `/people/${P.paulo}/access`)
    expect(access.json()).toEqual([{ grant: "cadastro", from: "grupo", groupId: norte.id, profileId: cadastro.id, groupName: norte.name, profileName: cadastro.name }])
  })

  it("CT-03 tirar Paulo do grupo retira a permissão na chamada seguinte", async () => {
    const r = await put("ana", `/person-groups/${norte.id}`, { ...norte, memberIds: [] }, norte.revision)
    expect(r.status, r.body).toBe(200)
    norte = r.json()
    expect((await grantsOf("paulo")).grants).toEqual([])
    expect((await location("paulo", "P-FORA")).status).toBe(403)
    expect((await call("paulo", "GET", `/people/${P.rafael}/access`)).status).toBe(403)
  })

  it("CT-04 desativar e reativar o perfil ou o grupo retira e devolve a permissão", async () => {
    let r = await put("ana", `/person-groups/${norte.id}`, { ...norte, memberIds: [P.paulo] }, norte.revision)
    norte = r.json()
    expect((await grantsOf("paulo")).grants).toEqual(["cadastro"])
    r = await put("ana", `/access-profiles/${cadastro.id}`, { ...profile("Gestor de cadastros", ["cadastro"]), id: cadastro.id, active: false }, cadastro.revision)
    expect(r.status, r.body).toBe(200)
    cadastro = r.json()
    expect((await grantsOf("paulo")).grants).toEqual([])
    r = await put("ana", `/access-profiles/${cadastro.id}`, { ...profile("Gestor de cadastros", ["cadastro"]), id: cadastro.id }, cadastro.revision)
    cadastro = r.json()
    expect((await grantsOf("paulo")).grants).toEqual(["cadastro"])
    r = await put("ana", `/person-groups/${norte.id}`, { ...norte, active: false }, norte.revision)
    norte = r.json()
    expect((await grantsOf("paulo")).grants).toEqual([])
    r = await put("ana", `/person-groups/${norte.id}`, { ...norte, active: true }, norte.revision)
    norte = r.json()
    expect((await grantsOf("paulo")).grants).toEqual(["cadastro"])
  })

  it("CT-05 quem só tem cadastro (pelo grupo) não concede o que não tem", async () => {
    // Rafael entra no grupo Cadastro Norte: passa a ter só cadastro.
    let r = await put("ana", `/person-groups/${norte.id}`, { ...norte, memberIds: [P.paulo, P.rafael] }, norte.revision)
    norte = r.json()
    expect((await grantsOf("rafael")).grants).toEqual(["cadastro"])
    r = await call("rafael", "POST", "/access-profiles", profile("Auditor", ["auditoria"]))
    expect(r.status, r.body).toBe(403)
    admins = (await call("ana", "POST", "/person-groups", group("Administradores", { profileIds: [admin.id], memberIds: [T_ANA] }))).json()
    r = await put("rafael", `/person-groups/${admins.id}`, { ...admins, memberIds: [T_ANA, P.rafael] }, admins.revision)
    expect(r.status, r.body).toBe(403)
    r = await put("rafael", `/person-groups/${norte.id}`, { ...norte, profileIds: [cadastro.id, admin.id] }, norte.revision)
    expect(r.status, r.body).toBe(403)
    const denied = await db.owner`select action from ptw.audit_event where not ok and action in ('cadastro.perfil.criado','cadastro.grupo.alterado') order by seq`
    expect(denied.length).toBeGreaterThanOrEqual(3)
    // Mas gere o que tem: o próprio grupo Cadastro Norte (nome e descrição).
    r = await put("rafael", `/person-groups/${norte.id}`, { ...norte, description: "Cadastro da Planta Norte" }, norte.revision)
    expect(r.status, r.body).toBe(200)
    norte = r.json()
  })

  it("CT-06 quem não tem cadastro pelo diretório não deixa a unidade sem ninguém com cadastro", async () => {
    // Ana (diretório) desativa Administradores: Cadastro Norte fica sendo o único grupo com cadastro.
    const off = await put("ana", `/person-groups/${admins.id}`, { ...admins, active: false }, admins.revision)
    expect(off.status, off.body).toBe(200)
    // Rafael (cadastro só pelo grupo) tenta esvaziar esse grupo: ninguém mais teria cadastro por grupo,
    // e ele não tem pelo diretório.
    const r = await put("rafael", `/person-groups/${norte.id}`, { ...norte, memberIds: [] }, norte.revision)
    expect(r.status, r.body).toBe(422)
    expect(r.json()).toMatchObject({ code: "PTA14" })
    expect((await grantsOf("rafael")).grants).toEqual(["cadastro"])
  })

  it("CT-07 revisão desatualizada: 409", async () => {
    const r = await put("ana", `/person-groups/${norte.id}`, { ...norte, description: "x" }, norte.revision - 1)
    expect(r.status).toBe(409)
  })

  it("CT-08 auditoria: perfis, vínculos, plantas e membros; cadeia íntegra", async () => {
    const actions = (await db.owner<{ action: string }[]>`select action from ptw.audit_event where ok`).map((a) => a.action)
    for (const a of ["cadastro.perfil.criado", "cadastro.perfil.alterado", "cadastro.grupo.perfil.incluido", "cadastro.grupo.planta.incluida", "cadastro.grupo.membro.incluido", "cadastro.grupo.membro.removido"]) expect(actions, a).toContain(a)
    const v = await db.owner`select ptw.audit_verify(${T_UNIT}::uuid) as broken`
    expect(v[0].broken).toBeNull()
  })
  // ---------- SPEC 007: grupos e cargos da pessoa num só passo ----------
  const revOf = async (id: string) => Number((await db.owner<{ revision: number }[]>`select revision from ptw.person where id = ${id}::uuid`)[0].revision)
  const assign = async (who: Who, personId: string, body: Record<string, unknown>, rev?: number) =>
    call(who, "PUT", `/people/${personId}/access-assignments`, body, { "if-match": `"${rev ?? await revOf(personId)}"` })
  const role = { roleId: T.cargo, scopeLocationId: L.norte, validUntil: "2026-12-31" }

  it("CT-09 SPEC 007: Ana põe Sofia no grupo e dá um cargo, numa chamada", async () => {
    const r = await assign("ana", P.sofia, { groups: [{ id: norte.id, revision: norte.revision, member: true }], roles: [role] })
    expect(r.status, r.body).toBe(200)
    const out = r.json() as { person: { roles: unknown[]; revision: number }; groups: { id: string; memberIds: string[]; revision: number }[] }
    expect(out.person.roles).toMatchObject([role])
    const g = out.groups.find((x) => x.id === norte.id)!
    expect(g.memberIds).toContain(P.sofia)
    norte = { ...norte, ...g }
    const access = await call("ana", "GET", `/people/${P.sofia}/access`)
    expect(access.json()).toMatchObject([{ grant: "cadastro", groupId: norte.id }])
  })

  it("CT-10 SPEC 007: revisão do grupo ou da pessoa desatualizada recusa sem gravar nada", async () => {
    let r = await assign("ana", P.sofia, { groups: [{ id: norte.id, revision: norte.revision - 1, member: false }], roles: [] })
    expect(r.status, r.body).toBe(409)
    expect(r.json().message).toContain(norte.name)
    r = await assign("ana", P.sofia, { groups: [], roles: [] }, (await revOf(P.sofia)) - 1)
    expect(r.status, r.body).toBe(409)
    const roles = await db.owner`select 1 from ptw.person_role where person_id = ${P.sofia}::uuid`
    expect(roles).toHaveLength(1)
  })

  it("CT-11 SPEC 007: sem login não entra em grupo; quem só tem cadastro não concede auditoria", async () => {
    let r = await assign("ana", P.contato, { groups: [{ id: norte.id, revision: norte.revision, member: true }] })
    expect(r.status, r.body).toBe(400)
    r = await assign("ana", P.contato, { groups: [], roles: [role] })
    expect(r.status, r.body).toBe(200)
    const auditor = (await call("ana", "POST", "/access-profiles", profile("Auditor", ["auditoria"]))).json()
    const auditores = (await call("ana", "POST", "/person-groups", group("Auditores", { profileIds: [auditor.id] }))).json()
    r = await assign("rafael", P.sofia, { groups: [{ id: auditores.id, revision: auditores.revision, member: true }] })
    expect(r.status, r.body).toBe(403)
  })

  it("CT-12 SPEC 007: tudo ou nada — cargo inválido desfaz a saída do grupo", async () => {
    const r = await assign("ana", P.sofia, { groups: [{ id: norte.id, revision: norte.revision, member: false }], roles: [{ ...role, roleId: x(0x8ff) }] })
    expect(r.status).toBeGreaterThanOrEqual(400)
    const g = (await call("ana", "GET", "/person-groups")).json() as { id: string; memberIds: string[] }[]
    expect(g.find((x) => x.id === norte.id)!.memberIds).toContain(P.sofia)
  })
})

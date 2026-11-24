/**
 * Cadastro (pacote F1-03): unidade, tipos, locais, ativos, relações, travas, pessoas e listas.
 *
 *  - SEM BANCO (sempre): um driver falso mostra o SQL e os argumentos que a API manda (filtro, busca,
 *    ordem e página no SQL; filhos trocados na mesma transação; contexto; erros do banco no mapa).
 *  - COM BANCO (só com PTW_TEST_DB=1): trilha de verdade, recusas do esquema, busca em 20 mil ativos.
 *    PTW10 (relação que junta duas PTs abertas) precisa de PT aberta: é provado no banco
 *    (`db/tests/invariants.sql`) e, pela API, no ciclo da PT (F1-05).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { buildApp, coverage, type RouteModule } from "../src/app.js"
import { defaultOpenapiPath } from "../src/config.js"
import { loadContract } from "../src/contract/openapi.js"
import { postgresDriver, type Tx } from "../src/db.js"
import assetsRoutes from "../src/routes/registry/assets.js"
import listsRoutes from "../src/routes/registry/optionLists.js"
import locationsRoutes from "../src/routes/registry/locations.js"
import peopleRoutes from "../src/routes/registry/people.js"
import typesRoutes from "../src/routes/registry/types.js"
import unitRoutes from "../src/routes/registry/unit.js"
import { BASE_ROUTES, HOST, ORIGIN, UNIT, cookiePair, makeApp, testConfig, type TestApp } from "./helpers/app.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { HAS_DB, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const V1 = "/api/v1"
const REGISTRY: RouteModule[] = [unitRoutes, typesRoutes, locationsRoutes, assetsRoutes, peopleRoutes, listsRoutes]
const contract = loadContract(defaultOpenapiPath())
const CADASTRO = [...contract.operations.values()].filter((o) => o.tags.includes("cadastro")).map((o) => o.operationId)

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`
const LOC = id(0xa1)
const LOC2 = id(0xa2)
const ASSET = id(0xb1)
const TYPE = id(0xc1)
const PERSON = id(0xd9)
const ROLE = id(0xe1)
const LIST = id(0xf1)
const NOW = new Date("2026-11-10T12:00:00Z")

/** O driver falso com `tx.unsafe` (o que o `postgres` oferece): a consulta de texto vira a marcada, igual para os tratadores. */
class RegDriver extends FakeDriver {
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

const locRow = (over: Record<string, unknown> = {}) => ({
  id: LOC, unit_id: UNIT, parent_id: null, type_id: TYPE, code: "A-01", name: "Área 1", aliases: ["Area um"], origin: "manual", status: "ativo",
  revision: 3, updated_at: NOW, ...over,
})
const assetRow = (over: Record<string, unknown> = {}) => ({
  id: ASSET, unit_id: UNIT, type_id: TYPE, code: "P-101", name: "Bomba 101", aliases: [], origin: "manual", status: "ativo", revision: 2, updated_at: NOW, location_ids: [LOC], ...over,
})
const personRow = (over: Record<string, unknown> = {}) => ({
  id: PERSON, unit_id: UNIT, name: "Caio Reis", company: "", employee_id: "", login: "caio", enabled: true, account_expires: null, ad_object_guid: null,
  origin: "manual", status: "ativo", revision: 5, updated_at: NOW, roles: [], ...over,
})

let t: TestApp
const open: TestApp[] = []
async function start(): Promise<TestApp> {
  const made = await makeApp({ driver: new RegDriver(), routes: REGISTRY })
  open.push(made)
  return made
}
afterEach(async () => {
  for (const x of open.splice(0)) await x.app.close()
})

type Hdr = Record<string, string>
const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, h: Hdr, payload?: unknown) =>
  t.app.inject({ method, url: V1 + url, headers: h, ...(payload === undefined ? {} : { payload: payload as object }) })
const sql = (d: FakeDriver, re: RegExp) => d.find(re).map((x) => x.statement)
const denied = (d: FakeDriver) => sql(d, /select ptw\.audit_denied\(/)

describe("contrato: as 28 operações do cadastro têm rota", () => {
  it("lista as operações e confere a cobertura", async () => {
    t = await start()
    expect(CADASTRO).toHaveLength(28)
    const { withoutRoute } = coverage(t.app)
    expect(CADASTRO.filter((o) => withoutRoute.includes(o))).toEqual([])
  })
})

describe("leitura: página, busca, filtros e ordem são SQL", () => {
  it("contagens em lote: uma consulta de conjunto, ordem, zero e 404 sem resposta parcial", async () => {
    t = await start(); const s = await t.login()
    t.driver.on(/select root.id, count\(distinct al.asset_id\)/, [{ id: LOC2, count: 0 }, { id: LOC, count: 3 }])
    const res = await call("GET", `/locations/asset-counts?locationIds=${LOC}&locationIds=${LOC2}`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.json()).toEqual({ items: [{ locationId: LOC, count: 3 }, { locationId: LOC2, count: 0 }] })
    expect(sql(t.driver, /select root.id, count/)).toHaveLength(1)
    t.driver.on(/select root.id, count/, [{ id: LOC, count: 3 }])
    expect((await call("GET", `/locations/asset-counts?locationIds=${LOC}&locationIds=${LOC2}`, s.headers)).statusCode).toBe(404)
    for (const query of ["", "?locationIds=bad", `?locationIds=${LOC}&locationIds=${LOC}`, "?" + Array.from({ length: 101 }, (_, i) => `locationIds=${id(i + 1000)}`).join("&")]) {
      expect((await call("GET", "/locations/asset-counts" + query, s.headers)).statusCode).toBe(400)
    }
    expect((await call("GET", `/locations/asset-counts?locationIds=${LOC}`, {})).statusCode).toBe(401)
  })
  it("locais: filtros, busca sem acento, ordem e página vão ao banco; a resposta segue o contrato", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/from ptw\.location l where/, () => [{ ...locRow(), _total: 120 }])
    const res = await call("GET", `/locations?q=Caf%C3%A9_50%25&parentId=root&typeId=${TYPE}&status=ativo&status=em_revisao&sort=-name&page=2&pageSize=25`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ page: 2, pageSize: 25, total: 120, items: [{ id: LOC, code: "A-01", parentId: null, revision: 3, aliases: ["Area um"] }] })
    const [st] = sql(t.driver, /from ptw\.location l/)
    expect(st!.text).toMatch(/l\.search like '%' \|\| ptw\.search_text\(\$\d+::text\) \|\| '%'/)
    expect(st!.text).toMatch(/l\.parent_id is null/)
    expect(st!.text).toMatch(/l\.status = any/)
    expect(st!.text).toMatch(/order by lower\(l\.name\) desc, l\.id limit 25 offset 50/)
    // O termo chega como foi digitado, com os curingas do `like` escapados (a normalização é do banco).
    expect(st!.params).toContain("Café\\_50\\%")
    expect(st!.params).toContain("{ativo,em_revisao}")
    expect(res.headers["etag"]).toBeUndefined()
  })

  it("página além do fim: sem linhas, o total vem de uma contagem", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/from ptw\.asset a where/, () => [])
    t.driver.on(/select count\(\*\) as n from ptw\.asset a/, () => [{ n: "7" }])
    const res = await call("GET", "/assets?page=3&pageSize=5", s.headers)
    expect(res.json()).toMatchObject({ page: 3, pageSize: 5, total: 7, items: [] })
  })

  it("ativos: busca por ids, local e abaixo, tipo; só uma consulta de página (nunca o cadastro inteiro)", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/from ptw\.asset a where/, () => [{ ...assetRow(), _total: 1 }])
    const res = await call("GET", `/assets?q=bomba&locationId=${LOC}&typeId=${TYPE}&id=${ASSET}&id=${id(0xb2)}`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    const pages = sql(t.driver, /from ptw\.asset a/)
    expect(pages).toHaveLength(1)
    expect(pages[0]!.text).toMatch(/l\.path <@ \(select r\.path from ptw\.location r/)
    expect(pages[0]!.text).toMatch(/a\.id = any \(\$\d+::uuid\[\]\)/)
    expect(pages[0]!.text).toMatch(/limit 50 offset 0/)
    expect(pages[0]!.params).toContain(`{${ASSET},${id(0xb2)}}`)
  })

  it("parentId que não é root nem uuid → 400; id fora do formato → 404 sem consultar o banco", async () => {
    t = await start()
    const s = await t.login()
    expect((await call("GET", "/locations?parentId=abc", s.headers)).statusCode).toBe(400)
    t.driver.reset()
    const res = await call("GET", "/assets/nao-e-uuid", s.headers)
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: "PTA04" })
    expect(sql(t.driver, /from ptw\.asset a/)).toHaveLength(0)
  })

  it("pessoas: eligibleAt preenche ineligible por person_ineligible; local inexistente → 404", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/select 1 from ptw\.location where/, () => [{ "?column?": 1 }])
    t.driver.on(/from ptw\.person p where/, () => [{ ...personRow(), ineligible: "conta vencida", _total: 1 }])
    const res = await call("GET", `/people?eligibleAt=${LOC}&roleId=${ROLE}&hasLogin=true&sort=-company`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ items: [{ id: PERSON, ineligible: "conta vencida" }] })
    const [st] = sql(t.driver, /ptw\.person_ineligible\(/)
    expect(st!.text).toMatch(/p\.login is not null/)
    expect(st!.text).toMatch(/order by lower\(p\.company\) desc/)
    t.driver.on(/select 1 from ptw\.location where/, () => [])
    expect((await call("GET", `/people?eligibleAt=${LOC}`, s.headers)).statusCode).toBe(404)
  })

  it("detalhe do ativo: relações, ativos do outro lado e as PTs que o prendem (parte de nos dois sentidos)", async () => {
    t = await start()
    const s = await t.login()
    const other = id(0xb2)
    t.driver.on(/from ptw\.asset a where a\.unit_id = ptw\.current_unit\(\) and a\.id = \$\d+::uuid$/, () => [assetRow()])
    t.driver.on(/from ptw\.asset_relation r/, () => [{ id: id(0x71), from_id: ASSET, to_id: other, kind_id: TYPE }])
    t.driver.on(/a\.id = any \(/, () => [assetRow({ id: other, code: "M-1" })])
    t.driver.on(/from unnest\(.*v_equipment_hold/, () => [{ asset_id: ASSET, held_id: other, asset_code: "M-1", permit_id: id(0x91), number: "PT-1", state: "ativa" }])
    const res = await call("GET", `/assets/${ASSET}`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers["etag"]).toBe('"2"')
    expect(res.json()).toMatchObject({
      asset: { id: ASSET }, relations: [{ fromId: ASSET, toId: other }], related: [{ code: "M-1" }],
      holds: [{ assetId: ASSET, heldAssetId: other, heldAssetCode: "M-1", permitId: id(0x91), state: "ativa" }],
    })
    const [h] = sql(t.driver, /v_equipment_hold/)
    expect(h!.text).toMatch(/ap\.descendant_id = i\.asset_id[\s\S]*union[\s\S]*ap\.ancestor_id = i\.asset_id/)
  })

  it("trava vista de fora: vários ativos e a PT a ignorar", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/v_equipment_hold/, () => [])
    const ex = id(0x92)
    const res = await call("GET", `/equipment-holds?assetId=${ASSET}&assetId=${id(0xb2)}&exceptPermitId=${ex}`, s.headers)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual([])
    const [h] = sql(t.driver, /v_equipment_hold/)
    expect(h!.params).toContain(`{${ASSET},${id(0xb2)}}`)
    expect(h!.params).toContain(ex)
  })

  it("unidade, tipos e listas de opções", async () => {
    t = await start()
    const s = await t.login()
    expect((await call("GET", "/unit", s.headers)).json()).toMatchObject({ code: "UN-01" })
    t.driver.on(/from ptw\.type_def t where/, () => [{ id: TYPE, family: "local", label: "Área", icon: null, system_key: null, active: true, _total: 1 }])
    const types = await call("GET", "/types?family=local&active=true&q=area", s.headers)
    expect(types.json()).toMatchObject({ total: 1, items: [{ id: TYPE, systemKey: null }] })
    expect(sql(t.driver, /from ptw\.type_def t/)[0]!.text).toMatch(/t\.family = \$\d+::ptw\.type_family/)
    t.driver.on(/from ptw\.option_list l where/, () => [{ id: LIST, name: "EPI", revision: 4, updated_at: NOW, items: [{ id: id(0x31), label: "Luva", active: true }], _total: 1 }])
    const lists = await call("GET", "/option-lists?q=epi", s.headers)
    expect(lists.json()).toMatchObject({ items: [{ id: LIST, items: [{ label: "Luva" }] }] })
  })
})

describe("escrita: contexto, idempotência, If-Match, desfazer", () => {
  it("criar ativo: 201 com ETag; locais na mesma transação; Idempotency-Key repete sem escrever de novo", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/insert into ptw\.asset \(/, () => [{ id: ASSET }])
    t.driver.on(/from ptw\.asset a where/, () => [assetRow()])
    const key = id(0x5e)
    const body = { id: ASSET, typeId: TYPE, code: "P-101", name: "Bomba 101", locationIds: [LOC, LOC2, LOC] }
    t.driver.reset()
    const a = await call("POST", "/assets", { ...s.headers, "idempotency-key": key }, body)
    expect(a.statusCode, a.body).toBe(201)
    expect(a.headers["etag"]).toBe('"2"')
    const tx = t.driver.transactions.find((x) => x.statements.some((st) => /insert into ptw\.asset \(/.test(st.text)))!
    const order = tx.statements.map((st) => st.text.slice(0, 28))
    expect(order[0]).toMatch(/^select ptw\.set_context\(/)
    expect(tx.statements.some((st) => /delete from ptw\.asset_location/.test(st.text))).toBe(true)
    const ins = tx.statements.find((st) => /insert into ptw\.asset_location/.test(st.text))!
    expect(ins.params).toContain(`{${LOC},${LOC2}}`)
    const writes = () => sql(t.driver, /insert into ptw\.asset \(/).length
    expect(writes()).toBe(1)
    const b = await call("POST", "/assets", { ...s.headers, "idempotency-key": key }, body)
    expect(b.statusCode).toBe(201)
    expect(b.headers["idempotency-replayed"]).toBe("true")
    expect(writes()).toBe(1)
  })

  it("X-Ptw-Undo vai para set_context como desfazer", async () => {
    t = await start()
    const s = await t.login()
    t.driver.on(/insert into ptw\.asset_relation/, () => [{ id: id(0x71), from_id: ASSET, to_id: LOC, kind_id: TYPE }])
    t.driver.reset()
    const res = await call("POST", "/asset-relations", { ...s.headers, "x-ptw-undo": "true" }, { id: id(0x71), fromId: ASSET, toId: LOC, kindId: TYPE })
    expect(res.statusCode, res.body).toBe(201)
    const i = t.driver.transactions.findIndex((x) => x.statements.some((st) => /insert into ptw\.asset_relation/.test(st.text)))
    expect(t.driver.contextOf(i).undo).toBe(true)
    expect(res.json()).toEqual({ id: id(0x71), fromId: ASSET, toId: LOC, kindId: TYPE })
  })

  it("PUT sem If-Match → 428; com revisão velha → 409 PTA06 com a revisão atual; certo → 200 e ETag novo", async () => {
    t = await start()
    const s = await t.login()
    const body = { typeId: TYPE, code: "P-101", name: "Bomba", locationIds: [LOC2] }
    expect((await call("PUT", `/assets/${ASSET}`, s.headers, body)).statusCode).toBe(428)
    t.driver.on(/update ptw\.asset set/, () => [])
    t.driver.on(/select revision from ptw\.asset where/, () => [{ revision: 9 }])
    const stale = await call("PUT", `/assets/${ASSET}`, { ...s.headers, "if-match": '"2"' }, body)
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ code: "PTA06", detail: "9" })
    t.driver.on(/update ptw\.asset set/, (p) => (p.includes(2) || p.includes("2") ? [{ id: ASSET }] : []))
    t.driver.on(/from ptw\.asset a where/, () => [assetRow({ revision: 3, location_ids: [LOC2] })])
    const ok = await call("PUT", `/assets/${ASSET}`, { ...s.headers, "if-match": '"2"' }, body)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.headers["etag"]).toBe('"3"')
    expect(sql(t.driver, /update ptw\.asset set/).at(-1)!.text).toMatch(/revision = \$\d+::integer/)
    // Sem a revisão nem o ativo: 404.
    t.driver.on(/update ptw\.asset set/, () => [])
    t.driver.on(/select revision from ptw\.asset where/, () => [])
    expect((await call("PUT", `/assets/${ASSET}`, { ...s.headers, "if-match": '"2"' }, body)).statusCode).toBe(404)
  })

  it("corpo fora do contrato → 400 PTA05 sem tocar nas tabelas", async () => {
    t = await start()
    const s = await t.login()
    t.driver.reset()
    const res = await call("POST", "/locations", s.headers, { code: "X" })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ code: "PTA05" })
    expect(sql(t.driver, /insert into/)).toHaveLength(0)
  })

  it("trocar cargos da pessoa: só o que mudou vira escrita (revoga, altera, concede)", async () => {
    t = await start()
    const s = await t.login()
    const keep = id(0x41)
    const drop = id(0x42)
    const r2 = id(0xe2)
    t.driver.on(/update ptw\.person set/, () => [{ id: PERSON }])
    t.driver.on(/from ptw\.person_role where/, () => [
      { id: keep, role_id: ROLE, scope_location_id: null, valid_until: "2026-12-31" },
      { id: drop, role_id: r2, scope_location_id: LOC, valid_until: "2026-12-31" },
    ])
    t.driver.on(/from ptw\.person p where/, () => [personRow({ revision: 6 })])
    t.driver.reset()
    const res = await call("PUT", `/people/${PERSON}`, { ...s.headers, "if-match": '"5"' }, {
      name: "Caio Reis",
      roles: [{ roleId: ROLE, scopeLocationId: null, validUntil: "2027-06-30" }, { roleId: r2, scopeLocationId: LOC2, validUntil: "2026-12-31" }],
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers["etag"]).toBe('"6"')
    expect(sql(t.driver, /delete from ptw\.person_role/)).toHaveLength(1)
    const upd = sql(t.driver, /update ptw\.person_role set/)
    expect(upd).toHaveLength(1)
    expect(upd[0]!.params).toContain("2027-06-30")
    const ins = sql(t.driver, /insert into ptw\.person_role/)
    expect(ins).toHaveLength(1)
    expect(ins[0]!.params).toContain(LOC2)
    // Escopo trocado = cargo revogado e outro concedido; lista vazia revoga todos (uma linha por cargo).
    t.driver.reset()
    await call("PUT", `/people/${PERSON}`, { ...s.headers, "if-match": '"5"' }, { name: "Caio Reis", roles: [] })
    expect(sql(t.driver, /delete from ptw\.person_role/)).toHaveLength(2)
  })

  it("lista de opções: itens por id e posição; item que sumiu sai; sem mudança, sem escrita", async () => {
    t = await start()
    const s = await t.login()
    const i1 = id(0x31)
    const i2 = id(0x32)
    const i3 = id(0x33)
    t.driver.on(/update ptw\.option_list set/, () => [{ id: LIST }])
    t.driver.on(/from ptw\.option_item where/, () => [
      { id: i1, label: "Luva", active: true, position: 0 },
      { id: i2, label: "Bota", active: true, position: 1 },
    ])
    t.driver.on(/from ptw\.option_list l where/, () => [{ id: LIST, name: "EPI", revision: 5, updated_at: NOW, items: [], _total: 1 }])
    t.driver.reset()
    const res = await call("PUT", `/option-lists/${LIST}`, { ...s.headers, "if-match": '"4"' }, {
      name: "EPI", items: [{ id: i3, label: "Capacete", active: true }, { id: i1, label: "Luva", active: false }],
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers["etag"]).toBe('"5"')
    expect(sql(t.driver, /delete from ptw\.option_item/).map((x) => x.params[0])).toEqual([i2])
    expect(sql(t.driver, /insert into ptw\.option_item/)).toHaveLength(1)
    const upd = sql(t.driver, /update ptw\.option_item set/)
    expect(upd).toHaveLength(1)
    expect(upd[0]!.params).toContain(i1)
  })

  it("remover lista exige If-Match; remover relação que não existe → 404; remover tipo do sistema → 422 23514", async () => {
    t = await start()
    const s = await t.login()
    expect((await call("DELETE", `/option-lists/${LIST}`, s.headers)).statusCode).toBe(428)
    t.driver.on(/delete from ptw\.option_list/, () => [{ id: LIST }])
    expect((await call("DELETE", `/option-lists/${LIST}`, { ...s.headers, "if-match": '"4"' })).statusCode).toBe(204)
    t.driver.on(/delete from ptw\.asset_relation/, () => [])
    expect((await call("DELETE", `/asset-relations/${id(0x71)}`, s.headers)).statusCode).toBe(404)
    t.driver.on(/select system_key from ptw\.type_def/, () => [{ system_key: "parte_de" }])
    const sys = await call("DELETE", `/types/${TYPE}`, s.headers)
    expect(sys.statusCode).toBe(422)
    expect(sys.json()).toMatchObject({ code: "23514" })
    expect(sql(t.driver, /delete from ptw\.type_def/)).toHaveLength(0)
    expect(denied(t.driver).at(-1)!.params).toContain("cadastro.tipo.removido")
  })
})

describe("recusas do banco: status do mapa e negação gravada com a ação da escrita", () => {
  const cases: { name: string; op: string; url: string; method: "POST" | "PUT"; body: unknown; re: RegExp; ifMatch?: boolean; code: string; message: string; status: number; action: string }[] = [
    { name: "PTW02 (local dentro de si)", op: "updateLocation", method: "PUT", url: `/locations/${LOC}`, ifMatch: true, body: { typeId: TYPE, code: "A", name: "A", parentId: LOC2 }, re: /update ptw\.location set/, code: "PTW02", message: "Um local não pode ficar dentro de si mesmo", status: 422, action: "cadastro.local.alterado" },
    { name: "PTW10 (relação junta duas PTs abertas)", op: "createAssetRelation", method: "POST", url: "/asset-relations", body: { fromId: ASSET, toId: LOC, kindId: TYPE }, re: /insert into ptw\.asset_relation/, code: "PTW10", message: "A relação juntaria duas PTs abertas no mesmo equipamento (PT-1 e PT-2)", status: 409, action: "cadastro.ativo.relacao.criada" },
    { name: "PTW11 (ciclo em parte de)", op: "createAssetRelation", method: "POST", url: "/asset-relations", body: { fromId: ASSET, toId: LOC, kindId: TYPE }, re: /insert into ptw\.asset_relation/, code: "PTW11", message: "A relação criaria um ciclo em \"parte de\"", status: 422, action: "cadastro.ativo.relacao.criada" },
    { name: "23505 (código repetido)", op: "createAsset", method: "POST", url: "/assets", body: { typeId: TYPE, code: "P-101", name: "x" }, re: /insert into ptw\.asset \(/, code: "23505", message: "duplicate key value violates unique constraint \"asset_code_uq\"", status: 409, action: "cadastro.ativo.criado" },
    { name: "23503 (lista em uso)", op: "removeOptionList", method: "PUT", url: `/option-lists/${LIST}`, body: { name: "x", items: [] }, re: /update ptw\.option_list set/, ifMatch: true, code: "23503", message: "A lista é usada pelo formulário de um modelo", status: 409, action: "cadastro.lista.alterada" },
    { name: "23514 (ícone em tipo de cargo)", op: "createType", method: "POST", url: "/types", body: { family: "cargo", label: "Emissor", icon: "x" }, re: /insert into ptw\.type_def/, code: "23514", message: "new row violates check constraint", status: 422, action: "cadastro.tipo.criado" },
  ]
  for (const c of cases) {
    it(`${c.name} → ${c.status} ${c.code}, com a recusa na trilha`, async () => {
      t = await start()
      const s = await t.login()
      t.driver.fail(c.re, { code: c.code, message: c.message })
      t.driver.reset()
      const res = await call(c.method, c.url, { ...s.headers, ...(c.ifMatch ? { "if-match": '"1"' } : {}) }, c.body)
      expect(res.statusCode, res.body).toBe(c.status)
      expect(res.json()).toMatchObject({ code: c.code, message: c.message })
      const d = denied(t.driver)
      expect(d).toHaveLength(1)
      expect(d[0]!.params.slice(0, 2)).toEqual([c.action, c.code])
      // A negação é outra transação (a da escrita foi desfeita) e também começa por set_context.
      const i = t.driver.transactions.findIndex((x) => x.statements.some((st) => /audit_denied/.test(st.text)))
      expect(t.driver.transactions[i]!.statements[0]!.text).toMatch(/^select ptw\.set_context\(/)
      expect(t.driver.transactions.some((x) => x.outcome === "rollback")).toBe(true)
    })
  }
})

// ---------------------------------------------------------------------------------------------
describe.skipIf(!HAS_DB)("com banco (PostgreSQL de verdade, como ptw_api)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  let headers: Hdr
  const T = { local: id(0x101), ativo: id(0x102), cargo: id(0x103), parte: id(0x104), alim: id(0x105) }

  const events = (action: string) =>
    db.owner<{ action: string; ok: boolean; data: Record<string, unknown>; text: string }[]>`select action, ok, data, text from ptw.audit_event where action = ${action} order by seq`
  const req = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, extra: Hdr = {}, payload?: unknown) =>
    app.inject({ method, url: V1 + url, headers: { ...headers, ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) })

  beforeAll(async () => {
    db = await createTestDb("registry")
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label, system_key) values
        ('${T_UNIT}', '${T.local}', 'local', 'Área', null), ('${T_UNIT}', '${T.ativo}', 'ativo', 'Bomba', null),
        ('${T_UNIT}', '${T.cargo}', 'cargo', 'Emissor', null), ('${T_UNIT}', '${T.parte}', 'relacao', 'Parte de', 'parte_de'),
        ('${T_UNIT}', '${T.alim}', 'relacao', 'Alimenta', null)`)
    })
    app = await buildApp({
      config: testConfig({ unit: T_UNIT, db: db.config, checkResponses: true }),
      driver: postgresDriver(db.config),
      autoload: false,
      routes: [...BASE_ROUTES, ...REGISTRY],
      storageProbe: async () => ({ ok: true }),
      logger: process.env.PTW_TEST_LOG === "1" ? { level: "error" } : false,
    })
    await app.ready()
    const res = await app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: { host: HOST, origin: ORIGIN }, payload: { login: "ana" } })
    headers = { host: HOST, origin: ORIGIN, cookie: cookiePair(res), "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  it("contagens reais incluem descendentes e inativos, deduplicam vínculos e isolam unidades", async () => {
    const root = (await req("POST", "/locations", {}, { typeId: T.local, code: "COUNT-R", name: "Raiz" })).json() as { id: string }
    const children: string[] = []
    for (let i = 0; i < 2; i++) children.push(((await req("POST", "/locations", {}, { typeId: T.local, parentId: root.id, code: `COUNT-${i}`, name: "Filho" })).json() as { id: string }).id)
    const empty = (await req("POST", "/locations", {}, { typeId: T.local, code: "COUNT-E", name: "Vazio" })).json() as { id: string }
    const made = await req("POST", "/assets", {}, { typeId: T.ativo, code: "COUNT-A", name: "Ativo compartilhado", locationIds: children, status: "inativo" })
    expect(made.statusCode, made.body).toBe(201)
    const ids = [root.id, ...children, empty.id]
    const counts = await req("GET", "/locations/asset-counts?" + ids.map(l => `locationIds=${l}`).join("&"))
    expect(counts.statusCode, counts.body).toBe(200)
    expect(counts.json()).toEqual({ items: ids.map((locationId, i) => ({ locationId, count: i === 3 ? 0 : 1 })) })
    for (const locationId of ids) {
      const assets = await req("GET", `/assets?locationId=${locationId}&pageSize=1`)
      expect(assets.json().total).toBe(counts.json().items.find((x: { locationId: string }) => x.locationId === locationId).count)
    }
    const foreign = id(0xc011)
    await db.owner.begin(async tx => {
      await tx.unsafe(`insert into ptw.unit(id,code,name) values ('${foreign}','COUNT-OTHER','Outra unidade')`)
      await tx.unsafe(`select ptw.set_context('${foreign}',null,null,'servico')`)
      await tx.unsafe(`insert into ptw.type_def(unit_id,id,family,label) values ('${foreign}','${foreign}','local','Local externo')`)
      await tx.unsafe(`insert into ptw.location(unit_id,id,type_id,code,name) values ('${foreign}','${foreign}','${foreign}','EXT','Externo')`)
    })
    for (const other of [foreign, id(0xc012)]) {
      const r = await req("GET", `/locations/asset-counts?locationIds=${root.id}&locationIds=${other}`)
      expect(r.statusCode, r.body).toBe(404)
      expect(r.json()).not.toHaveProperty("items")
    }
  })

  it("local: cria, move, recusa ciclo (PTW02) e a recusa fica na trilha", async () => {
    const a = await req("POST", "/locations", {}, { typeId: T.local, code: "L-A", name: "Fábrica" })
    expect(a.statusCode, a.body).toBe(201)
    const root = a.json() as { id: string; revision: number }
    const b = await req("POST", "/locations", {}, { typeId: T.local, code: "L-B", name: "Caldeira", parentId: root.id })
    const child = b.json() as { id: string }
    const loop = await req("PUT", `/locations/${root.id}`, { "if-match": `"${root.revision}"` }, { typeId: T.local, code: "L-A", name: "Fábrica", parentId: child.id })
    expect(loop.statusCode, loop.body).toBe(422)
    expect(loop.json()).toMatchObject({ code: "PTW02" })
    expect((await events("cadastro.local.alterado")).some((e) => e.ok === false)).toBe(true)
    const list = await req("GET", `/locations?under=${root.id}&sort=code`)
    expect((list.json() as { items: { code: string }[] }).items.map((l) => l.code)).toEqual(["L-A", "L-B"])
    const kids = await req("GET", `/locations?parentId=${root.id}`)
    expect((kids.json() as { total: number }).total).toBe(1)
  })

  it("ativo: PUT troca os locais; a trilha mostra uma linha por filho; código repetido → 409 (23505)", async () => {
    const l1 = (await req("POST", "/locations", {}, { typeId: T.local, code: "AL-1", name: "Um" })).json() as { id: string }
    const l2 = (await req("POST", "/locations", {}, { typeId: T.local, code: "AL-2", name: "Dois" })).json() as { id: string }
    const l3 = (await req("POST", "/locations", {}, { typeId: T.local, code: "AL-3", name: "Três" })).json() as { id: string }
    const made = await req("POST", "/assets", {}, { typeId: T.ativo, code: "B-1", name: "Bomba um", locationIds: [l1.id, l2.id] })
    expect(made.statusCode, made.body).toBe(201)
    const asset = made.json() as { id: string; revision: number; locationIds: string[] }
    expect(asset.locationIds.sort()).toEqual([l1.id, l2.id].sort())
    const before = {
      inc: (await events("cadastro.ativo.local.incluido")).length,
      rem: (await events("cadastro.ativo.local.removido")).length,
    }
    const put = await req("PUT", `/assets/${asset.id}`, { "if-match": `"${asset.revision}"` }, { typeId: T.ativo, code: "B-1", name: "Bomba um", locationIds: [l2.id, l3.id] })
    expect(put.statusCode, put.body).toBe(200)
    expect((put.json() as { locationIds: string[] }).locationIds.sort()).toEqual([l2.id, l3.id].sort())
    expect((await events("cadastro.ativo.local.incluido")).length - before.inc).toBe(1)
    expect((await events("cadastro.ativo.local.removido")).length - before.rem).toBe(1)
    expect((await req("PUT", `/assets/${asset.id}`, { "if-match": `"${asset.revision}"` }, { typeId: T.ativo, code: "B-1", name: "x" })).statusCode).toBe(409)
    const dup = await req("POST", "/assets", {}, { typeId: T.ativo, code: "b-1", name: "Outra" })
    expect(dup.statusCode).toBe(409)
    expect(dup.json()).toMatchObject({ code: "23505" })
  })

  it("X-Ptw-Undo grava <ação>.desfeito", async () => {
    const l = (await req("POST", "/locations", {}, { typeId: T.local, code: "U-1", name: "Desfazer" })).json() as { id: string; revision: number }
    expect((await req("PUT", `/locations/${l.id}`, { "if-match": `"${l.revision}"`, "x-ptw-undo": "true" }, { typeId: T.local, code: "U-1", name: "Voltou" })).statusCode).toBe(200)
    const e = await events("cadastro.local.alterado.desfeito")
    expect(e.length).toBeGreaterThan(0)
    expect(e.at(-1)!.text).toMatch(/^Desfazer: /)
  })

  it("relações: PTW11 (ciclo) e ordem de parte de; trava vista de fora vazia sem PT", async () => {
    const mk = async (code: string) => (await req("POST", "/assets", {}, { typeId: T.ativo, code, name: code })).json() as { id: string }
    const a = await mk("R-A")
    const b = await mk("R-B")
    const c = await mk("R-C")
    expect((await req("POST", "/asset-relations", {}, { fromId: a.id, toId: b.id, kindId: T.parte })).statusCode).toBe(201)
    expect((await req("POST", "/asset-relations", {}, { fromId: b.id, toId: c.id, kindId: T.parte })).statusCode).toBe(201)
    const cycle = await req("POST", "/asset-relations", {}, { fromId: c.id, toId: a.id, kindId: T.parte })
    expect(cycle.statusCode).toBe(422)
    expect(cycle.json()).toMatchObject({ code: "PTW11" })
    const rel = await req("GET", `/asset-relations?assetId=${b.id}`)
    expect((rel.json() as { total: number }).total).toBe(2)
    const detail = (await req("GET", `/assets/${b.id}`)).json() as { relations: unknown[]; related: { id: string }[]; holds: unknown[] }
    expect(detail.relations).toHaveLength(2)
    expect(detail.related.map((x) => x.id).sort()).toEqual([a.id, c.id].sort())
    expect((await req("GET", `/equipment-holds?assetId=${a.id}&assetId=${c.id}`)).json()).toEqual([])
    const rm = await req("DELETE", `/asset-relations/${(rel.json() as { items: { id: string }[] }).items[0]!.id}`)
    expect(rm.statusCode).toBe(204)
  })

  it("tipos: 23514 (ícone em cargo), 23503 (tipo em uso), tipo do sistema não sai (23514)", async () => {
    const bad = await req("POST", "/types", {}, { family: "cargo", label: "Vigia", icon: "x" })
    expect(bad.statusCode).toBe(422)
    expect(bad.json()).toMatchObject({ code: "23514" })
    await req("POST", "/assets", {}, { typeId: T.alim, code: "X-1", name: "x" })
    const inUse = await req("DELETE", `/types/${T.ativo}`)
    expect(inUse.statusCode).toBe(409)
    expect(inUse.json()).toMatchObject({ code: "23503" })
    const sys = await req("DELETE", `/types/${T.parte}`)
    expect(sys.statusCode).toBe(422)
    expect(sys.json()).toMatchObject({ code: "23514" })
    const ok = await req("POST", "/types", {}, { family: "cargo", label: "Vigia" })
    expect(ok.statusCode).toBe(201)
    expect((await req("PATCH", `/types/${(ok.json() as { id: string }).id}`, {}, { active: false })).json()).toMatchObject({ active: false })
  })

  it("pessoa: cargos trocados na transação, uma linha de trilha por cargo; elegibilidade por local", async () => {
    const loc = (await req("POST", "/locations", {}, { typeId: T.local, code: "P-L", name: "Local da PT" })).json() as { id: string }
    const created = await req("POST", "/people", {}, {
      name: "Caio Reis", login: "caio", roles: [{ roleId: T.cargo, scopeLocationId: null, validUntil: "2099-12-31" }],
    })
    expect(created.statusCode, created.body).toBe(201)
    const p = created.json() as { id: string; revision: number; roles: { id: string; roleId: string }[] }
    expect(p.roles).toHaveLength(1)
    const granted = (await events("cadastro.cargo.concedido")).length
    const revoked0 = (await events("cadastro.cargo.revogado")).length
    const put = await req("PUT", `/people/${p.id}`, { "if-match": `"${p.revision}"` }, { name: "Caio Reis", login: "caio", roles: [{ roleId: T.cargo, scopeLocationId: loc.id, validUntil: "2000-01-01" }] })
    expect(put.statusCode, put.body).toBe(200)
    expect((await events("cadastro.cargo.concedido")).length - granted).toBe(1)
    expect((await events("cadastro.cargo.revogado")).length - revoked0).toBe(1)
    const el = await req("GET", `/people?eligibleAt=${loc.id}&roleId=${T.cargo}&q=caio`)
    expect(el.json()).toMatchObject({ total: 1, items: [{ id: p.id, ineligible: "cargo vencido ou fora do escopo do local" }] })
    const found = await req("GET", "/people?q=CAIO&hasLogin=true")
    expect((found.json() as { total: number }).total).toBe(1)
  })

  it("lista de opções: cria, troca itens por id e posição, desativa item, remove com If-Match", async () => {
    const i1 = id(0x201)
    const i2 = id(0x202)
    const made = await req("POST", "/option-lists", {}, { name: "EPI", items: [{ id: i1, label: "Luva", active: true }, { id: i2, label: "Bota", active: true }] })
    expect(made.statusCode, made.body).toBe(201)
    const l = made.json() as { id: string; revision: number }
    const put = await req("PUT", `/option-lists/${l.id}`, { "if-match": `"${l.revision}"` }, { name: "EPI", items: [{ id: i2, label: "Bota", active: false }, { id: i1, label: "Luva", active: true }] })
    expect(put.statusCode, put.body).toBe(200)
    expect((put.json() as { items: { id: string; active: boolean }[] }).items).toEqual([{ id: i2, label: "Bota", active: false }, { id: i1, label: "Luva", active: true }])
    const cur = (put.json() as { revision: number }).revision
    expect((await req("DELETE", `/option-lists/${l.id}`)).statusCode).toBe(428)
    expect((await req("DELETE", `/option-lists/${l.id}`, { "if-match": `"${cur}"` })).statusCode).toBe(204)
    expect((await req("GET", `/option-lists/${l.id}`)).statusCode).toBe(404)
  })

  it("busca de ativo entre 20 mil: sem acento, por trecho, em menos de 50 ms", async () => {
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'carga')`)
      await tx.unsafe(`insert into ptw.asset (unit_id, type_id, code, name) select '${T_UNIT}', '${T.ativo}', 'BC-' || g, 'Bomba centrífuga ' || g from generate_series(1, 20000) g`)
    })
    // vacuum, não só analyze: a carga de 20 mil deixa o mapa de visibilidade vazio e a primeira
    // varredura ainda paga isso, o que falhava só na bateria inteira.
    await db.owner.unsafe(`vacuum (analyze) ptw.asset`)
    const ms: number[] = []
    for (let n = 0; n < 10; n++) {
      const t0 = performance.now()
      const res = await req("GET", "/assets?q=centrifuga%2019999&pageSize=20")
      ms.push(performance.now() - t0)
      expect(res.statusCode, res.body).toBe(200)
      expect((res.json() as { total: number }).total).toBe(1)
    }
    expect(Math.min(...ms)).toBeLessThan(50)
  }, 120_000)
})

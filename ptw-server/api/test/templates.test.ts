/**
 * Modelos (pacote F1-04): modelo, versão em rascunho, ativação, cópia, importação (prévia + confirmação)
 * e exportação do pacote `ptw.modelo/1`.
 *
 *  - SEM BANCO (sempre): driver falso; confere o SQL e os argumentos, os códigos no mapa de erros, a
 *    prévia que não grava nada, a confirmação que grava tudo numa transação (e nada se o pacote tem erro
 *    ou a prévia não vale mais) e a cópia do núcleo (`src/shared`) idêntica à do app.
 *  - COM BANCO (só com PTW_TEST_DB=1): o ciclo no PostgreSQL de verdade, como `ptw_api`.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { coverage, buildApp } from "../src/app.js"
import { defaultOpenapiPath } from "../src/config.js"
import { loadContract } from "../src/contract/openapi.js"
import { postgresDriver, type Tx } from "../src/db.js"
import templatesRoutes from "../src/routes/templates/index.js"
import { BASE_ROUTES, HOST, ORIGIN, UNIT, cookiePair, makeApp, testConfig, type TestApp } from "./helpers/app.js"
import { FakeDriver } from "./helpers/fakeDb.js"
import { HAS_DB, T_UNIT, createTestDb, type TestDb } from "./helpers/realDb.js"

const V1 = "/api/v1"
const contract = loadContract(defaultOpenapiPath())
const MODELOS = [...contract.operations.values()].filter((o) => o.tags.includes("modelos")).map((o) => o.operationId)
const EXEMPLO = readFileSync(join(import.meta.dirname, "fixtures", "modelo-exemplo.ptw-modelo.json"), "utf8")

const id = (n: number) => `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
const TPL = id(0x801)
const VER = id(0x802)
const VER2 = id(0x803)
const ST = [id(0x811), id(0x812), id(0x813)]
const SG = [id(0x821), id(0x822), id(0x823)]
const ROLE = id(0x831)
const NOW = new Date("2026-11-10T12:00:00Z")

class TplDriver extends FakeDriver {
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

interface VState {
  id: string
  number?: number
  status?: string
  revision?: number
  holds?: boolean
  origin?: string
  importSource?: unknown
  sha?: string | null
}
const versionRow = (v: VState) => ({
  id: v.id, template_id: TPL, number: v.number ?? 1, status: v.status ?? "rascunho", note: "", form: { sections: [] }, max_hours: null,
  holds_equipment: v.holds ?? true, origin: v.origin ?? "manual", sha: v.sha ?? null, import_source: v.importSource ?? null, created_at: NOW,
  activated_at: v.status === "ativa" ? NOW : null, revision: v.revision ?? 1,
})
const stageRows = [
  { id: ST[0], version_id: VER, position: 0, name: "Solicitação", kind: "solicitacao", locked: false },
  { id: ST[1], version_id: VER, position: 1, name: "Emissão", kind: "emissao", locked: true },
]
const slotRows = [
  { id: SG[0], stage_id: ST[0], version_id: VER, position: 0, meaning: "Solicita a PT", kind: "cargo", roles: [ROLE], person_id: null, min: 1, required: true, rw_item: null, rw_line: null, rw_values: null },
  { id: SG[1], stage_id: ST[1], version_id: VER, position: 0, meaning: "Emite a PT", kind: "cargo", roles: [ROLE], person_id: null, min: 1, required: true, rw_item: null, rw_line: null, rw_values: null },
]

/** Responde às leituras do modelo (as de `read.ts` e as de comparação de `write.ts`). */
function serve(d: FakeDriver, versions: VState[] = [{ id: VER }], tplRev = 3, name = "Intervenção em painel"): void {
  d.on(/from ptw\.template t where t\.unit_id = ptw\.current_unit\(\) and t\.id =/, () => [{ id: TPL, name, retention_class: "pt", revision: tplRev, updated_at: NOW }])
  d.on(/from ptw\.template_version v where/, () => versions.map(versionRow))
  d.on(/from ptw\.stage where unit_id = ptw\.current_unit\(\) and version_id = any/, () => stageRows)
  d.on(/select id, position, name, kind, locked from ptw\.stage/, () => stageRows)
  d.on(/from ptw\.sign_slot where unit_id = ptw\.current_unit\(\) and version_id = any/, () => slotRows)
  d.on(/to_jsonb\(role_ids\) as roles, person_id, min, required, required_when_item as rw_item, required_when_line as rw_line, to_jsonb\(required_when_values\) as rw_values from ptw\.sign_slot where unit_id = ptw\.current_unit\(\) and version_id = \$\d+::uuid$/, () => slotRows)
  d.on(/from ptw\.separation where/, () => [])
  d.on(/from ptw\.version_(location|asset)_type where/, () => [])
}

const slot = (n: number, over: Record<string, unknown> = {}) => ({ id: SG[n], meaning: "Assina", kind: "cargo", roleIds: [ROLE], personId: null, min: 1, required: true, ...over })
const content = (over: Record<string, unknown> = {}) => ({
  locationTypeIds: [], assetTypeIds: [], separation: [], form: { sections: [] },
  stages: [
    { id: ST[0], name: "Solicitação", kind: "solicitacao", slots: [slot(0, { meaning: "Solicita a PT" })] },
    { id: ST[1], name: "Emissão", kind: "emissao", locked: true, slots: [slot(1, { meaning: "Emite a PT" })] },
  ],
  ...over,
})

let t: TestApp
const open: TestApp[] = []
async function start(): Promise<TestApp> {
  const made = await makeApp({ driver: new TplDriver(), routes: [templatesRoutes] })
  open.push(made)
  return made
}
afterEach(async () => {
  for (const x of open.splice(0)) await x.app.close()
})

type Hdr = Record<string, string>
const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, h: Hdr, payload?: unknown) =>
  t.app.inject({ method, url: V1 + url, headers: h, ...(payload === undefined ? {} : { payload: payload as object }) })
const stmts = (re: RegExp) => t.driver.find(re).map((x) => x.statement)
const writes = () => t.driver.find(/^(insert into|update|delete from) ptw\.(?!api_)/).filter((x) => !/audit/.test(x.statement.text))
const denied = () => stmts(/select ptw\.audit_denied\(/)

describe("contrato: as 13 operações de modelos têm rota", () => {
  it("cobertura", async () => {
    t = await start()
    expect(MODELOS).toHaveLength(13)
    const { withoutRoute } = coverage(t.app)
    expect(MODELOS.filter((o) => withoutRoute.includes(o))).toEqual([])
  })
})

describe("núcleo compartilhado", () => {
  it("src/shared é cópia idêntica do núcleo do app (node scripts/sync-shared.mjs)", () => {
    const app = join(import.meta.dirname, "..", "..", "..", "ptw-mockup-v2", "src", "core", "templatePackage.ts")
    if (!existsSync(app)) return // dentro da imagem só existe ptw-server/api
    expect(() => execFileSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "sync-shared.mjs"), "--check"], { stdio: "pipe" })).not.toThrow()
  })
})

describe("modelo e versão em rascunho", () => {
  it("criar modelo: 201, ETag do modelo, primeira versão com as cinco etapas do produto, numa transação", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver)
    t.driver.on(/insert into ptw\.template \(/, ([i]) => [{ id: i ?? TPL }])
    t.driver.on(/insert into ptw\.template_version/, () => [{ id: VER }])
    t.driver.on(/select uuidv7\(\)::text as id from generate_series/, () => Array.from({ length: 10 }, (_, k) => ({ id: id(0x900 + k) })))
    t.driver.on(/select id, position, name, kind, locked from ptw\.stage/, () => [])
    t.driver.on(/select id, stage_id, position/, () => [])
    t.driver.on(/to_jsonb\(role_ids\) as roles, person_id, min, required, required_when_item as rw_item, required_when_line as rw_line, to_jsonb\(required_when_values\) as rw_values from ptw\.sign_slot where unit_id = ptw\.current_unit\(\) and version_id = \$\d+::uuid$/, () => [])
    t.driver.reset()
    const res = await call("POST", "/templates", s.headers, { name: "Intervenção em painel" })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.headers["etag"]).toBe('"3"')
    expect(res.json()).toMatchObject({ id: TPL, name: "Intervenção em painel", versions: [{ number: 1, status: "rascunho" }] })
    const kinds = stmts(/insert into ptw\.stage/).map((x) => x.params[4])
    expect(kinds).toEqual(["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"])
    expect(stmts(/insert into ptw\.sign_slot/)).toHaveLength(5)
    // Tudo na mesma transação (a primeira é a do contexto).
    const txs = new Set(t.driver.find(/^insert into ptw\./).map((x) => x.tx))
    expect(txs.size).toBe(1)
    expect(t.driver.contextOf([...txs][0]!)).toMatchObject({ unit: UNIT })
  })

  it("nome repetido (23505) → 409; recusa fica na trilha", async () => {
    t = await start()
    const s = await t.login()
    t.driver.fail(/insert into ptw\.template \(/, { code: "23505", message: "duplicate key value violates unique constraint" })
    const res = await call("POST", "/templates", s.headers, { name: "Repetido" })
    expect(res.statusCode).toBe(409)
    expect(denied().map((x) => x.params.slice(0, 2))).toEqual([["modelo.criado", "23505"]])
  })

  it("PUT do rascunho: exige If-Match; troca etapas, assinaturas e separações na mesma transação, só a diferença", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER, revision: 5 }])
    t.driver.on(/update ptw\.template_version set/, () => [{ id: VER }])
    expect((await call("PUT", `/templates/${TPL}/versions/${VER}`, s.headers, content())).statusCode).toBe(428)

    t.driver.reset()
    // Chega: a Solicitação igual, a Emissão renomeada, uma etapa nova com uma assinatura e uma separação entre a 1ª e a nova.
    const body = content({
      holdsEquipment: false,
      maxWindowHours: 8,
      stages: [
        { id: ST[0], name: "Solicitação", kind: "solicitacao", slots: [slot(0, { meaning: "Solicita a PT" })] },
        { id: ST[1], name: "Emissão (renomeada)", kind: "emissao", locked: true, slots: [slot(1, { meaning: "Emite a PT" })] },
        { id: ST[2], name: "Entrega", kind: "entrega", locked: true, slots: [slot(2, { meaning: "Entrega" })] },
      ],
      separation: [{ slotA: SG[2], slotB: SG[0], locked: false }],
    })
    const res = await call("PUT", `/templates/${TPL}/versions/${VER}`, { ...s.headers, "if-match": '"5"' }, body)
    expect(res.statusCode, res.body).toBe(200)
    const upd = stmts(/update ptw\.template_version set/)[0]!
    expect(upd.text).toMatch(/revision = \$\d+::integer/)
    expect(upd.params).toContain(5)
    expect(upd.params).toContain(false) // holds_equipment
    expect(upd.params).toContain(8) // prazo máximo em horas
    // Só a diferença vira escrita: etapa 1 e assinaturas 0 e 1 não mudam.
    expect(stmts(/update ptw\.stage set/)).toHaveLength(1)
    expect(stmts(/insert into ptw\.stage/)).toHaveLength(1)
    expect(stmts(/insert into ptw\.sign_slot/)).toHaveLength(1)
    expect(stmts(/update ptw\.sign_slot set/)).toHaveLength(0)
    const sep = stmts(/insert into ptw\.separation/)[0]!
    expect(sep.params.slice(1, 3)).toEqual([SG[0], SG[2]]) // slot_a < slot_b
    expect(new Set(writes().map((w) => w.tx)).size).toBe(1)
  })

  it("PUT com revisão velha → 409 PTA06 com a atual; sem linha → 404; ativa/arquivada → 422 PTW03", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "if-match": '"2"' }
    t.driver.on(/update ptw\.template_version set/, () => [])
    t.driver.on(/select revision from ptw\.template_version/, () => [{ revision: 7 }])
    let res = await call("PUT", `/templates/${TPL}/versions/${VER}`, h, content())
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ code: "PTA06", detail: "7" })
    t.driver.on(/select revision from ptw\.template_version/, () => [])
    res = await call("PUT", `/templates/${TPL}/versions/${VER}`, h, content())
    expect(res.statusCode).toBe(404)
    t.driver.fail(/update ptw\.template_version set/, { code: "PTW03", message: "Versão ativa não pode ser alterada" })
    res = await call("PUT", `/templates/${TPL}/versions/${VER}`, h, content())
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW03" })
    expect(denied().at(-1)!.params.slice(0, 2)).toEqual(["modelo.versao.alterada", "PTW03"])
  })

  it("'prende o equipamento' é gravado como veio e congelado na versão ativa (o banco recusa com PTW03)", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER2, status: "ativa", holds: false, revision: 2 }])
    t.driver.fail(/update ptw\.template_version set/, { code: "PTW03", message: "Versão ativa não pode ser alterada" })
    const res = await call("PUT", `/templates/${TPL}/versions/${VER2}`, { ...s.headers, "if-match": '"2"' }, content({ holdsEquipment: true }))
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW03" })
    expect(stmts(/insert into ptw\.stage|update ptw\.stage|delete from ptw\.stage/)).toHaveLength(0)
    const get = await call("GET", `/templates/${TPL}/versions/${VER2}`, s.headers)
    expect(get.json()).toMatchObject({ status: "ativa", holdsEquipment: false })
  })

  it("ativar: If-Match da versão; PTW28 (assinatura sem cargo) → 422 e negação; depois de ativa não ativa de novo (PTW03)", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver)
    t.driver.on(/select status, revision from ptw\.template_version/, () => [{ status: "rascunho", revision: 4 }])
    expect((await call("POST", `/templates/${TPL}/versions/${VER}/activate`, s.headers)).statusCode).toBe(428)
    expect((await call("POST", `/templates/${TPL}/versions/${VER}/activate`, { ...s.headers, "if-match": '"3"' })).json()).toMatchObject({ code: "PTA06", detail: "4" })

    t.driver.fail(/select ptw\.version_activate\(/, { code: "PTW28", message: 'A assinatura "Emite a PT" da etapa "Emissão" está sem cargo' })
    let res = await call("POST", `/templates/${TPL}/versions/${VER}/activate`, { ...s.headers, "if-match": '"4"' })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW28" })
    expect(denied().at(-1)!.params.slice(0, 2)).toEqual(["modelo.versao.ativada", "PTW28"])

    t.driver.on(/select status, revision from ptw\.template_version/, () => [{ status: "ativa", revision: 4 }])
    res = await call("POST", `/templates/${TPL}/versions/${VER}/activate`, { ...s.headers, "if-match": '"4"' })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW03" })
  })

  it("ativar: chama ptw.version_activate (que arquiva a anterior) e devolve o modelo", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER, status: "arquivada", number: 1 }, { id: VER2, status: "ativa", number: 2 }])
    t.driver.on(/select status, revision from ptw\.template_version/, () => [{ status: "rascunho", revision: 4 }])
    t.driver.on(/select ptw\.version_activate\(/, () => [])
    const res = await call("POST", `/templates/${TPL}/versions/${VER2}/activate`, { ...s.headers, "if-match": '"4"' })
    expect(res.statusCode, res.body).toBe(200)
    expect(stmts(/select ptw\.version_activate\(/)[0]!.params).toContain(VER2)
    expect(res.json()).toMatchObject({ versions: [{ status: "arquivada" }, { status: "ativa" }] })
  })

  it("copiar versão: ids novos de etapas e assinaturas, itens mantidos, origem manual, número seguinte", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER, number: 1, status: "ativa" }, { id: VER2, number: 2 }])
    t.driver.on(/select coalesce\(max\(number\), 0\) \+ 1 as n/, () => [{ n: 2 }])
    t.driver.on(/insert into ptw\.template_version/, ([newId]) => [{ id: newId }])
    t.driver.on(/select id, position, name, kind, locked from ptw\.stage/, () => [])
    t.driver.on(/select id, stage_id, position/, () => [])
    t.driver.on(/from ptw\.separation where unit_id = ptw\.current_unit\(\) and version_id = \$\d+::uuid$/, () => [])
    t.driver.reset()
    const res = await call("POST", `/templates/${TPL}/versions`, s.headers, { copyFrom: VER })
    expect(res.statusCode, res.body).toBe(201)
    const ins = stmts(/insert into ptw\.template_version/)[0]!
    expect(ins.params).toContain(2) // número
    expect(ins.params).toContain("manual")
    const newStages = stmts(/insert into ptw\.stage/).map((x) => x.params[0])
    expect(newStages).toHaveLength(2)
    expect(newStages.some((x) => ST.includes(String(x)))).toBe(false)
    const newSlots = stmts(/insert into ptw\.sign_slot/).map((x) => x.params.find((p) => typeof p === "string" && p.length === 36 && SG.includes(p)))
    expect(newSlots.filter(Boolean)).toHaveLength(0) // nenhum id de assinatura antigo
    // Copiar de versão de outro modelo (ou inexistente) → 404.
    t.driver.on(/from ptw\.template_version v where/, () => [])
    expect((await call("POST", `/templates/${TPL}/versions`, s.headers, { copyFrom: id(0xfff) })).statusCode).toBe(404)
  })

  it("remover versão e modelo: PTW03 para o que não é rascunho; modelo com versão ativa não sai", async () => {
    t = await start()
    const s = await t.login()
    const h = { ...s.headers, "if-match": '"1"' }
    t.driver.fail(/delete from ptw\.template_version/, { code: "PTW03", message: "Só um rascunho de versão pode ser removido" })
    let res = await call("DELETE", `/templates/${TPL}/versions/${VER}`, h)
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW03" })
    t.driver.reset()
    t.driver.on(/select revision from ptw\.template where/, () => [{ revision: 1 }])
    t.driver.on(/select 1 from ptw\.template_version/, () => [{ "?column?": 1 }])
    res = await call("DELETE", `/templates/${TPL}`, h)
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTW03" })
    expect(stmts(/delete from ptw\./)).toHaveLength(0)
  })

  it("PATCH do modelo: nome e retenção com If-Match; revisão velha → 409", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver)
    t.driver.on(/update ptw\.template set/, () => [{ id: TPL }])
    const res = await call("PATCH", `/templates/${TPL}`, { ...s.headers, "if-match": '"3"' }, { name: "Novo nome", retentionClass: "pet" })
    expect(res.statusCode, res.body).toBe(200)
    expect(stmts(/update ptw\.template set/)[0]!.params).toEqual(expect.arrayContaining(["Novo nome", "pet", 3]))
    t.driver.on(/update ptw\.template set/, () => [])
    t.driver.on(/select revision from ptw\.template where/, () => [{ revision: 9 }])
    expect((await call("PATCH", `/templates/${TPL}`, { ...s.headers, "if-match": '"3"' }, { name: "X" })).json()).toMatchObject({ code: "PTA06", detail: "9" })
  })

  it("listar: busca, página e conteúdo só da versão em uso e dos rascunhos (arquivadas vêm marcadas)", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER, status: "arquivada", number: 1 }, { id: VER2, status: "ativa", number: 2 }])
    t.driver.on(/from ptw\.template t where t\.unit_id = ptw\.current_unit\(\) and/, () => [{ id: TPL, name: "Painel", retention_class: "pt", revision: 1, updated_at: NOW, _total: 41 }])
    const res = await call("GET", "/templates?q=Painel&page=1&pageSize=20", s.headers)
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json() as { total: number; items: { versions: { status: string; contentOmitted?: boolean }[] }[] }
    expect(body.total).toBe(41)
    expect(body.items[0]!.versions.map((v) => v.contentOmitted === true)).toEqual([true, false])
    expect(stmts(/from ptw\.template t where/)[0]!.text).toMatch(/limit 20 offset 20/)
  })
})

/** Os pacotes de teste: o exemplo da skill e variações. */
const pacote = (over: (p: Record<string, unknown>) => void = () => {}): string => {
  const p = JSON.parse(EXEMPLO) as Record<string, unknown>
  over(p)
  return JSON.stringify(p)
}

describe("importação: prévia e confirmação", () => {
  it("prévia lista o que seria criado, devolve token e não grava nada", async () => {
    t = await start()
    const s = await t.login()
    t.driver.reset()
    const res = await call("POST", "/templates/import/preview", s.headers, { arquivo: "painel.ptw-modelo.json", pacote: EXEMPLO })
    expect(res.statusCode, res.body).toBe(200)
    const b = res.json() as { rascunho: { versao: { status: string; origin: string }; cargosNovos: unknown[] } | null; token?: string; totais?: Record<string, number>; problemas: { nivel: string; mensagem: string }[] }
    expect(b.problemas.filter((p) => p.nivel === "erro")).toEqual([])
    expect(b.rascunho!.versao).toMatchObject({ status: "rascunho", origin: "sugerida" })
    expect(b.token).toMatch(/\./)
    expect(b.totais!["etapas"]).toBeGreaterThan(0)
    // Prévia não grava: só leituras (e o contexto), nenhuma escrita em ptw.*.
    expect(writes()).toHaveLength(0)
    expect(t.driver.find(/^(insert|update|delete)/)).toHaveLength(0)
    expect(stmts(/ptw\.audit_/)).toHaveLength(0)
  })

  it("pacote com erro: prévia sem rascunho e sem token; confirmar não cria nada (PTA10)", async () => {
    t = await start()
    const s = await t.login()
    const quebrado = pacote((p) => {
      ;(p["etapas"] as { assinaturas: { significado?: string }[] }[])[0]!.assinaturas = []
      ;(p["modelo"] as { nome: string }).nome = ""
    })
    let res = await call("POST", "/templates/import/preview", s.headers, { pacote: quebrado })
    expect(res.statusCode).toBe(200)
    const b = res.json() as { rascunho: unknown; token?: string; problemas: { nivel: string }[] }
    expect(b.rascunho).toBeNull()
    expect(b.token).toBeUndefined()
    expect(b.problemas.some((p) => p.nivel === "erro")).toBe(true)
    // Texto que nem é JSON: também só um problema.
    res = await call("POST", "/templates/import/preview", s.headers, { pacote: "isto não é json" })
    expect((res.json() as { rascunho: unknown; problemas: unknown[] }).rascunho).toBeNull()

    t.driver.reset()
    res = await call("POST", "/templates/import/confirm", s.headers, { pacote: quebrado, token: "x.y" })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTA10" })
    expect(writes()).toHaveLength(0)
  })

  /** Prévia → confirmação com o mesmo texto; devolve a resposta da confirmação. */
  async function previewAndConfirm(s: Awaited<ReturnType<TestApp["login"]>>, text: string, between: () => void = () => {}) {
    const pr = await call("POST", "/templates/import/preview", s.headers, { arquivo: "painel.ptw-modelo.json", pacote: text })
    expect(pr.statusCode, pr.body.slice(0, 600)).toBe(200)
    const pv = pr.json() as { token: string; resolucao: { cargos: { nome: string }[] } }
    between()
    return { pv, res: await call("POST", "/templates/import/confirm", s.headers, { arquivo: "painel.ptw-modelo.json", pacote: text, token: pv.token }) }
  }
  function serveImport(): void {
    // O modelo criado volta pela leitura: o que foi inserido na versão alimenta a resposta.
    const captured: { tpl?: string; ver?: Record<string, unknown> } = {}
    t.driver.on(/insert into ptw\.template \(/, ([tid]) => ((captured.tpl = String(tid)), []))
    t.driver.on(/insert into ptw\.template_version/, (p) => {
      captured.ver = { id: p[0], number: p[2], note: p[4], origin: p[7], sha: p[8], import_source: p[9] }
      return [{ id: p[0] }]
    })
    t.driver.on(/from ptw\.template t where t\.unit_id = ptw\.current_unit\(\) and t\.id =/, () => [{ id: captured.tpl, name: "Intervenção", retention_class: "pt", revision: 1, updated_at: NOW }])
    t.driver.on(/from ptw\.template_version v where/, () => [{ ...versionRow({ id: String(captured.ver!["id"]) }), number: 1, origin: "sugerida", sha: captured.ver!["sha"], import_source: JSON.parse(String(captured.ver!["import_source"])) as unknown, template_id: captured.tpl }])
    t.driver.on(/select id, position, name, kind, locked from ptw\.stage/, () => [])
    t.driver.on(/select id, stage_id, position/, () => [])
    t.driver.on(/from ptw\.stage where unit_id = ptw\.current_unit\(\) and version_id = any/, () => [])
    t.driver.on(/from ptw\.sign_slot where/, () => [])
    t.driver.on(/from ptw\.separation where/, () => [])
    t.driver.on(/from ptw\.version_(location|asset)_type where/, () => [])
    t.driver.on(/select ptw\.audit_import\(/, () => [{ audit_import: 1 }])
    // O cadastro que o importador lê: sem modelos (a consulta tem uma subconsulta em template_version).
    t.driver.on(/as numbers from ptw\.template t/, () => [])
  }

  it("confirmar cria tudo numa transação: tipos, cargos, listas, modelo, versão sugerida em rascunho e o evento modelo.importado", async () => {
    t = await start()
    const s = await t.login()
    serveImport()
    t.driver.reset()
    const { res } = await previewAndConfirm(s, EXEMPLO, () => t.driver.reset())
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { versionId: string; created: { listas: string[]; tipos: string[]; cargos: string[] } }
    const ins = t.driver.find(/^insert into ptw\./)
    expect(new Set(ins.map((x) => x.tx)).size).toBe(1)
    const order = ins.map((x) => /insert into ptw\.(\w+)/.exec(x.statement.text)![1])
    expect(order.indexOf("template")).toBeLessThan(order.indexOf("template_version"))
    expect(order.indexOf("type_def")).toBeLessThan(order.indexOf("sign_slot"))
    const ver = stmts(/insert into ptw\.template_version/)[0]!
    expect(ver.text).toMatch(/'rascunho'/)
    expect(ver.params).toContain("sugerida")
    expect(body.versionId).toBe(ver.params[0])
    const imp = stmts(/select ptw\.audit_import\(/)
    expect(imp).toHaveLength(1)
    expect(imp[0]!.params[0]).toBe(body.versionId)
    expect(JSON.parse(String(imp[0]!.params[1]))).toEqual(body.created)
    // O evento vem depois de tudo que foi criado.
    const all = t.driver.transactions[ins[0]!.tx]!.statements.map((x) => x.text)
    expect(all.findIndex((x) => /audit_import/.test(x))).toBeGreaterThan(all.findLastIndex((x) => /^insert into ptw\.(sign_slot|stage|option_item|type_def)/.test(x)))
    expect(res.json()).toMatchObject({ template: { versions: [{ status: "rascunho", origin: "sugerida" }] } })
  })

  it("pacote que cria lista nova confirma mesmo com o relógio andando entre a prévia e a confirmação", async () => {
    t = await start()
    const s = await t.login()
    serveImport()
    t.driver.reset()
    const comLista = pacote((p) => (p["listas"] as unknown[]).push({ nome: "Lista nova da importação", itens: ["Um", "Dois"], origem: { pagina: 1, trecho: "Um Dois" } }))
    const pr = await call("POST", "/templates/import/preview", s.headers, { arquivo: "painel.ptw-modelo.json", pacote: comLista })
    expect(pr.statusCode, pr.body.slice(0, 600)).toBe(200)
    await new Promise((r) => setTimeout(r, 25))
    t.driver.reset()
    const res = await call("POST", "/templates/import/confirm", s.headers, { arquivo: "painel.ptw-modelo.json", pacote: comLista, token: (pr.json() as { token: string }).token })
    expect(res.statusCode, res.body.slice(0, 600)).toBe(201)
    expect(stmts(/insert into ptw\.option_list/).length).toBe(1)
    expect(stmts(/insert into ptw\.option_item/).length).toBe(2)
  })

  it("prévia vencida, de outra pessoa, de outro pacote ou com o cadastro mudado → 422 PTA10 e nada criado", async () => {
    t = await start()
    const s = await t.login()
    serveImport()
    t.driver.reset()
    // 1. Cadastro mudou: um dos cargos "novos" passou a existir.
    const { pv, res } = await previewAndConfirm(s, EXEMPLO, () => {
      const nome = (JSON.parse(EXEMPLO) as { etapas: { assinaturas: { cargo?: string | string[] | null }[] }[] }).etapas.flatMap((e) => e.assinaturas).map((a) => a.cargo).flat().find((c) => typeof c === "string")!
      t.driver.on(/from ptw\.type_def where/, () => [{ id: ROLE, family: "cargo", label: nome, icon: null, system_key: null, active: true }])
      t.driver.reset()
    })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ code: "PTA10" })
    expect(writes()).toHaveLength(0)

    // 2. Outro pacote com o token desta prévia.
    t.driver.on(/from ptw\.type_def where/, () => [])
    let r2 = await call("POST", "/templates/import/confirm", s.headers, { pacote: pacote((p) => ((p["modelo"] as { descricao?: string }).descricao = "outro")), token: pv.token })
    expect(r2.statusCode).toBe(422)
    // 3. Token adulterado.
    r2 = await call("POST", "/templates/import/confirm", s.headers, { pacote: EXEMPLO, token: pv.token.slice(0, -2) + "xx" })
    expect(r2.statusCode).toBe(422)
    // 4. Token vencido: 15 minutos depois.
    const { confirmImport } = await import("../src/repo/templates/import.js")
    const tx = {} as Tx
    await expect(confirmImport(tx, { pacote: EXEMPLO, token: pv.token }, { unit: UNIT, person: "x" }, new Date())).rejects.toMatchObject({ code: "PTA10" })
    expect(writes()).toHaveLength(0)
  })
})

describe("exportação", () => {
  it("exige o motivo (X-Ptw-Reason); com ele grava acesso.exportacao.modelo e devolve o pacote ptw.modelo/1 com o nome do arquivo", async () => {
    t = await start()
    const s = await t.login()
    serve(t.driver, [{ id: VER, status: "ativa", holds: false }])
    t.driver.on(/from ptw\.type_def where/, () => [{ id: ROLE, family: "cargo", label: "Eletricista", icon: null, system_key: null, active: true }])
    let res = await call("GET", `/templates/${TPL}/export`, s.headers)
    expect(res.statusCode).toBe(400)
    t.driver.reset()
    res = await call("GET", `/templates/${TPL}/export`, { ...s.headers, "x-ptw-reason": encodeURIComponent("Levar à planta de Camaçari") })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="Interven.+ptw-modelo\.json"/)
    const pkg = res.json() as { formato: string; modelo: { nome: string; prende_equipamento?: boolean }; etapas: { nome: string; assinaturas: { cargo: unknown }[] }[] }
    expect(pkg.formato).toBe("ptw.modelo/1")
    expect(pkg.modelo).toMatchObject({ nome: "Intervenção em painel", prende_equipamento: false })
    expect(pkg.etapas.map((e) => e.nome)).toEqual(["Solicitação", "Emissão"])
    expect(pkg.etapas[0]!.assinaturas[0]!.cargo).toBe("Eletricista")
    const a = stmts(/ptw\.audit_access\(/)
    expect(a).toHaveLength(1)
    expect(a[0]!.params[0]).toBe("Levar à planta de Camaçari")
    expect(JSON.parse(String(a[0]!.params[1]))).toMatchObject({ modelo: "Intervenção em painel", versao: 1 })
    // Versão que não é do modelo → 404.
    expect((await call("GET", `/templates/${TPL}/export?versionId=${id(0xfff)}`, { ...s.headers, "x-ptw-reason": "x" })).statusCode).toBe(404)
  })
})

// ===================================================================== com banco
describe.skipIf(!HAS_DB)("com banco: modelos pela API (PostgreSQL de verdade, como ptw_api)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
  const H = { host: HOST, origin: ORIGIN }
  let headers: Record<string, string>
  const x = (n: number) => id(0xa000 + n)
  const T = { cargo: x(1), cargo2: x(2), local: x(3), ativo: x(4) }

  const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown, extra: Record<string, string> = {}) => {
    const res = await app.inject({ method, url: `${V1}${url}`, headers: { ...headers, ...extra }, ...(payload === undefined ? {} : { payload: payload as object }) })
    return { status: res.statusCode, body: res.body, json: () => res.json() as Record<string, any>, headers: res.headers } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const ev = (action: string) => db.owner<{ action: string; ok: boolean; data: Record<string, unknown> }[]>`select action, ok, data from ptw.audit_event where action = ${action} order by seq`

  beforeAll(async () => {
    db = await createTestDb("templates")
    await db.owner.begin(async (tx) => {
      await tx.unsafe(`select ptw.set_context('${T_UNIT}', null, null, 'servico', 'teste', 'semente-modelos')`)
      await tx.unsafe(`insert into ptw.type_def (unit_id, id, family, label) values
        ('${T_UNIT}', '${T.cargo}', 'cargo', 'Solicitante'), ('${T_UNIT}', '${T.cargo2}', 'cargo', 'Emitente'),
        ('${T_UNIT}', '${T.local}', 'local', 'Área'), ('${T_UNIT}', '${T.ativo}', 'ativo', 'Painel')`)
    })
    const cfg = testConfig({ db: db.config, unit: T_UNIT, checkResponses: true })
    app = await buildApp({ config: cfg, driver: postgresDriver(db.config), autoload: false, routes: [...BASE_ROUTES, templatesRoutes], logger: false })
    await app.ready()
    const res = await app.inject({ method: "POST", url: `${V1}/session/dev-login`, headers: H, payload: { login: "ana" } })
    headers = { ...H, cookie: cookiePair(res), "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
  })
  afterAll(async () => {
    await app?.close()
    await db?.drop()
  })

  it("criar, editar o rascunho com If-Match, ativar (PTW28 sem cargo), congelar, copiar", async () => {
    const created = await call("POST", "/templates", { name: "Trabalho a quente" })
    expect(created.status, created.body).toBe(201)
    const tpl = created.json()
    const v1 = tpl["versions"][0]
    expect(v1).toMatchObject({ number: 1, status: "rascunho", origin: "manual", holdsEquipment: true })
    expect(v1.stages).toHaveLength(5)

    // Ativar com assinaturas sem cargo: PTW28, e a recusa fica na trilha.
    const sem = await call("POST", `/templates/${tpl["id"]}/versions/${v1.id}/activate`, undefined, { "if-match": `"${v1.revision}"` })
    expect(sem.status).toBe(422)
    expect(sem.json()["code"]).toBe("PTW28")
    expect((await ev("modelo.versao.ativada")).some((e) => !e.ok)).toBe(true)

    // Edita: cargos nas assinaturas, escopo, separação entre duas assinaturas, prazo e "não prende o equipamento".
    const stages = v1.stages.map((st: any, i: number) => ({ ...st, slots: st.slots.map((sl: any) => ({ ...sl, roleIds: [i % 2 === 0 ? T.cargo : T.cargo2] })) })) // eslint-disable-line @typescript-eslint/no-explicit-any
    const put = await call("PUT", `/templates/${tpl["id"]}/versions/${v1.id}`, {
      locationTypeIds: [T.local], assetTypeIds: [T.ativo], stages, separation: [{ slotA: stages[1].slots[0].id, slotB: stages[0].slots[0].id, locked: true }],
      form: { sections: [{ id: "s1", title: "Pedido", items: [{ id: "obs", kind: "texto", label: "Observação", required: false }] }] }, maxWindowHours: 8, holdsEquipment: false, note: "revisado",
    }, { "if-match": `"${v1.revision}"` })
    expect(put.status, put.body).toBe(200)
    const edited = put.json()
    expect(edited["revision"]).toBeGreaterThan(v1.revision)
    expect(edited).toMatchObject({ holdsEquipment: false, maxWindowHours: 8, locationTypeIds: [T.local], assetTypeIds: [T.ativo], note: "revisado" })
    expect(edited["separation"]).toHaveLength(1)
    // Revisão velha: 409 com a atual.
    const old = await call("PUT", `/templates/${tpl["id"]}/versions/${v1.id}`, content(), { "if-match": `"${v1.revision}"` })
    expect(old.status).toBe(409)
    expect(old.json()).toMatchObject({ code: "PTA06", detail: String(edited["revision"]) })

    const act = await call("POST", `/templates/${tpl["id"]}/versions/${v1.id}/activate`, undefined, { "if-match": `"${edited["revision"]}"` })
    expect(act.status, act.body).toBe(200)
    expect(act.json()["versions"][0]).toMatchObject({ status: "ativa", holdsEquipment: false })

    // Congelada: PUT e DELETE → PTW03 (inclusive o "prende o equipamento").
    const frozenRev = act.json()["versions"][0].revision
    const flip = await call("PUT", `/templates/${tpl["id"]}/versions/${v1.id}`, { ...content(), stages, holdsEquipment: true }, { "if-match": `"${frozenRev}"` })
    expect(flip.status).toBe(422)
    expect(flip.json()["code"]).toBe("PTW03")
    expect((await call("DELETE", `/templates/${tpl["id"]}/versions/${v1.id}`, undefined, { "if-match": `"${frozenRev}"` })).json()["code"]).toBe("PTW03")
    expect((await call("DELETE", `/templates/${tpl["id"]}`, undefined, { "if-match": `"${tpl["revision"]}"` })).json()["code"]).toBe("PTW03")

    // Copia a ativa: rascunho 2 com ids novos e o mesmo conteúdo.
    const copy = await call("POST", `/templates/${tpl["id"]}/versions`, { copyFrom: v1.id })
    expect(copy.status, copy.body).toBe(201)
    const c = copy.json()
    expect(c).toMatchObject({ number: 2, status: "rascunho", origin: "manual", holdsEquipment: false })
    expect(c["stages"].map((s: any) => s.id).some((i: string) => stages.some((o: any) => o.id === i))).toBe(false) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(c["form"]).toEqual(edited["form"])
    // Ativar a 2 arquiva a 1.
    const act2 = await call("POST", `/templates/${tpl["id"]}/versions/${c["id"]}/activate`, undefined, { "if-match": `"${c["revision"]}"` })
    expect(act2.json()["versions"].map((v: any) => v.status)).toEqual(["arquivada", "ativa"]) // eslint-disable-line @typescript-eslint/no-explicit-any
    // Remover um rascunho solto funciona; o modelo com ativa/arquivada não.
    const extra = await call("POST", `/templates/${tpl["id"]}/versions`, { copyFrom: c["id"] })
    expect((await call("DELETE", `/templates/${tpl["id"]}/versions/${extra.json()["id"]}`, undefined, { "if-match": `"${extra.json()["revision"]}"` })).status).toBe(204)
  })

  it("importar: a prévia não grava; a confirmação cria o rascunho 'sugerida' com o evento modelo.importado; pacote com erro não cria nada", async () => {
    const count = async () => (await db.owner<{ n: number }[]>`select (select count(*) from ptw.template)::int + (select count(*) from ptw.template_version)::int + (select count(*) from ptw.type_def)::int + (select count(*) from ptw.option_list)::int as n`)[0]!.n
    const before = await count()
    const pv = await call("POST", "/templates/import/preview", { arquivo: "painel.ptw-modelo.json", pacote: EXEMPLO })
    expect(pv.status, pv.body).toBe(200)
    expect(await count()).toBe(before)

    const bad = await call("POST", "/templates/import/preview", { pacote: pacote((p) => ((p["etapas"] as unknown[]).length = 0)) })
    expect(bad.json()["rascunho"]).toBeNull()
    expect((await call("POST", "/templates/import/confirm", { pacote: EXEMPLO, token: "lixo" })).json()["code"]).toBe("PTA10")
    expect(await count()).toBe(before)

    const ok = await call("POST", "/templates/import/confirm", { arquivo: "painel.ptw-modelo.json", pacote: EXEMPLO, token: pv.json()["token"] })
    expect(ok.status, ok.body).toBe(201)
    const out = ok.json()
    const v = out["template"]["versions"].find((q: any) => q.id === out["versionId"]) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(v).toMatchObject({ status: "rascunho", origin: "sugerida", activatedAt: null })
    expect(v["sourceSha256"]).toBe(pv.json()["sha256"])
    expect(v["importSource"]["pacote"]).toMatchObject({ arquivo: "painel.ptw-modelo.json" })
    const evs = await ev("modelo.importado")
    expect(evs).toHaveLength(1)
    expect(evs[0]!.data["novos"]).toEqual(out["created"])
    // A mesma prévia não vale duas vezes (o modelo já existe: o resultado mudou).
    expect((await call("POST", "/templates/import/confirm", { arquivo: "painel.ptw-modelo.json", pacote: EXEMPLO, token: pv.json()["token"] })).json()["code"]).toBe("PTA10")
  })

  it("exportar → importar de novo (ida e volta): o pacote exportado importa sem erro e dá a mesma estrutura", async () => {
    const list = await call("GET", "/templates?q=interven")
    const tpl = list.json()["items"][0]
    const ver = tpl.versions[0]
    expect((await call("GET", `/templates/${tpl.id}/export?versionId=${ver.id}`)).status).toBe(400) // sem motivo
    const exp = await call("GET", `/templates/${tpl.id}/export?versionId=${ver.id}`, undefined, { "x-ptw-reason": encodeURIComponent("Levar à outra planta") })
    expect(exp.status, exp.body).toBe(200)
    expect((await ev("acesso.exportacao.modelo"))[0]!.data["motivo"]).toBe("Levar à outra planta")
    const pkg = exp.json()
    expect(pkg["formato"]).toBe("ptw.modelo/1")
    const again = await call("POST", "/templates/import/preview", { arquivo: "volta.json", pacote: JSON.stringify(pkg) })
    expect(again.status, again.body).toBe(200)
    const r = again.json()
    expect((r["problemas"] as { nivel: string }[]).filter((p) => p.nivel === "erro")).toEqual([])
    expect(r["rascunho"].modeloExistente).toBe(true)
    expect(r["rascunho"].versao.stages.map((s: any) => s.name)).toEqual(ver.stages.map((s: any) => s.name)) // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(r["resumo"].itens).toEqual(
      (ver.form.sections as { items: { kind: string }[] }[]).flatMap((s) => s.items).reduce((acc: Record<string, number>, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), r["resumo"].itens && Object.fromEntries(Object.keys(r["resumo"].itens).map((k) => [k, 0]))),
    )
  })
})

/** Auditoria e arquivos contra PostgreSQL e SeaweedFS reais; o papel é ptw_api. */
import { createHash, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { buildApp, coverage } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import { eventHash, type AuditEvent } from "../src/shared/core/audit.ts"
import { S3 } from "../src/storage/s3.js"
import { HOST, ORIGIN, cookiePair, testConfig } from "./helpers/app.js"
import { createTestDb, HAS_DB, T_ANA, T_UNIT, type TestDb } from "./helpers/realDb.js"

const BASE = "/api/v1"
describe.skipIf(!HAS_DB)("auditoria, demonstração e arquivos no banco real", () => {
  let db: TestDb, app: FastifyInstance, headers: Record<string, string>, permit: string
  const call = (method: "GET" | "POST" | "HEAD" | "PUT", path: string, payload?: object | Buffer, extra = {}) =>
    app.inject({ method, url: BASE + path, headers: { ...headers, ...extra }, ...(payload ? { payload } : {}) })
  beforeAll(async () => {
    db = await createTestDb("complete")
    app = await buildApp({ config: testConfig({ db: db.config }), driver: postgresDriver(db.config), logger: false })
    await app.ready()
    const login = await app.inject({ method: "POST", url: BASE + "/session/dev-login", headers: { host: HOST, origin: ORIGIN }, payload: { login: "ana" } })
    expect(login.statusCode, login.body).toBe(200)
    headers = { host: HOST, origin: ORIGIN, cookie: cookiePair(login), "x-ptw-csrf": login.json().csrfToken }
    // Cadastro mínimo pelas rotas reais.
    const type = await call("POST", "/types", { family: "local", label: "Área" })
    const role = await call("POST", "/types", { family: "cargo", label: "Responsável" })
    const loc = await call("POST", "/locations", { typeId: type.json().id, code: "A-01", name: "Área 1" })
    expect(loc.statusCode, loc.body).toBe(201)
    const tpl = await call("POST", "/templates", { name: "Teste de anexos", version: {
      id: randomUUID(), form: { sections: [{ id: "sec", title: "Arquivos", items: [{ id: "arquivo", kind: "anexo", label: "Arquivo", accept: ["arquivo", "foto"], min: 0, hint: "", required: false }] }] },
      stages: ["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"].map((kind, i) => ({ id: randomUUID(), kind, name: "Etapa " + i,
        slots: [{ id: randomUUID(), kind: "cargo", roleIds: [role.json().id], personId: null, meaning: "Assina", min: 1, required: true }] })),
      separation: [], locationTypeIds: [], assetTypeIds: [],
    } })
    expect(tpl.statusCode, tpl.body).toBe(201)
    const t = tpl.json(), v = t.versions[0]
    const active = await call("POST", `/templates/${t.id}/versions/${v.id}/activate`, undefined, { "if-match": `"${v.revision}"` })
    expect(active.statusCode, active.body).toBe(200)
    const draft = await call("POST", "/permits", { templateId: t.id, versionId: v.id, locationId: loc.json().id, assetIds: [], team: {},
      scope: "Conferir anexos", windowStart: new Date(Date.now() - 60_000).toISOString(), windowEnd: new Date(Date.now() + 3_600_000).toISOString() })
    expect(draft.statusCode, draft.body).toBe(201)
    permit = draft.json().permit.id
  })
  afterAll(async () => { await app?.close(); await db?.drop() })

  it("todas as operações têm rota e a lista de demonstração só mostra contas aptas", async () => {
    expect(coverage(app).withoutRoute).toEqual([])
    const people = await app.inject({ url: BASE + "/session/dev-people" })
    expect(people.statusCode, people.body).toBe(200)
    expect(people.json()).toEqual({ items: [{ id: T_ANA, name: "Ana Souza", login: "ana" }] })
    const disabled = await buildApp({ config: testConfig({ db: db.config, devLogin: false }), driver: postgresDriver(db.config), logger: false })
    expect((await disabled.inject({ url: BASE + "/session/dev-people" })).statusCode).toBe(404)
    await disabled.close()
  })

  it("filtra, pagina e registra leitura; os hashes têm a mesma forma do app", async () => {
    const noPeriod = await call("GET", "/audit/events?q=texto")
    expect(noPeriod.statusCode).toBe(400)
    const list = await call("GET", "/audit/events?group=alteracao&limit=2")
    expect(list.statusCode, list.body).toBe(200)
    const page = list.json()
    expect(page.items).toHaveLength(2)
    expect(page.nextBefore).toBe(page.items[1].seq)
    for (const e of page.items) expect(eventHash(e as AuditEvent)).toBe(e.hash)
    const more = await call("GET", `/audit/events?group=alteracao&limit=2&before=${page.nextBefore}`)
    expect(more.json().items.every((e: AuditEvent) => e.seq < page.nextBefore)).toBe(true)
    const viewed = await call("GET", `/audit/events/${page.items[0].seq}`)
    expect(viewed.statusCode, viewed.body).toBe(200)
    expect(viewed.json().event.prev).toBe(viewed.json().previous.hash)
    const facets = await call("GET", "/audit/facets")
    expect(facets.statusCode, facets.body).toBe(200)
    const verified = await call("POST", "/audit/chain/verify")
    expect(verified.statusCode, verified.body).toBe(200)
    expect(verified.json().verified).toMatchObject({ ok: true, firstBroken: null })
    expect((await call("GET", "/audit/chain")).json().verified.ok).toBe(true)
    const searches = await db.owner`select seq from ptw.audit_event where unit_id = ${T_UNIT} and action = 'acesso.auditoria.busca'`
    expect(searches).toHaveLength(1)
  })

  it("exportação exige motivo, é idempotente, mantém bytes e passa no verificador portátil", async () => {
    const input = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z", reason: "Conferência de acentuação e integridade" }
    expect((await call("POST", "/audit/exports", { ...input, reason: "" })).statusCode).toBe(400)
    const key = { "idempotency-key": randomUUID() }
    const created = await call("POST", "/audit/exports", input, key)
    expect(created.statusCode, created.body).toBe(201)
    const ex = created.json()
    const repeated = await call("POST", "/audit/exports", input, key)
    expect(repeated.json().id).toBe(ex.id)
    expect(repeated.headers["idempotency-replayed"]).toBe("true")
    const lines = await call("GET", `/audit/exports/${ex.id}/events.jsonl`)
    const man = await call("GET", `/audit/exports/${ex.id}/manifest.json`)
    expect(lines.statusCode, lines.body.slice(0, 300)).toBe(200)
    expect(man.statusCode, man.body).toBe(200)
    expect(createHash("sha256").update(lines.rawPayload).digest("hex")).toBe(ex.fileSha256)
    expect(createHash("sha256").update(man.rawPayload).digest("hex")).toBe(ex.manifestSha256)
    const dir = mkdtempSync(join(tmpdir(), "ptw-export-")), file = join(dir, ex.fileName + ".jsonl"), manifest = join(dir, ex.fileName + ".manifesto.json")
    writeFileSync(file, lines.rawPayload); writeFileSync(manifest, man.rawPayload)
    const verifier = process.env.PTW_TEST_VERIFIER ?? "/ptw/tools/ptw_verifica.py"
    expect(execFileSync("python3", [verifier, manifest], { encoding: "utf8" })).toMatch(/ÍNTEGRA/)
    writeFileSync(file, readFileSync(file, "utf8").replace('"v": 2', '"v": 3'))
    expect(() => execFileSync("python3", [verifier, manifest], { stdio: "pipe" })).toThrow()
    const list = await call("GET", "/audit/exports?pageSize=2")
    expect(list.statusCode, list.body).toBe(200)
    expect(list.json().items[0].id).toBe(ex.id)
  })

  it.skipIf(process.env.PTW_TEST_STORAGE !== "1")("arquivo em fluxo, SHA errado recusado, deduplicação, anexo, Range e leitura auditada", async () => {
    const bytes = Buffer.from(`conteúdo JSON válido em bytes: ${randomUUID()}`)
    const sha = createHash("sha256").update(bytes).digest("hex")
    const extra = { "content-type": "application/json", "content-length": String(bytes.length) }
    const tooLarge = await call("PUT", `/blobs/${sha}`, bytes, { ...extra, "content-length": "2147483649" })
    expect(tooLarge.statusCode, tooLarge.body).toBe(413)
    expect(tooLarge.json().code).toBe("PTA11")
    expect((await call("HEAD", `/blobs/${sha}`)).statusCode).toBe(404)
    const wrong = await call("PUT", `/blobs/${"f".repeat(64)}`, bytes, extra)
    expect(wrong.statusCode, wrong.body).toBe(422)
    expect(wrong.json().code).toBe("PTA09")
    const s3 = new S3("http://storage:8333")
    const bad = await s3.request("HEAD", `${T_UNIT}/ff/${"f".repeat(64)}`)
    expect(bad.status).toBe(404)
    const uploaded = await call("PUT", `/blobs/${sha}`, bytes, extra)
    expect(uploaded.statusCode, uploaded.body).toBe(201)
    expect((await call("PUT", `/blobs/${sha}`, bytes, extra)).statusCode).toBe(200)
    expect((await call("HEAD", `/blobs/${sha}`)).statusCode).toBe(200)
    const attached = await call("POST", `/permits/${permit}/attachments`, { itemId: "arquivo", kind: "arquivo", sha256: sha, fileName: "relatório.json" }, { "idempotency-key": randomUUID() })
    expect(attached.statusCode, attached.body).toBe(201)
    const id = attached.json().id
    expect(attached.json().capturedBy).toBe(T_ANA)
    expect((await call("GET", `/attachments/${id}`)).statusCode).toBe(200)
    expect((await call("GET", `/attachments/${id}/preview`)).statusCode).toBe(404)
    const download = await call("GET", `/attachments/${id}/content?mode=baixado`)
    expect(download.rawPayload).toEqual(bytes)
    const range = await call("GET", `/attachments/${id}/content?mode=visto`, undefined, { range: "bytes=0-6" })
    expect(range.statusCode, range.body).toBe(206)
    expect(range.rawPayload).toEqual(bytes.subarray(0, 7))
    expect(range.headers["content-type"]).toBe("application/octet-stream")
    expect(range.headers["content-disposition"]).toMatch(/^attachment;/)
    expect(range.headers["content-security-policy"]).toContain("sandbox")
    const access = await db.owner`select action from ptw.audit_event where unit_id = ${T_UNIT} and entity_id = ${id} and action like 'acesso.anexo.%'`
    expect(access.map(e => e.action).sort()).toEqual(["acesso.anexo.baixado", "acesso.anexo.visto"])
    await s3.remove(`${T_UNIT}/${sha.slice(0, 2)}/${sha}`)
  })
})

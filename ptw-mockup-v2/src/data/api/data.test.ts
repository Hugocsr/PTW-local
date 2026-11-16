import { describe, expect, it } from "vitest"
import { accessEvent } from "@/core/audit"
import { exemplo } from "@/demo/exemplo"
import { boot, detailOf, err, permitIn, person, reg, rowKey, wait, type Handler } from "./testkit"

describe("api: cadastro e modelos", () => {
  it("tipos: família do contrato na ida, quatro listas na volta; recusa 23503 não muda nada", async () => {
    const used = reg.locationTypes[0]
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /types": (c) => ({ status: 201, body: { ...(c.body as object), active: true } }),
      [`PATCH /types/${used.id}`]: (c) => ({ body: { ...used, family: "local", ...(c.body as object) } }),
      [`DELETE /types/${used.id}`]: () => err(409, "23503", "Está em uso"),
    })
    expect(await port.registry.write({ kind: "addType", list: "relationKinds", label: "Alimenta" }).done).toBeNull()
    const c = srv.find("POST", /\/types$/)[0]
    expect(c.body).toMatchObject({ family: "relacao", label: "Alimenta" })
    expect(typeof (c.body as { id: string }).id).toBe("string")
    expect(c.headers.get("idempotency-key")).toBeTruthy()
    const added = port.registry.get().relationKinds.find((t) => t.label === "Alimenta")!
    expect("family" in added).toBe(false)
    await port.registry.write({ kind: "renameType", list: "locationTypes", id: used.id, label: "Novo nome" }).done
    expect(srv.find("PATCH", /types/)[0].body).toEqual({ label: "Novo nome" })
    expect(port.registry.get().locationTypes.find((t) => t.id === used.id)!.label).toBe("Novo nome")
    const before = port.registry.get()
    expect(await port.registry.write({ kind: "removeType", list: "locationTypes", id: used.id }).done).toMatchObject({ code: "23503" })
    expect(port.registry.get()).toBe(before)
  })

  it("ativo: lido por página entra no cache; alterar é PUT com If-Match da revisão; novo é POST com id e chave", async () => {
    const a = reg.assets[0]
    const newId = "0190a000-0000-7000-8000-000000000001"
    const { port, srv } = await boot("Marina Costa", [], {
      "GET /assets": () => ({ body: { items: [a], total: 1, page: 0, pageSize: 50 } }),
      [`PUT /assets/${a.id}`]: (c) => ({ body: { ...a, ...(c.body as object), revision: a.revision + 1 } }),
      "POST /assets": (c) => ({ status: 201, body: { ...(c.body as object), revision: 1, unitId: a.unitId, updatedAt: a.updatedAt, origin: "manual", status: "ativo" } }),
    })
    await port.queries.assets({ q: "", sort: null, page: 0, pageSize: 50 })
    expect(port.registry.get().assets.map((x) => x.id)).toContain(a.id)
    expect(await port.registry.write({ kind: "update", list: "assets", id: a.id, fn: (x) => ({ ...x, name: "Outro nome" }) }).done).toBeNull()
    const put = srv.find("PUT", /assets/)[0]
    expect(put.headers.get("if-match")).toBe(`"${a.revision}"`)
    expect(put.body).toMatchObject({ name: "Outro nome" })
    expect("revision" in (put.body as object)).toBe(false)
    expect(port.registry.get().assets.find((x) => x.id === a.id)).toMatchObject({ name: "Outro nome", revision: a.revision + 1 })
    await port.registry.write({ kind: "upsert", list: "assets", item: { id: newId, typeId: a.typeId, code: "X-1", name: "Novo", aliases: [], locationIds: [] } }).done
    const post = srv.find("POST", /\/assets$/)[0]
    expect(post.headers.get("idempotency-key")).toBeTruthy()
    expect(post.body).toMatchObject({ id: newId, code: "X-1" })
  })

  it("modelo: renomear é PATCH com If-Match e o modelo é relido; remover é DELETE; 409 chega em done", async () => {
    const t = reg.templates[0]
    const { port, srv } = await boot("Marina Costa", [], {
      [`PATCH /templates/${t.id}`]: (c) => ({ body: { ...t, ...(c.body as object), revision: t.revision + 1 } }),
      [`GET /templates/${t.id}`]: () => ({ body: { ...t, name: "Renomeado", revision: t.revision + 1 } }),
      [`DELETE /templates/${t.id}`]: () => err(409, "23503", "Usado por PT"),
    })
    expect(await port.registry.write({ kind: "update", list: "templates", id: t.id, fn: (x) => ({ ...x, name: "Renomeado" }) }).done).toBeNull()
    expect(srv.find("PATCH", /templates/)[0].headers.get("if-match")).toBe(`"${t.revision}"`)
    expect(port.registry.get().templates.find((x) => x.id === t.id)!.name).toBe("Renomeado")
    expect(await port.registry.write({ kind: "removeTemplate", id: t.id }).done).toMatchObject({ code: "23503" })
  })

  it("Importar modelo: prévia (token) e confirmação, ou recusa sem o texto do pacote", async () => {
    const t = reg.templates[0]
    const draft = { versao: { sourceSha256: "a".repeat(64) } } as never
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /templates/import/preview": () => ({ body: { token: "tok", sha256: "a".repeat(64), problemas: [] } }),
      "POST /templates/import/confirm": () => ({ status: 201, body: { template: t, versionId: t.versions[0].id, created: { listas: [], tipos: [], cargos: [] } } }),
    })
    expect((await port.registry.write({ kind: "importTemplate", draft }).done)?.code).toBe("PTA05")
    const act = port.registry.write({ kind: "importTemplate", draft, pacote: "{}", arquivo: "f.json" } as never)
    expect(await act.done).toBeNull()
    expect(srv.find("POST", /import\/confirm/)[0].body).toEqual({ arquivo: "f.json", pacote: "{}", token: "tok" })
    expect(srv.find("POST", /import\/confirm/)[0].headers.get("idempotency-key")).toBeTruthy()
  })
})

describe("api: consultas", () => {
  const header = (p: ReturnType<typeof permitIn>) => (({ answers, answerMeta, ...h }) => (void answers, void answerMeta, h))(p)

  it("Quadro: segmento, busca, ordem e página no servidor; linhas com modelo e versão; total sem filtro", async () => {
    const p = permitIn("ativa")
    const { port, srv } = await boot("Marina Costa", [], {
      "GET /permits": () => ({ body: { items: [{ permit: header(p), next: "Marina Costa · Aceite", mine: true }], total: 41, page: 2, pageSize: 10 } }),
      "GET /permits/counts": () => ({ body: { total: 300, byState: {}, bySegment: {} } }),
    })
    const page = await port.queries.permitBoard({ q: " bomba ", filters: { segment: "campo" }, sort: { id: "windowStart", dir: "desc" }, page: 2, pageSize: 10 })
    expect(Object.fromEntries(srv.find("GET", /^\/permits$/)[0].query)).toEqual({ q: "bomba", segment: "campo", sort: "-windowStart", page: "2", pageSize: "10" })
    expect(page).toMatchObject({ total: 41, all: 300, page: 2, pageSize: 10 })
    expect(page.items[0]).toMatchObject({ next: "Marina Costa · Aceite", mine: true, tpl: { id: p.templateId }, ver: { id: p.versionId }, p: { id: p.id, answers: {} } })
    await port.queries.permitBoard({ q: "", sort: null, page: 0, pageSize: 10 })
    expect(srv.find("GET", /counts/)).toHaveLength(1)
    expect(Object.fromEntries(srv.find("GET", /^\/permits$/)[1].query)).toEqual({ page: "0", pageSize: "10" })
  })

  it("Ativos: filtros de tipo e local, ordem; 'all' do cadastro", async () => {
    const a = reg.assets[0]
    const { port, srv } = await boot("Marina Costa", [], { "GET /assets": (c) => ({ body: { items: [a], total: c.query.get("pageSize") === "1" ? 20000 : 7, page: 0, pageSize: 25 } }) })
    const page = await port.queries.assets({ q: "", filters: { typeId: a.typeId, locationId: "all" }, sort: { id: "code", dir: "asc" }, page: 0, pageSize: 25 })
    expect(page).toMatchObject({ total: 7, all: 20000 })
    expect(Object.fromEntries(srv.find("GET", /^\/assets$/)[0].query)).toEqual({ typeId: a.typeId, sort: "code", page: "0", pageSize: "25" })
  })

  it("Auditoria: grupos, dia da unidade → instantes, sistema, cursor; fica no cache; facetas", async () => {
    const ev = { v: 2, unit: "u", seq: 9, at: 1, prev: "0".repeat(64), hash: "1".repeat(64), actor: null, role: null, auth: null, client: null, request: null, reason: null, action: "sistema.x", ok: true, permit: null, rev: null, asset: null, entity: null, entityId: null, text: "t", data: {} }
    const { port, srv } = await boot("Marina Costa", [], {
      "GET /audit/events": () => ({ body: { items: [ev, { ...ev, seq: 8 }], nextBefore: 8, total: 120 } }),
      "GET /audit/facets": () => ({ body: { actors: [{ id: "p1", name: "A" }], areas: ["pt"], total: 55 } }),
    })
    const page = await port.queries.auditEvents({ groups: ["acesso", "negada"], area: "pt", actorId: null, from: "2026-11-06", to: "2026-11-06", q: " bomba ", before: 50, limit: 20 })
    expect(page).toMatchObject({ nextBefore: 8, matched: 120 })
    const c = srv.find("GET", /audit\/events/)[0]
    expect(c.query.getAll("group")).toEqual(["acesso", "negada"])
    expect(c.query.get("actorId")).toBe("sistema")
    expect(c.query.get("from")).toBe("2026-11-06T00:00:00-03:00")
    expect(c.query.get("to")).toBe("2026-11-07T00:00:00-03:00")
    expect(c.query.get("q")).toBe("bomba"); expect(c.query.get("before")).toBe("50"); expect(c.query.get("limit")).toBe("20")
    expect(port.audit.get().map((e) => e.seq)).toEqual([8, 9])
    expect(await port.queries.auditFacets()).toEqual({ actorIds: ["p1"], areas: ["pt"], total: 55 })
  })

  it("erro de leitura é recusa (os ganchos mostram)", async () => {
    const { port } = await boot("Marina Costa", [], { "GET /assets": () => err(403, "PTA03", "Sem permissão") })
    await expect(port.queries.assets({ q: "", sort: null, page: 0, pageSize: 5 })).rejects.toMatchObject({ code: "PTA03" })
  })
})

describe("api: trilha, leituras e arquivos", () => {
  it("verificar a cadeia: o contrato → ChainCheck", async () => {
    const h = "h".repeat(64)
    const ok = await boot("Marina Costa", [], { "POST /audit/chain/verify": () => ({ body: { headSeq: 40, headHash: h, verified: { at: "x", ok: true, upToSeq: 40 } } }) })
    expect(await ok.port.audit.verify()).toEqual({ ok: true, count: 40, head: h })
    const bad = await boot("Marina Costa", [], { "POST /audit/chain/verify": () => ({ body: { headSeq: 40, headHash: h, verified: { at: "x", ok: false, upToSeq: 40, firstBroken: 12 } } }) })
    expect(await bad.port.audit.verify()).toEqual({ ok: false, count: 40, head: h, firstBroken: 12 })
  })

  it("exportar: registra com o motivo e baixa os dois arquivos como texto", async () => {
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /audit/exports": () => ({ status: 201, body: { id: "e1", events: 3, fileName: "ptw-auditoria-UN01-1-3" } }),
      "GET /audit/exports/e1/events.jsonl": () => ({ text: "l1\nl2\nl3\n" }),
      "GET /audit/exports/e1/manifest.json": () => ({ text: '{"formato":"ptw-auditoria/2"}\n' }),
    })
    expect(await port.audit.exportAll("Auditoria interna")).toEqual({ baseName: "ptw-auditoria-UN01-1-3", jsonl: "l1\nl2\nl3\n", manifest: '{"formato":"ptw-auditoria/2"}\n', events: 3 })
    const c = srv.find("POST", /audit\/exports/)[0]
    expect(c.body).toMatchObject({ reason: "Auditoria interna", from: "1970-01-01T00:00:00Z" })
    expect(c.headers.get("idempotency-key")).toBeTruthy()
    const refused = await boot("Marina Costa", [], { "POST /audit/exports": () => err(403, "PTA03", "Sem permissão") })
    expect(await refused.port.audit.exportAll("x")).toMatchObject({ code: "PTA03" })
  })

  it("abrir a PT na tela: nota de acesso uma vez; a PT lida por load já foi anotada pelo servidor", async () => {
    const p = permitIn("em_analise"), other = permitIn("ativa")
    const { port, srv } = await boot("Marina Costa", [p], {
      [`POST ${rowKey(p)}/access`]: () => ({ status: 204 }),
      [`GET ${rowKey(other)}`]: () => ({ body: detailOf(other) }),
      "GET /permits/PT-FALTA": () => err(404, "PTA04", "Não existe"),
    })
    const ctx = port.audit.ctx()
    const note = (id: string, rev: number) => accessEvent("acesso.pt.aberta", { permit: { id, revision: rev } }, ctx)
    port.audit.record([note(p.id, p.revision)])
    await wait(5)
    expect(srv.find("POST", /\/access$/)).toHaveLength(1)
    expect(await port.permits.load(other.id)).toMatchObject({ id: other.id })
    port.audit.record([note(other.id, other.revision)])
    await wait(5)
    expect(srv.find("POST", /\/access$/)).toHaveLength(1)
    expect(srv.find("GET", new RegExp(`${other.id}$`))).toHaveLength(1)
    expect(await port.permits.load(p.id)).toMatchObject({ id: p.id })
    expect(await port.permits.load("PT-FALTA")).toBeNull()
    const n = srv.calls.length
    port.audit.record([accessEvent("acesso.auditoria.busca", {}, ctx)])
    expect(srv.calls.length).toBe(n)
  })

  it("foto: confere o SHA-256, envia o conteúdo só se o servidor não o tem e liga ao item", async () => {
    const p = permitIn("ativa")
    const bytes = new TextEncoder().encode("conteudo-da-foto")
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("")
    const att = { id: "att-1", permitId: p.id, itemId: "fi_campo_foto", kind: "foto", sha256: sha, fileName: "f.jpg", previewSha256: null, width: null, height: null, durationMs: null, capturedBy: person("Marina Costa").id, capturedAt: exemplo.start }
    let stored = false
    const { port, srv } = await boot("Marina Costa", [p], {
      [`HEAD /blobs/${sha}`]: () => (stored ? { status: 200 } : err(404, "PTA04", "não existe")),
      [`PUT /blobs/${sha}`]: () => { stored = true; return { status: 201, body: { sha256: sha, size: bytes.length, mime: "image/jpeg", storedAt: exemplo.start } } },
      [`POST ${rowKey(p)}/attachments`]: () => ({ status: 201, body: att }),
    })
    const file = new File([bytes], "f.jpg", { type: "image/jpeg" })
    expect(await port.permits.capture(p.id, "", "fi_campo_foto", "foto", file)).toMatchObject({ id: "att-1", sha256: sha })
    const put = srv.find("PUT", /blobs/)[0]
    expect(put.headers.get("content-type")).toBe("image/jpeg")
    expect(put.raw).toBeInstanceOf(Blob)
    const post = srv.find("POST", /attachments$/)[0]
    expect(post.body).toMatchObject({ itemId: "fi_campo_foto", kind: "foto", sha256: sha, fileName: "f.jpg" })
    expect(post.headers.get("idempotency-key")).toBeTruthy()
    expect(port.permits.get().attachments.map((a) => a.id)).toContain("att-1")
    expect(port.permits.urlOf(sha)).toBe("/api/v1/attachments/att-1/content?mode=visto")
    await port.permits.capture(p.id, "", "fi_campo_foto", "foto", file)
    expect(srv.find("PUT", /blobs/)).toHaveLength(1)
  })

  it("foto recusada pelo servidor: null", async () => {
    const p = permitIn("ativa")
    const extra: Record<string, Handler> = { "HEAD /blobs/:sha": () => ({ status: 200 }), [`POST ${rowKey(p)}/attachments`]: () => err(422, "PTW06", "A PT não aceita resposta agora") }
    const { port } = await boot("Marina Costa", [p], extra)
    expect(await port.permits.capture(p.id, "", "i", "foto", new File(["x"], "f.jpg", { type: "image/jpeg" }))).toBeNull()
  })
})

describe("api: sincronização", () => {
  it("start(): lê /status e para; Minha área volta só com o que mudou (updatedSince)", async () => {
    const { port, srv } = await boot("Marina Costa", [permitIn("em_analise")])
    const stop = port.start()
    await wait(20)
    stop()
    expect(srv.find("GET", /^\/status$/).length).toBeGreaterThan(0)
    const n = srv.calls.length
    await port.permits.loadMine()
    expect(srv.find("GET", /permits\/mine/).at(-1)!.query.get("updatedSince")).toBe(exemplo.start)
    expect(srv.calls.length).toBe(n + 1)
  })
})

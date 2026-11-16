import { describe, expect, it } from "vitest"
import { exemplo } from "@/demo/exemplo"
import type { Permit } from "@/permit/types"
import { runAsUndo } from "../port"
import { createApiPort } from "./index"
import { boot, detailOf, err, fakeServer, NETWORK, permitIn, person, reg, rowKey, slotOf, stateOf, baseRoutes, wait, type Handler } from "./testkit"


describe("api: entrada e carga", () => {
  it("com sessão: cadastro inteiro, tipos nas quatro listas, Minha área, pessoa e fuso", async () => {
    const mine = [permitIn("em_analise"), permitIn("ativa")]
    const { port, srv } = await boot("Marina Costa", mine)
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: person("Marina Costa").id, serverDown: false, devLogin: true, tz: reg.units[0].timezone })
    const r = port.registry.get()
    expect(r.locationTypes).toEqual(reg.locationTypes)
    expect(r.roleTypes.length).toBe(reg.roleTypes.length)
    expect("family" in r.assetTypes[0]).toBe(false)
    expect(r.people.length).toBe(reg.people.length)
    expect(port.permits.get().permits.map((p) => p.id).sort()).toEqual(mine.map((p) => p.id).sort())
    expect(r.assets.length).toBeGreaterThan(0)
    expect(srv.calls.every((c) => c.method === "GET")).toBe(true)
    expect(port.mode).toBe("api"); expect(port.whole).toBe(false)
  })

  it("401: volta para a entrada; sem rede no começo: carregando e servidor fora", async () => {
    const a = fakeServer({ "GET /session": () => err(401, "PTA02", "Sem sessão") })
    expect((await createApiPort({ fetch: a.fetch })).session.get()).toMatchObject({ status: "ausente", personId: "" })
    const b = fakeServer({ "GET /session": () => NETWORK })
    expect((await createApiPort({ fetch: b.fetch })).session.get()).toMatchObject({ status: "carregando", serverDown: true })
  })

  it("entrada de desenvolvimento, troca de pessoa e saída", async () => {
    const who = (login: string) => (login === "rafael.nunes" ? "Rafael Nunes" : "Marina Costa")
    const srv = fakeServer({
      ...baseRoutes("Marina Costa", []),
      "GET /session": () => err(401, "PTA02", "Sem sessão"),
      "POST /session/dev-login": (c) => ({ body: { person: person(who((c.body as { login: string }).login)), unit: reg.units[0], auth: "sessao", grants: [], expiresAt: exemplo.start, now: exemplo.start, csrfToken: "csrf-x", devLogin: true } }),
      "POST /session/logout": () => ({ status: 204 }),
    })
    const port = await createApiPort({ fetch: srv.fetch })
    expect(port.session.get().status).toBe("ausente")
    const sess = port.session as unknown as { devLogin(l: string): Promise<unknown> }
    expect(await sess.devLogin("rafael.nunes")).toBeNull()
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: person("Rafael Nunes").id })
    expect(srv.calls.find((c) => c.path === "/session/dev-login")!.body).toEqual({ login: "rafael.nunes" })
    port.session.setPerson(person("Marina Costa").id)
    await wait(30)
    expect(port.session.get().personId).toBe(person("Marina Costa").id)
    await port.session.logout!()
    expect(srv.calls.at(-1)).toMatchObject({ method: "POST", path: "/session/logout" })
    expect(srv.calls.at(-1)!.headers.get("x-ptw-csrf")).toBe("csrf-x")
    expect(port.session.get().status).toBe("ausente")
    expect(port.registry.get().people).toEqual([])
  })

  it("401 no meio do caminho volta para a entrada", async () => {
    const p = permitIn("em_analise")
    const { port } = await boot("Marina Costa", [p], { [`POST ${rowKey(p)}/signatures`]: () => err(401, "PTA02", "Sessão expirada") })
    const r = await port.permits.act({ kind: "sign", permitId: p.id, slotId: slotOf(p), personId: "" }).done
    expect(r?.code).toBe("PTA02")
    expect(port.session.get().status).toBe("ausente")
  })
})

describe("api: atos da PT", () => {
  it("Assinar: rev e chaves enviados; o estado só muda com a resposta", async () => {
    const p = permitIn("em_analise")
    const { port, srv } = await boot("Marina Costa", [p], {
      [`POST ${rowKey(p)}/signatures`]: () => ({ body: detailOf(p, { state: "emitida", rowVersion: p.rowVersion + 1 }) }),
    })
    const act = port.permits.act({ kind: "sign", permitId: p.id, slotId: slotOf(p), personId: "ignorado" })
    expect(stateOf(port, p).state).toBe("em_analise")
    expect(await act.done).toBeNull()
    expect(stateOf(port, p).state).toBe("emitida")
    const c = srv.find("POST", /signatures$/)[0]
    expect(c.body).toMatchObject({ slotId: slotOf(p), rev: p.revision })
    expect(c.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/)
    expect(c.headers.get("x-ptw-csrf")).toBe("csrf-1")
    expect(c.headers.get("x-ptw-client")).toBeTruthy()
    expect(c.headers.get("x-ptw-undo")).toBeNull()
  })

  it("Enviar (rascunho) vai para /submit com If-Match da versão da linha", async () => {
    const p = permitIn("rascunho")
    const { port, srv } = await boot("Rafael Nunes", [p], {
      [`POST ${rowKey(p)}/submit`]: () => ({ body: detailOf(p, { state: "em_analise", number: "PT-UN01-2026-00099" }) }),
    })
    expect(await port.permits.act({ kind: "sign", permitId: p.id, slotId: slotOf(p), personId: "" }).done).toBeNull()
    const c = srv.find("POST", /submit$/)[0]
    expect(c.headers.get("if-match")).toBe(`"${p.rowVersion}"`)
    expect(c.headers.get("idempotency-key")).toBeTruthy()
    expect(stateOf(port, p)).toMatchObject({ state: "em_analise", number: "PT-UN01-2026-00099" })
  })

  it("Devolver, Retomar, Prorrogar e Parar: corpo, If-Match e chave de cada um", async () => {
    const em = permitIn("em_analise"), su = permitIn("suspensa"), at = permitIn("ativa")
    const ok = (p: Permit, patch: Partial<Permit>): Handler => () => ({ body: detailOf(p, patch) })
    const { port, srv } = await boot("Marina Costa", [em, su, at], {
      [`POST ${rowKey(em)}/return`]: ok(em, { state: "devolvida" }),
      [`POST ${rowKey(su)}/resume`]: ok(su, { resumedReason: "ok" }),
      [`POST ${rowKey(at)}/extensions`]: ok(at, { windowEnd: "2026-12-01T18:00:00-03:00" }),
      [`POST ${rowKey(at)}/stop`]: ok(at, { state: "suspensa", holdReason: "perigo" }),
    })
    const me = person("Marina Costa").id
    await port.permits.act({ kind: "refuse", permitId: em.id, personId: me, reason: "Falta o isolamento" }).done
    await port.permits.act({ kind: "resume", permitId: su.id, personId: me, reason: "Área segura" }).done
    await port.permits.act({ kind: "extend", permitId: at.id, personId: me, newEnd: "2026-12-01T18:00:00-03:00", reason: "Serviço atrasou" }).done
    await port.permits.act({ kind: "stop", permitId: at.id, personId: me, reason: "Vazamento" }).done
    const [ret] = srv.find("POST", /\/return$/), [res] = srv.find("POST", /\/resume$/), [ext] = srv.find("POST", /\/extensions$/), [stop] = srv.find("POST", /\/stop$/)
    expect(ret.body).toEqual({ reason: "Falta o isolamento" }); expect(ret.headers.get("if-match")).toBe(`"${em.rowVersion}"`)
    expect(res.body).toEqual({ reason: "Área segura" }); expect(res.headers.get("if-match")).toBe(`"${su.rowVersion}"`)
    expect(ext.body).toEqual({ newEnd: "2026-12-01T18:00:00-03:00", reason: "Serviço atrasou" }); expect(ext.headers.get("idempotency-key")).toBeTruthy()
    expect(stop.body).toEqual({ reason: "Vazamento" }); expect(stop.headers.get("if-match")).toBeNull(); expect(stop.headers.get("idempotency-key")).toBeTruthy()
    expect(stateOf(port, em).state).toBe("devolvida")
    expect(stateOf(port, at)).toMatchObject({ state: "suspensa", holdReason: "perigo" })
  })

  it("recusa do servidor (PTW20): chega em done, nada muda; PTA06 relê Minha área", async () => {
    const p = permitIn("em_analise"), q = permitIn("ativa")
    const { port, srv } = await boot("Marina Costa", [p, q], {
      [`POST ${rowKey(p)}/signatures`]: () => err(422, "PTW20", "Não é a vez desta etapa"),
      [`POST ${rowKey(q)}/extensions`]: () => err(409, "PTA06", "Revisão desatualizada", "9"),
    })
    const before = port.permits.get()
    expect(await port.permits.act({ kind: "sign", permitId: p.id, slotId: slotOf(p), personId: "" }).done).toEqual({ code: "PTW20", message: "Não é a vez desta etapa" })
    expect(port.permits.get()).toBe(before)
    const mineBefore = srv.find("GET", /permits\/mine/).length
    expect(await port.permits.act({ kind: "extend", permitId: q.id, personId: "", newEnd: "2026-12-01T18:00:00-03:00", reason: "x" }).done).toMatchObject({ code: "PTA06", detail: "9" })
    await wait()
    expect(srv.find("GET", /permits\/mine/).length).toBe(mineBefore + 1)
  })

  it("recusa do núcleo conhecida na hora, e o servidor ainda é chamado (a negada fica na trilha)", async () => {
    const p = permitIn("encerrada")
    const { port, srv } = await boot("Marina Costa", [p], { [`POST ${rowKey(p)}/signatures`]: () => err(422, "PTW19", "A PT não aceita assinatura agora") })
    const act = port.permits.act({ kind: "sign", permitId: p.id, slotId: slotOf(p), personId: "" })
    expect(act.refused).not.toBeNull()
    expect((await act.done)?.code).toBe("PTW19")
    expect(srv.find("POST", /signatures$/)).toHaveLength(1)
  })

  it("PT que não está no cache: PTA04, sem chamada", async () => {
    const { port, srv } = await boot("Marina Costa", [])
    const n = srv.calls.length
    expect(port.permits.act({ kind: "stop", permitId: "nao-existe", personId: "", reason: "x" }).refused?.code).toBe("PTA04")
    expect(srv.calls.length).toBe(n)
  })
})

describe("api: respostas do formulário", () => {
  const item = "fi_ordem_de_servico"
  const value = { t: "texto", v: "Trocar o disjuntor" } as const
  const saved = () => ({ body: { itemId: item, value, answeredBy: person("Rafael Nunes").id, answeredAt: "2026-11-06T09:00:00-03:00" } })

  it("aparece na hora, é gravada item a item e ganha a autoria do servidor", async () => {
    const p = permitIn("rascunho")
    const { port, srv } = await boot("Rafael Nunes", [p], { [`PUT ${rowKey(p)}/answers/${item}`]: saved })
    const act = port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId: item, value })
    expect(stateOf(port, p).answers[item]).toEqual(value)
    expect(await act.done).toBeNull()
    expect(srv.find("PUT", /answers/)[0].body).toEqual(value)
    expect(stateOf(port, p).answerMeta[item]).toEqual({ answeredBy: person("Rafael Nunes").id, answeredAt: "2026-11-06T09:00:00-03:00" })
  })

  it("recusada, volta ao que era", async () => {
    const p = permitIn("rascunho")
    const { port } = await boot("Rafael Nunes", [p], { [`PUT ${rowKey(p)}/answers/${item}`]: () => err(422, "PTW06", "A PT não aceita resposta agora") })
    const had = stateOf(port, p).answers[item]
    const act = port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId: item, value })
    expect(stateOf(port, p).answers[item]).toEqual(value)
    expect((await act.done)?.code).toBe("PTW06")
    expect(stateOf(port, p).answers[item]).toEqual(had)
  })

  it("remover uma resposta é DELETE", async () => {
    const p = permitIn("rascunho")
    const { port, srv } = await boot("Rafael Nunes", [p], { [`PUT ${rowKey(p)}/answers/${item}`]: saved, [`DELETE ${rowKey(p)}/answers/${item}`]: () => ({ status: 204 }) })
    await port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId: item, value }).done
    expect(await port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId: item, value: null }).done).toBeNull()
    expect(srv.find("DELETE", /answers/)).toHaveLength(1)
    expect(stateOf(port, p).answers[item]).toBeUndefined()
  })
})

describe("api: servidor fora do ar", () => {
  it("Parar fica na fila, aparece na tela e é reenviado com a mesma Idempotency-Key; o resto recusa sem chamar", async () => {
    const p = permitIn("ativa"), q = permitIn("em_analise")
    let up = false
    const { port, srv } = await boot("Marina Costa", [p, q], {
      [`POST ${rowKey(p)}/stop`]: () => (up ? { body: detailOf(p, { state: "suspensa", holdReason: "Vazamento", rowVersion: p.rowVersion + 1 }) } : NETWORK),
    })
    const act = port.permits.act({ kind: "stop", permitId: p.id, personId: "", reason: "Vazamento" })
    expect(await act.done).toBeNull()
    expect(port.session.get().serverDown).toBe(true)
    expect(port.permits.waiting()).toBe(1)
    expect(stateOf(port, p)).toMatchObject({ state: "suspensa", holdReason: "Vazamento" })

    const n = srv.calls.length
    const other = port.permits.act({ kind: "sign", permitId: q.id, slotId: slotOf(q), personId: "" })
    expect(other.refused?.code).toBe("sem_servidor"); expect((await other.done)?.code).toBe("sem_servidor")
    expect((await port.registry.write({ kind: "removeRelation", id: reg.relations[0].id }).done)?.code).toBe("sem_servidor")
    expect(srv.calls.length).toBe(n)

    up = true
    await port.permits.flushStops()
    const stops = srv.find("POST", /\/stop$/)
    expect(stops).toHaveLength(2)
    expect(stops[1].headers.get("idempotency-key")).toBe(stops[0].headers.get("idempotency-key"))
    expect(stops[1].body).toEqual({ reason: "Vazamento" })
    expect(port.permits.waiting()).toBe(0)
    expect(port.session.get().serverDown).toBe(false)
  })

  it("503 com o banco fora também guarda o Parar; recusa de regra ao reenviar descarta", async () => {
    const p = permitIn("ativa")
    let mode: "down" | "rule" = "down"
    const { port } = await boot("Marina Costa", [p], { [`POST ${rowKey(p)}/stop`]: () => (mode === "down" ? err(503, "PTA01", "Banco fora do ar") : err(422, "PTW25", "A PT não está em campo")) })
    expect(await port.permits.act({ kind: "stop", permitId: p.id, personId: "", reason: "x" }).done).toBeNull()
    expect(port.permits.waiting()).toBe(1)
    mode = "rule"
    await port.permits.flushStops()
    expect(port.permits.waiting()).toBe(0)
  })
})

describe("api: Desfazer", () => {
  it("X-Ptw-Undo só dentro de runAsUndo", async () => {
    const rel = reg.relations[0]
    const { port, srv } = await boot("Marina Costa", [], {
      [`DELETE /asset-relations/${rel.id}`]: () => ({ status: 204 }),
      "POST /asset-relations": () => ({ status: 201, body: rel }),
    })
    expect(await port.registry.write({ kind: "removeRelation", id: rel.id }).done).toBeNull()
    expect(port.registry.get().relations.some((r) => r.id === rel.id)).toBe(false)
    runAsUndo(() => { void port.registry.write({ kind: "upsert", list: "relations", item: rel }) })
    await wait()
    const [del] = srv.find("DELETE", /asset-relations/), [post] = srv.find("POST", /asset-relations/)
    expect(del.headers.get("x-ptw-undo")).toBeNull()
    expect(post.headers.get("x-ptw-undo")).toBe("true")
    expect(post.headers.get("idempotency-key")).toBeTruthy()
    expect((post.body as { id: string }).id).toBe(rel.id)
  })
})

import { describe, expect, it } from "vitest"
import { createApiPort } from "./index"
import { baseRoutes, boot, detailOf, err, fakeServer, NETWORK, permitIn, person, reg, sessionOf } from "./testkit"

describe("API como origem única da interface", () => {
  it("falha ao carregar o cadastro não abre uma tela aparentemente vazia", async () => {
    const server = fakeServer(baseRoutes("Marina Costa", [], { "GET /templates": () => err(500, "PTA99", "Falha de leitura") }))
    const port = await createApiPort({ fetch: server.fetch })
    expect(port.session.get()).toMatchObject({ status: "carregando", error: { code: "PTA99" } })
    expect(port.registry.get().units).toEqual([])
  })

  it("descobre pessoas sem sessão e só libera a entrada quando o servidor oferece", async () => {
    const p = person("Marina Costa")
    const server = fakeServer({
      "GET /session": () => err(401, "PTA02", "Sem sessão"),
      "GET /session/dev-people": () => ({ body: { items: [{ id: p.id, name: p.name, login: p.login }] } }),
    })
    const port = await createApiPort({ fetch: server.fetch })
    expect(port.session.get().devLogin).toBe(false)
    expect(await port.session.entryPeople!()).toMatchObject([{ id: p.id }])
    expect(port.session.get().devLogin).toBe(true)
    expect(port.session.get().status).toBe("ausente")
  })

  it("trocar de pessoa refaz Minha área inteira, sem o cursor da pessoa anterior", async () => {
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /session/dev-login": () => ({ body: sessionOf("Rafael Nunes") }),
    })
    await port.permits.loadMine()
    expect(srv.find("GET", /permits\/mine/).at(-1)!.query.has("updatedSince")).toBe(true)
    await port.session.devLogin!("rafael.nunes")
    expect(srv.find("GET", /permits\/mine/).at(-1)!.query.has("updatedSince")).toBe(false)
    expect(port.session.get().personId).toBe(person("Rafael Nunes").id)
  })

  it("Parar pendente pertence à pessoa que pediu, nunca à próxima sessão", async () => {
    const p = permitIn("ativa")
    let up = false
    const { port, srv } = await boot("Marina Costa", [p], {
      [`POST /permits/${p.id}/stop`]: () => up ? { body: detailOf(p, { state: "suspensa" }) } : NETWORK,
      "POST /session/dev-login": () => ({ body: sessionOf("Rafael Nunes") }),
    })
    await port.permits.act({ kind: "stop", permitId: p.id, personId: "", reason: "Vazamento" }).done
    expect(port.permits.waiting()).toBe(1)
    up = true
    await port.session.devLogin!("rafael.nunes")
    await port.permits.flushStops()
    expect(srv.find("POST", /\/stop$/)).toHaveLength(1)
    expect(port.permits.waiting()).toBe(1)
  })

  it("cria o rascunho com chave estável e atualiza o cache somente com a resposta", async () => {
    const p = permitIn("rascunho")
    const { port, srv } = await boot("Rafael Nunes", [], { "POST /permits": () => ({ status: 201, body: detailOf(p) }) })
    const writing = port.permits.create!({ id: p.id, templateId: p.templateId, locationId: p.locationId, assetIds: p.assetIds, team: p.team, windowStart: p.windowStart, windowEnd: p.windowEnd, scope: p.scope })
    expect(port.permits.get().permits).toEqual([])
    expect(await writing).toMatchObject({ id: p.id, state: "rascunho" })
    expect(srv.find("POST", /^\/permits$/)[0].headers.get("idempotency-key")).toBe(p.id)
    expect(port.permits.get().permits).toHaveLength(1)
  })

  it("confirmar importação usa exatamente o token já mostrado; não refaz a prévia", async () => {
    const template = reg.templates[0]
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /templates/import/confirm": () => ({ status: 201, body: { template, versionId: template.versions[0].id } }),
    })
    const input = { arquivo: "modelo.json", pacote: "{}", token: "previa-conferida", key: "chave-da-confirmacao" }
    expect(await port.registry.confirmImport!(input)).toEqual({ templateId: template.id, versionId: template.versions[0].id })
    expect(srv.find("POST", /\/preview$/)).toEqual([])
    const call = srv.find("POST", /\/confirm$/)[0]
    expect(call.body).toEqual({ arquivo: input.arquivo, pacote: input.pacote, token: input.token })
    expect(call.headers.get("idempotency-key")).toBe(input.key)
  })

  it("saída recusada pelo servidor mantém a sessão", async () => {
    const { port } = await boot("Marina Costa", [], { "POST /session/logout": () => NETWORK })
    expect(await port.session.logout!()).toMatchObject({ code: "sem_servidor" })
    expect(port.session.get().status).toBe("aberta")
    expect(port.registry.get().people.length).toBeGreaterThan(0)
  })

  it("resposta antiga de sessão não substitui a pessoa nem o CSRF depois da troca", async () => {
    let pending: ((value: { body: ReturnType<typeof sessionOf> }) => void) | undefined
    let delay = false
    const p = permitIn("rascunho")
    const { port, srv } = await boot("Rafael Nunes", [], {
      "GET /session": () => delay ? new Promise((resolve) => { pending = resolve }) : { body: sessionOf("Rafael Nunes", { csrfToken: "csrf-rafael" }) },
      "POST /session/dev-login": () => ({ body: sessionOf("Paulo Lima", { csrfToken: "csrf-paulo" }) }),
      "POST /permits": () => ({ status: 201, body: detailOf(p) }),
    })
    delay = true
    const oldRead = port.session.retry!()
    await port.session.devLogin!("paulo.lima")
    pending!({ body: sessionOf("Rafael Nunes", { csrfToken: "csrf-rafael" }) })
    await oldRead
    await port.permits.create!({ id: p.id, templateId: p.templateId, locationId: p.locationId, assetIds: p.assetIds, team: p.team, windowStart: p.windowStart, windowEnd: p.windowEnd, scope: p.scope })
    expect(port.session.get().personId).toBe(person("Paulo Lima").id)
    expect(srv.find("POST", /^\/permits$/)[0].headers.get("x-ptw-csrf")).toBe("csrf-paulo")
  })

  it("consulta quem prende os ativos da página sem depender das PTs em Minha área", async () => {
    const hold = { assetId: "asset-a", heldAssetId: "asset-b", heldAssetCode: "CCM-01", permitId: "pt-other", number: "PT-01", state: "ativa" }
    const { port, srv } = await boot("Rafael Nunes", [], { "GET /equipment-holds": () => ({ body: [hold] }) })
    expect(await port.queries.equipmentHolds!(["asset-a", "asset-c"])).toEqual([hold])
    expect(srv.find("GET", /equipment-holds/)[0].query.getAll("assetId")).toEqual(["asset-a", "asset-c"])
  })

  it("histórico da PT usa a trilha dedicada e a contagem real de acessos", async () => {
    const p = permitIn("ativa")
    const { port, srv } = await boot("Marina Costa", [p], {
      [`GET /permits/${p.id}/history`]: () => ({ body: { items: [], nextBefore: null, total: 0, accesses: 13 } }),
    })
    expect(await port.queries.permitHistory!(p.id)).toEqual({ items: [], nextBefore: null, matched: 0, accesses: 13 })
    expect(srv.find("GET", /\/history$/)[0].query.get("limit")).toBe("500")
    expect(srv.find("GET", /audit\/events/)).toHaveLength(0)
  })

  it("resposta enfileirada não é enviada nem aplicada pela pessoa que entrou depois", async () => {
    const p = permitIn("rascunho")
    const itemId = "fi_ordem_de_servico"
    const value = { t: "texto", v: "Primeira resposta" } as const
    let release!: () => void
    const { port, srv } = await boot("Rafael Nunes", [p], {
      [`PUT /permits/${p.id}/answers/${itemId}`]: async () => {
        await new Promise<void>((resolve) => { release = resolve })
        return { body: { value, answeredBy: person("Rafael Nunes").id, answeredAt: "2026-11-06T09:00:00-03:00" } }
      },
      "POST /session/dev-login": () => ({ body: sessionOf("Paulo Lima") }),
    })
    const first = port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId, value })
    const second = port.permits.act({ kind: "answer", permitId: p.id, personId: "", itemId, value: { t: "texto", v: "Segunda resposta" } })
    await Promise.resolve()
    await port.session.devLogin!("paulo.lima")
    release()
    expect(await first.done).toBeNull()
    expect(await second.done).toMatchObject({ code: "PTA02" })
    expect(srv.find("PUT", /answers/)).toHaveLength(1)
    expect(port.permits.get().permits.find((x) => x.id === p.id)?.answers[itemId]).toEqual(p.answers[itemId])
  })

  it("retorno de Parar em voo não altera o cache da próxima pessoa", async () => {
    const p = permitIn("ativa")
    let up = false
    let release!: () => void
    const { port } = await boot("Marina Costa", [p], {
      [`POST /permits/${p.id}/stop`]: async () => {
        if (!up) return NETWORK
        await new Promise<void>((resolve) => { release = resolve })
        return { body: detailOf(p, { state: "suspensa" }) }
      },
      "POST /session/dev-login": () => ({ body: sessionOf("Rafael Nunes") }),
    })
    await port.permits.act({ kind: "stop", permitId: p.id, personId: "", reason: "Vazamento" }).done
    up = true
    const flushing = port.permits.flushStops()
    await port.session.devLogin!("rafael.nunes")
    release(); await flushing
    expect(port.permits.waiting()).toBe(0)
    expect(port.permits.get().permits.find((x) => x.id === p.id)?.state).toBe("ativa")
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { createApiPort } from "./index"
import { baseRoutes, boot, err, fakeServer, person, reg, sessionOf } from "./testkit"

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("entrada por senha e validade da sessão", () => {
  it("descobre os modos públicos e abre a sessão com os grants recebidos, sem inferir cargos", async () => {
    const server = fakeServer(baseRoutes("Marina Costa", [], {
      "GET /health": () => ({ body: { ok: true, now: "2026-11-10T12:00:00Z", devLogin: false, passwordLogin: true } }),
      "GET /session": () => err(401, "PTA02", "Sem sessão"),
      "POST /session/login": () => ({ body: sessionOf("Marina Costa", { auth: "ldap", devLogin: false, grants: ["modelos"] }) }),
    }))
    const port = await createApiPort({ fetch: server.fetch })
    expect(port.session.get()).toMatchObject({ status: "ausente", devLogin: false, passwordLogin: true, grants: [] })
    expect(await port.session.login!("marina.costa", "senha-de-teste")).toBeNull()
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: person("Marina Costa").id, grants: ["modelos"], passwordLogin: true })
    expect(port.audit.ctx().auth).toBe("ldap")
    expect(server.find("POST", /^\/session\/login$/)[0].body).toEqual({ login: "marina.costa", password: "senha-de-teste" })
    expect(JSON.stringify(port.session.get())).not.toContain("senha-de-teste")
    expect(server.find("GET", /dev-people/)).toHaveLength(0)
  })

  it("recusa de senha conserva a mensagem e não abre o trabalho", async () => {
    const { port } = await boot("Marina Costa", [], { "POST /session/login": () => err(401, "PTA02", "Login ou senha não conferem") })
    expect(await port.session.login!("marina", "incorreta")).toMatchObject({ message: "Login ou senha não conferem" })
    expect(port.session.get()).toMatchObject({ status: "ausente", personId: "", grants: [] })
    expect(port.registry.get().people).toEqual([])
  })

  it("envia atividade no máximo uma vez por minuto e usa o CSRF da sessão atual", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    const { port, srv } = await boot("Marina Costa", [], {
      "POST /session/activity": () => ({ status: 204 }),
      "POST /session/dev-login": () => ({ body: sessionOf("Paulo Lima", { csrfToken: "csrf-paulo", grants: [] }) }),
    })
    await port.session.activity!()
    now.mockReturnValue(1_059_999)
    await port.session.activity!()
    expect(srv.find("POST", /activity$/)).toHaveLength(1)
    now.mockReturnValue(1_060_000)
    await port.session.activity!()
    expect(srv.find("POST", /activity$/)).toHaveLength(2)
    await port.session.devLogin!("paulo.lima")
    await port.session.activity!()
    expect(srv.find("POST", /activity$/).at(-1)!.headers.get("x-ptw-csrf")).toBe("csrf-paulo")
    expect(port.session.get().grants).toEqual([])
  })

  it("polling, sincronização e leitura de sessão não enviam atividade", async () => {
    vi.useFakeTimers()
    const { port, srv } = await boot("Marina Costa", [])
    const stop = port.start()
    try {
      await vi.advanceTimersByTimeAsync(61_000)
      await port.session.retry!()
      expect(srv.find("GET", /status$/).length).toBeGreaterThan(2)
      expect(srv.find("POST", /activity$/)).toHaveLength(0)
    } finally { stop() }
  })

  it("atividade após expiração encerra a sessão e não continua renovando", async () => {
    const { port, srv } = await boot("Marina Costa", [], { "POST /session/activity": () => err(401, "PTA02", "Sessão encerrada") })
    expect(await port.session.activity!()).toMatchObject({ code: "PTA02" })
    expect(port.session.get()).toMatchObject({ status: "ausente", personId: "", grants: [] })
    await port.session.activity!()
    expect(srv.find("POST", /activity$/)).toHaveLength(1)
    expect(port.registry.get().people).toEqual([])
  })

  it("401 atrasado da atividade anterior não encerra quem entrou depois", async () => {
    let release!: () => void
    const { port } = await boot("Marina Costa", [], {
      "POST /session/activity": async () => { await new Promise<void>((resolve) => { release = resolve }); return err(401, "PTA02", "Sessão anterior encerrada") },
      "POST /session/dev-login": () => ({ body: sessionOf("Paulo Lima", { csrfToken: "csrf-paulo", grants: [] }) }),
    })
    const pending = port.session.activity!()
    await port.session.devLogin!("paulo.lima")
    release()
    await pending
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: person("Paulo Lima").id, grants: [] })
  })

  it("exporta o modelo pelo servidor com versão e motivo, sem usar a cópia do cache", async () => {
    const tpl = reg.templates[0]
    const { port, srv } = await boot("Marina Costa", [], { [`GET /templates/${tpl.id}/export`]: () => ({ body: { formato: "ptw.modelo/1", fonte: "servidor" } }) })
    expect(await port.registry.exportTemplate!(tpl.id, tpl.versions[0].id, "Revisão da planta")).toEqual({ text: '{"formato":"ptw.modelo/1","fonte":"servidor"}' })
    const call = srv.find("GET", /\/export$/)[0]
    expect(call.query.get("versionId")).toBe(tpl.versions[0].id)
    expect(decodeURIComponent(call.headers.get("x-ptw-reason")!)).toBe("Revisão da planta")
  })

  it("401 antigo durante o novo login em voo não invalida a entrada que está chegando", async () => {
    let releaseActivity!: () => void
    let releaseLogin!: () => void
    const { port } = await boot("Marina Costa", [], {
      "POST /session/activity": async () => { await new Promise<void>((resolve) => { releaseActivity = resolve }); return err(401, "PTA02", "Sessão anterior encerrada") },
      "POST /session/login": async () => { await new Promise<void>((resolve) => { releaseLogin = resolve }); return { body: sessionOf("Paulo Lima", { auth: "ldap", csrfToken: "csrf-paulo", grants: [] }) } },
    })
    const activity = port.session.activity!()
    const login = port.session.login!("paulo", "senha-de-teste")
    releaseActivity()
    await activity
    releaseLogin()
    await login
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: person("Paulo Lima").id, grants: [] })
  })
})

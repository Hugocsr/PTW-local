import { describe, expect, it, vi } from "vitest"
import { createHttp, errorOf } from "./http"
import { BASE, err, fakeServer, NETWORK } from "./testkit"

const make = (handlers: Parameters<typeof fakeServer>[0], o: Parameters<typeof createHttp>[0] = {}) => {
  const srv = fakeServer(handlers)
  return { srv, http: createHttp({ fetch: srv.fetch, clientName: () => "aparelho-1", csrf: () => "csrf-9", ...o }) }
}

describe("cliente HTTP", () => {
  it("leitura: X-Request-Id e X-Ptw-Client, sem CSRF, Idempotency-Key nem If-Match", async () => {
    const { srv, http } = make({ "GET /health": () => ({ body: { ok: true } }) })
    const r = await http.request({ method: "GET", path: "/health" })
    expect(r.ok).toBe(true)
    const h = srv.calls[0].headers
    expect(h.get("x-request-id")).toMatch(/^ptw-[0-9a-f-]{36}$/)
    expect(h.get("x-ptw-client")).toBe("aparelho-1")
    for (const k of ["x-ptw-csrf", "idempotency-key", "if-match", "x-ptw-undo", "x-ptw-reason"]) expect(h.get(k)).toBeNull()
  })

  it("escrita: CSRF, chave, If-Match entre aspas, Desfazer e motivo em UTF-8 com porcentagem", async () => {
    const { srv, http } = make({ "POST /x": () => ({ status: 201, body: { a: 1 }, headers: { ETag: '"8"', "Idempotency-Replayed": "true" } }) })
    const r = await http.request({ method: "POST", path: "/x", body: { n: 1 }, key: "k-1", ifMatch: 7, undo: true, reason: "Não é seguro: ação" })
    const h = srv.calls[0].headers
    expect(h.get("x-ptw-csrf")).toBe("csrf-9")
    expect(h.get("idempotency-key")).toBe("k-1")
    expect(h.get("if-match")).toBe('"7"')
    expect(h.get("x-ptw-undo")).toBe("true")
    expect(decodeURIComponent(h.get("x-ptw-reason")!)).toBe("Não é seguro: ação")
    expect(h.get("x-ptw-reason")).toMatch(/^[\x20-\x7e]+$/)
    expect(srv.calls[0].body).toEqual({ n: 1 })
    expect(r).toMatchObject({ ok: true, status: 201, etag: 8, replayed: true })
  })

  it("lista na consulta repete a chave e ignora o vazio", async () => {
    const { srv, http } = make({ "GET /audit/events": () => ({ body: {} }) })
    await http.request({ method: "GET", path: "/audit/events", query: { group: ["acesso", "negada"], q: "", before: 5, x: undefined } })
    expect(srv.calls[0].query.getAll("group")).toEqual(["acesso", "negada"])
    expect(srv.calls[0].query.has("q")).toBe(false)
    expect(srv.calls[0].query.get("before")).toBe("5")
    expect(http.url("/a", { b: 1 })).toBe(`${BASE}/a?b=1`)
  })

  it("corpo de erro vira RuleError com PTWnn, PTAnn e detail", async () => {
    const { http } = make({ "POST /a": () => err(409, "PTW10", "Equipamento com PT aberta", "pt-1"), "POST /b": () => err(409, "PTA06", "Revisão desatualizada", "9"), "POST /c": () => err(422, "23514", "Valor fora") })
    expect(await http.request({ method: "POST", path: "/a" })).toMatchObject({ ok: false, status: 409, down: false, error: { code: "PTW10", message: "Equipamento com PT aberta", detail: "pt-1" } })
    expect(await http.request({ method: "POST", path: "/b" })).toMatchObject({ error: { code: "PTA06", detail: "9" } })
    expect(await http.request({ method: "POST", path: "/c" })).toMatchObject({ error: { code: "23514" } })
  })

  it("sem rede ou 503: recusa 'sem servidor' e servidor fora; 502 de proxy também", async () => {
    const reach = vi.fn()
    const { http } = make({ "GET /a": () => NETWORK, "GET /b": () => err(503, "PTA01", "Banco fora do ar"), "GET /c": () => ({ status: 502, text: "<html>Bad gateway</html>" }), "GET /d": () => ({ body: {} }) }, { onReach: reach })
    expect(await http.request({ method: "GET", path: "/a" })).toMatchObject({ ok: false, down: true, status: 0, error: { code: "sem_servidor" } })
    expect(await http.request({ method: "GET", path: "/b" })).toMatchObject({ ok: false, down: true, error: { code: "PTA01" } })
    expect(await http.request({ method: "GET", path: "/c" })).toMatchObject({ ok: false, down: true, error: { code: "sem_servidor" } })
    await http.request({ method: "GET", path: "/d" })
    expect(reach.mock.calls.map((c) => c[0])).toEqual([false, false, false, true])
  })

  it("401 avisa a volta para a entrada; 504 não é servidor fora", async () => {
    const out = vi.fn()
    const { http } = make({ "GET /a": () => err(401, "PTA02", "Sem sessão"), "GET /b": () => err(504, "57014", "Tempo esgotado") }, { onUnauthorized: out })
    expect(await http.request({ method: "GET", path: "/a" })).toMatchObject({ ok: false, status: 401, error: { code: "PTA02" } })
    expect(out).toHaveBeenCalledTimes(1)
    expect(await http.request({ method: "GET", path: "/b" })).toMatchObject({ down: false })
  })

  it("corpo que não é JSON vira PTA99; 204 e texto", async () => {
    expect(errorOf(500, "oops")).toEqual({ code: "PTA99", message: "Erro inesperado do servidor (HTTP 500)" })
    const { http } = make({ "DELETE /a": () => ({ status: 204 }), "GET /t": () => ({ text: "linha\n" }) })
    expect(await http.request({ method: "DELETE", path: "/a" })).toMatchObject({ ok: true, status: 204 })
    expect(await http.request({ method: "GET", path: "/t", as: "text" })).toMatchObject({ ok: true, data: "linha\n" })
  })

  it("bloqueio PTA12 (429) diz quanto esperar, pelo retry-after em segundos, arredondado para minutos", async () => {
    const lock = (retry?: string) => ({ status: 429, body: { code: "PTA12", message: "Tentativas demais: aguarde" }, headers: retry === undefined ? undefined : { "Retry-After": retry } })
    const { http } = make({ "POST /s1": () => lock("340"), "POST /s2": () => lock("30"), "POST /s3": () => lock("60"), "POST /s4": () => lock(), "POST /s5": () => lock("900") })
    expect(await http.request({ method: "POST", path: "/s1" })).toMatchObject({ ok: false, status: 429, error: { code: "PTA12", message: "Tentativas demais. Tente de novo em 6 minutos." } })
    expect(await http.request({ method: "POST", path: "/s2" })).toMatchObject({ error: { message: "Tentativas demais. Tente de novo em 1 minuto." } })
    expect(await http.request({ method: "POST", path: "/s3" })).toMatchObject({ error: { message: "Tentativas demais. Tente de novo em 1 minuto." } })
    expect(await http.request({ method: "POST", path: "/s4" })).toMatchObject({ error: { code: "PTA12", message: "Tentativas demais: aguarde" } })
    expect(await http.request({ method: "POST", path: "/s5" })).toMatchObject({ error: { message: "Tentativas demais. Tente de novo em 15 minutos." } })
  })
})

/**
 * SPEC 017: `GET /locations/with-assets` lista só os locais que têm ativo `ativo` (do local ou de um
 * descendente), do tipo pedido, com a contagem distinta. Contra o PostgreSQL de verdade (como ptw_api).
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../src/app.js"
import { postgresDriver } from "../src/db.js"
import { HOST, ORIGIN, cookiePair, testConfig } from "./helpers/app.js"
import { HAS_DB, createTestDb, type TestDb } from "./helpers/realDb.js"

const BASE = "/api/v1"
describe.skipIf(!HAS_DB)("com banco: locais com ativos (SPEC 017)", () => {
  let db: TestDb
  let app: Awaited<ReturnType<typeof buildApp>>
    const sessions = new Map<string, Record<string, string>>()
  async function as(who: string) {
    const cached = sessions.get(who)
    if (cached) return cached
    const res = await app.inject({ method: "POST", url: `${BASE}/session/dev-login`, headers: { host: HOST, origin: ORIGIN }, payload: { login: who } })
    expect(res.statusCode, res.body).toBe(200)
    const h = { host: HOST, origin: ORIGIN, cookie: cookiePair(res), "x-ptw-csrf": (res.json() as { csrfToken: string }).csrfToken }
    sessions.set(who, h)
    return h
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(who: string, method: "GET" | "POST" | "PATCH", url: string, payload?: unknown, extra: Record<string, string> = {}): Promise<{ status: number; body: string; json: () => any }> {
    const headers: Record<string, string> = { ...(await as(who)), ...extra }
    if (method !== "GET" && !headers["idempotency-key"]) headers["idempotency-key"] = randomUUID()
    const res = await app.inject({ method, url: `${BASE}${url}`, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
    return { status: res.statusCode, body: res.body, json: () => res.json() }
  }
  const ids: Record<string, string> = {}
  const typeIds: Record<string, string> = {}
  const asset = (code: string, typeId: string, locationIds: string[], status = "ativo") =>
    call("ana", "POST", "/assets", { typeId, code, name: `Ativo ${code}`, status, locationIds })

  beforeAll(async () => {
    db = await createTestDb("locassets")
    app = await buildApp({ config: testConfig({ db: db.config }), driver: postgresDriver(db.config), logger: false })
    await app.ready()
    const t = async (family: string, label: string) => { const r = await call("ana", "POST", "/types", { family, label }); expect(r.status, r.body).toBe(201); return r.json().id as string }
    const plantType = await t("local", "Planta"), areaType = await t("local", "Área")
    typeIds.bomba = await t("ativo", "Bomba"); typeIds.valvula = await t("ativo", "Válvula")
    const loc = async (key: string, typeId: string, code: string, parentId?: string) => {
      const r = await call("ana", "POST", "/locations", { typeId, code, name: code, ...(parentId ? { parentId } : {}) })
      expect(r.status, r.body).toBe(201); ids[key] = r.json().id
    }
    await loc("planta", plantType, "P1")
    await loc("a1", areaType, "A1", ids.planta); await loc("a2", areaType, "A2", ids.planta); await loc("a3", areaType, "A3", ids.planta); await loc("vazia", areaType, "A4", ids.planta)
    // a1: bomba ativa e válvula ativa; a2: só ativo inativo; a3: só válvula ativa; a4: nada.
    expect((await asset("B1", typeIds.bomba, [ids.a1])).status).toBe(201)
    expect((await asset("V1", typeIds.valvula, [ids.a1, ids.a3])).status).toBe(201)
    expect((await asset("B2", typeIds.bomba, [ids.a2], "inativo")).status).toBe(201)
  })
  afterAll(async () => { await app?.close(); await db?.drop() })

  const counts = async (qs = "") => Object.fromEntries((await call("ana", "GET", `/locations/with-assets${qs}`)).json().items.map((i: { locationId: string; count: number }) => [i.locationId, i.count]))

  it("sem filtro de tipo: só os locais com ativo ativo, com a planta somando as áreas", async () => {
    expect(await counts()).toEqual({ [ids.planta!]: 2, [ids.a1!]: 2, [ids.a3!]: 1 })
  })

  it("com tipo: só ativos desse tipo; locais sem nenhum somem", async () => {
    expect(await counts(`?assetTypeIds=${typeIds.bomba}`)).toEqual({ [ids.planta!]: 1, [ids.a1!]: 1 })
    expect(await counts(`?assetTypeIds=${typeIds.valvula}`)).toEqual({ [ids.planta!]: 1, [ids.a1!]: 1, [ids.a3!]: 1 })
    expect(await counts(`?assetTypeIds=${typeIds.bomba}&assetTypeIds=${typeIds.valvula}`)).toEqual({ [ids.planta!]: 2, [ids.a1!]: 2, [ids.a3!]: 1 })
  })

  it("ativo inativo não conta e a área vazia não aparece", async () => {
    const all = await counts()
    expect(all[ids.a2!]).toBeUndefined()
    expect(all[ids.vazia!]).toBeUndefined()
  })

  it("parâmetro inválido é recusado", async () => {
    expect((await call("ana", "GET", "/locations/with-assets?assetTypeIds=nao-e-uuid")).status).toBe(400)
  })
})

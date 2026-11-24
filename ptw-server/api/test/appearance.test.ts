import { afterEach, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import appearance from "../src/routes/appearance.js"
import { brandPng } from "../src/http/brandPng.js"
import { DEFAULT_BRAND } from "../src/shared/core/brand.js"
import { MemorySessionStore } from "../src/session/store.js"
import { makeApp, HOST, type TestApp } from "./helpers/app.js"

const open: TestApp[] = []
afterEach(async () => { for (const t of open.splice(0)) await t.app.close() })
const start = async () => { const t = await makeApp({ routes: [appearance] }); open.push(t); return t }

it("manifesto público não revela autor/revisão e imagens não publicadas não são expostas", async () => {
  const t = await start()
  t.driver.on(/select brand, revision, updated_at/, [{ brand: DEFAULT_BRAND, revision: 3, updated_at: "2026-11-23T12:00:00Z", updated_by: "privado" }])
  const r = await t.app.inject({ url: "/api/v1/appearance/public", headers: { host: HOST } })
  expect(r.statusCode, r.body).toBe(200)
  expect(r.json()).toEqual({ brand: DEFAULT_BRAND })
  const img = await t.app.inject({ url: `/api/v1/appearance/assets/${"a".repeat(64)}.png`, headers: { host: HOST } })
  expect(img.statusCode).toBe(404)
})

it("sem grant modelos, leitura administrativa, publicação e upload são recusados", async () => {
  const t = await start(), s = await t.login()
  for (const x of (t.app.ptw.sessions as MemorySessionStore).sessions.values()) x.grants = []
  for (const [method, url, payload] of [["GET", "/appearance", undefined], ["PUT", "/appearance", { brand: DEFAULT_BRAND }], ["POST", "/appearance/assets", { base64: "a".repeat(64) }]] as const) {
    const r = await t.app.inject({ method, url: `/api/v1${url}`, headers: { ...s.headers, "if-match": '"0"' }, payload })
    expect(r.statusCode, r.body).toBe(403)
  }
  expect(t.driver.find(/insert into ptw\.appearance/)).toHaveLength(0)
})

it("revisão ausente/obsoleta e contraste inválido nunca publicam", async () => {
  const t = await start(), s = await t.login()
  t.driver.on(/select brand, revision, updated_at/, [{ brand: null, revision: 2, updated_at: "2026-11-23T12:00:00Z", updated_by: null }])
  for (const [headers, payload, status] of [
    [s.headers, { brand: DEFAULT_BRAND }, 428],
    [{ ...s.headers, "if-match": '"0"' }, { brand: DEFAULT_BRAND }, 409],
    [{ ...s.headers, "if-match": '"2"' }, { brand: { ...DEFAULT_BRAND, colors: { ...DEFAULT_BRAND.colors, ink: "#ffffff" } } }, 400],
  ] as const) {
    const r = await t.app.inject({ method: "PUT", url: "/api/v1/appearance", headers, payload })
    expect(r.statusCode, r.body).toBe(status)
  }
  expect(t.driver.find(/insert into ptw\.appearance/)).toHaveLength(0)
})

it("PNG aceita imagem decodificada pelo navegador e recusa conteúdo ativo, CRC incorreto e dados após o final", () => {
  const bytes = readFileSync(new URL("fixtures/brand.png", import.meta.url))
  expect(brandPng(bytes.toString("base64"))).toEqual(bytes)
  expect(() => brandPng(Buffer.from("<svg onload='alert(1)'/>").toString("base64"))).toThrow()
  expect(() => brandPng(Buffer.concat([bytes, Buffer.from("payload")]).toString("base64"))).toThrow()
  const broken = Buffer.from(bytes); broken[40] = broken[40]! ^ 1
  expect(() => brandPng(broken.toString("base64"))).toThrow()
})

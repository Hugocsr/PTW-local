import { afterEach, expect, it } from "vitest"
import routes from "../src/routes/delegations.js"
import { MemorySessionStore } from "../src/session/store.js"
import { makeApp, type TestApp } from "./helpers/app.js"

const open: TestApp[] = []
afterEach(async () => { for (const t of open.splice(0)) await t.app.close() })
const start = async () => { const t = await makeApp({ routes: [routes] }); open.push(t); return t }
const id = "00000000-0000-7000-8000-000000000090"
const input = { id, slotId: id, delegatorId: id, delegateId: id, scopeLocationId: null, startsAt: "2026-11-23T12:00:00Z", endsAt: "2026-11-23T20:00:00Z", reason: "Teste" }

it("operador lê somente mandatos próprios e não cria nem revoga", async () => {
  const t = await start(), s = await t.login()
  for (const record of (t.app.ptw.sessions as MemorySessionStore).sessions.values()) record.grants = []
  const read = await t.app.inject({ url: "/api/v1/delegations", headers: s.headers })
  expect(read.statusCode, read.body).toBe(200)
  const query = t.driver.find(/from ptw.delegation/)[0]!.statement
  expect(query.params).toContain(false)
  expect(query.text).toMatch(/delegator_id=ptw.current_person\(\) or delegate_id=ptw.current_person\(\)/)
  for (const [url, payload] of [["/delegations", input], [`/delegations/${id}/revoke`, { reason: "Fim" }]] as const) {
    const r = await t.app.inject({ method: "POST", url: "/api/v1" + url, headers: { ...s.headers, "if-match": '"1"' }, payload })
    expect(r.statusCode, r.body).toBe(403)
  }
  expect(t.driver.find(/insert into ptw.delegation|update ptw.delegation/)).toHaveLength(0)
})

it("revisão obsoleta recusa revogação e não modifica o mandato", async () => {
  const t = await start(), s = await t.login()
  t.driver.on(/select revision from ptw.delegation/, [{ revision: 2 }])
  const r = await t.app.inject({ method: "POST", url: `/api/v1/delegations/${id}/revoke`, headers: { ...s.headers, "if-match": '"1"' }, payload: { reason: "Fim" } })
  expect(r.statusCode, r.body).toBe(409)
  expect(t.driver.find(/update ptw.delegation/)).toHaveLength(0)
})

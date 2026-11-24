import { afterEach, expect, it } from "vitest"
import groups from "../src/routes/groups.js"
import { MemorySessionStore } from "../src/session/store.js"
import { makeApp, type TestApp } from "./helpers/app.js"

const open: TestApp[] = []
afterEach(async () => { for (const x of open.splice(0)) await x.app.close() })
const start = async () => { const t = await makeApp({ routes: [groups] }); open.push(t); return t }
const input = { id: "00000000-0000-7000-8000-000000000090", name: "Manutenção", description: "Equipe local", active: true, memberIds: [] }

it("grupos exigem cadastro também na leitura e não gravam quando o acesso é negado", async () => {
  const t = await start(), s = await t.login()
  for (const record of (t.app.ptw.sessions as MemorySessionStore).sessions.values()) record.grants = []
  for (const method of ["GET", "POST"] as const) {
    const r = await t.app.inject({ method, url: "/api/v1/person-groups", headers: s.headers, ...(method === "POST" ? { payload: input } : {}) })
    expect(r.statusCode, r.body).toBe(403)
  }
  expect(t.driver.find(/insert into ptw.person_group/)).toHaveLength(0)
})

it("revisão desatualizada e id divergente recusam antes de alterar membros", async () => {
  const t = await start(), s = await t.login()
  t.driver.on(/select revision from ptw.person_group/, [{ revision: 3 }])
  for (const [id, rev, status] of [[input.id, '"2"', 409], [input.id, undefined, 428], ["00000000-0000-7000-8000-000000000091", '"3"', 400]] as const) {
    const r = await t.app.inject({ method: "PUT", url: "/api/v1/person-groups/" + id, headers: { ...s.headers, ...(rev ? { "if-match": rev } : {}) }, payload: input })
    expect(r.statusCode, r.body).toBe(status)
  }
  expect(t.driver.find(/delete from ptw.person_group_member/)).toHaveLength(0)
})

it("nome vazio/duplicação de membro não são aceitos e o contrato não aceita privilégios no grupo", async () => {
  const t = await start(), s = await t.login()
  for (const payload of [{ ...input, name: " " }, { ...input, memberIds: [input.id, input.id] }, { ...input, grants: ["cadastro"] }]) {
    const r = await t.app.inject({ method: "POST", url: "/api/v1/person-groups", headers: s.headers, payload })
    expect(r.statusCode, r.body).toBe(400)
  }
  expect(t.driver.find(/insert into ptw.person_group/)).toHaveLength(0)
})

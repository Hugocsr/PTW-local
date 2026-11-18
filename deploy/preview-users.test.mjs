import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { previewEntries } from "./preview-users.mjs"
const hash = (value) => "{TEST}" + createHash("sha256").update(value).digest("hex")
const marina = "marina-ficticia-somente-teste"
const extra = { "rafael.nunes": "rafael-ficticio-somente-teste", "paulo.lima": "paulo-ficticio-somente-teste" }

test("Configuração antiga preserva Marina e seu identificador", () => {
  const result = previewEntries(marina, undefined, hash)
  assert.match(result.ldif, /entryUUID: 00000001-0000-4000-8000-000000000001/)
  assert.equal((result.ldif.match(/objectClass: inetOrgPerson/g) ?? []).length, 1)
  assert.ok(!result.ldif.includes(marina))
})
test("Três pessoas têm acesso, mas só Marina pertence ao grupo administrativo", () => {
  const result = previewEntries(marina, JSON.stringify(extra), hash)
  const access = result.ldif.split(`dn: ${result.accessGroup}\n`)[1].split("\n\n")[0]
  const admin = result.ldif.split(`dn: ${result.adminGroup}\n`)[1]
  assert.equal((result.ldif.match(/objectClass: inetOrgPerson/g) ?? []).length, 3)
  assert.equal((access.match(/^member:/gm) ?? []).length, 3)
  assert.equal((admin.match(/^member:/gm) ?? []).length, 1)
  assert.match(admin, /member: uid=marina.costa,/)
  assert.ok(!admin.includes("rafael.nunes") && !admin.includes("paulo.lima"))
  for (const password of [marina, ...Object.values(extra)]) assert.ok(!result.ldif.includes(password))
})
test("Recusa configuração inválida, perfis arbitrários e senhas fracas ou compartilhadas", () => {
  for (const json of ["{", "null", "[]", '{"intruso":"aaaaaaaaaaaaaaaaaaaa"}', '{"rafael.nunes":1}', '{"rafael.nunes":"curta"}', JSON.stringify({ "rafael.nunes": marina })]) {
    assert.throws(() => previewEntries(marina, json, hash))
  }
  assert.throws(() => previewEntries("curta", undefined, hash))
})

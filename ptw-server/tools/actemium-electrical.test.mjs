import { test } from "node:test"
import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { electricalContent } from "./actemium-electrical.mjs"
import YAML from "../api/node_modules/yaml/dist/index.js"
import { Ajv2020 } from "../api/node_modules/ajv/dist/2020.js"
import addFormats from "../api/node_modules/ajv-formats/dist/index.js"
import { fixtureAnswer, fixtureForPermit } from "./actemium-fixtures.mjs"

test("Roteiro Actemium usa métodos e endereços existentes no contrato HTTP", () => {
  const contract = YAML.parse(readFileSync(new URL("../api/openapi.yaml", import.meta.url), "utf8"))
  const script = readFileSync(new URL("./actemium-local.mjs", import.meta.url), "utf8")
  let checked = 0
  for (const call of script.matchAll(/api\.(?:ok|call)\("([A-Z]+)",\s*(["`])([^\n]*?)\2/g)) {
    const [, method, , expression] = call
    if (!expression.startsWith("/")) continue
    let path = expression.replace(/\$\{[^}]+\}/g, "value").split("?")[0]
    if (path.endsWith("/")) path += "value" // literal prefix concatenated with an identifier
    const route = Object.entries(contract.paths).find(([pattern]) => new RegExp("^" + pattern.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(path))
    assert.ok(route?.[1][method.toLowerCase()], `${method} ${expression}: operação ausente do OpenAPI`)
    checked++
  }
  assert.ok(checked >= 20, "As chamadas HTTP explícitas do cenário devem ser verificadas")
})

const source = fileURLToPath(new URL("../../ptw-mockup-v2/src/", import.meta.url))
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) specifier = pathToFileURL(resolve(source, specifier.slice(2))).href
  if (specifier.startsWith(".") || specifier.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL)
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) return next(url.href + ".ts", context)
  }
  return next(specifier, context)
} })
const { formProblem, answerProblem, normalizeForm } = await import(pathToFileURL(resolve(source, "core/formRules.ts")))
const { exportarModelo, importarModelo } = await import(pathToFileURL(resolve(source, "core/templatePackage.ts")))
const registry = JSON.parse(readFileSync(new URL("../api/seed/dados/exemplo.json", import.meta.url)))
const model = registry.templates.find((t) => t.name === "Intervenção desenergizada em painel")
const original = model.versions.find((v) => v.status === "ativa")

for (const baseline of [true, false]) test(`Vínculos e respostas ${baseline ? "vigente" : "2027"}: conjunto e subconjunto usam o ativo da própria PT`, () => {
  const form = normalizeForm(electricalContent(structuredClone(original), baseline).form)
  const person = registry.people.find((p) => p.login === "rafael.nunes")
  const permitId = "019a0020-0000-7000-8000-000000000099"
  const attachmentId = "019a0020-0000-7000-8000-000000000098"
  const assetIds = ["019a0020-0000-7000-8000-000000000096", "019a0020-0000-7000-8000-000000000097"]
  for (const selected of assetIds) {
    const permit = { assetIds: [selected], windowStart: "2026-11-18T12:00:00Z", windowEnd: "2026-11-18T19:00:00Z" }
    const ctx = { permitId, permitAssetIds: permit.assetIds, attachments: [{ id: attachmentId, permitId, kind: "arquivo" }],
      people: registry.people, optionLists: registry.optionLists, pathIds: [], today: "2026-11-18", now: "2026-11-18T12:00:00Z" }
    for (const item of form.sections.flatMap((s) => s.items)) {
      const answer = fixtureForPermit(item, permit, { personId: person.id, attachmentId, timezone: "America/Sao_Paulo" })
      if (!answer) continue
      if (item.kind === "anexo") ctx.attachments[0].kind = item.accept[0]
      assert.equal(answerProblem(form, item.id, answer, ctx), null, item.id)
      if (item.kind === "isolamento") {
        assert.equal(answer.rows[0].assetId, selected)
        const foreign = assetIds.find((id) => id !== selected)
        assert.equal(answerProblem(form, item.id, { ...answer, rows: [{ ...answer.rows[0], assetId: foreign }] }, ctx)?.code, "PTW15")
        assert.throws(() => fixtureForPermit(item, { ...permit, assetIds: [] }, {}), /ativo selecionado/)
      }
    }
  }
})

for (const baseline of [true, false]) test(`Respostas fictícias ${baseline ? "vigente" : "2027"}: todos os campos respeitam o contrato JSON`, () => {
  const doc = YAML.parse(readFileSync(new URL("../api/openapi.yaml", import.meta.url), "utf8"))
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false })
  addFormats(ajv)
  ajv.addSchema({ ...doc, $id: "fixture-contract" })
  const validate = ajv.compile({ $ref: "fixture-contract#/components/schemas/ItemAnswer" })
  const context = { personId: "019a0020-0000-7000-8000-000000000002", assetId: "019a0020-0000-7000-8000-000000000003",
    attachmentId: "019a0020-0000-7000-8000-000000000004", timezone: "America/Sao_Paulo",
    windowStart: "2026-11-18T12:00:00Z", windowEnd: "2026-11-18T19:00:00Z" }
  const content = electricalContent(structuredClone(original), baseline)
  let count = 0
  for (const item of content.form.sections.flatMap((s) => s.items)) {
    const answer = fixtureAnswer(item, context)
    if (answer === undefined) { assert.equal(item.kind, "aviso"); continue }
    assert.ok(validate(answer), item.id + ": " + ajv.errorsText(validate.errors))
    if (item.kind === "isolamento") {
      assert.equal(answer.rows[0].by, context.personId)
      assert.equal(validate({ ...answer, rows: [{ ...answer.rows[0], by: "Rafael Nunes — fictício" }] }), false)
    }
    count++
  }
  assert.ok(count >= 25)
})

for (const baseline of [true, false]) test(`Actemium ${baseline ? "vigente" : "2027"}: estrutura, sequência e portabilidade`, () => {
  const v = electricalContent(structuredClone(original), baseline)
  assert.equal(formProblem(v.form), null)
  const policy = v.form.electrical
  assert.equal(policy.isolation.length, baseline ? 6 : 7)
  assert.equal(policy.restoration.length, baseline ? 6 : 8)
  assert.equal(!!policy.shift, !baseline)
  const items = v.form.sections.flatMap((s) => s.items)
  assert.ok(items.find((i) => i.id === "el_procedure").attach)
  assert.ok(v.form.sections.find((s) => s.id === "el_restoration").stageId === v.stages.find((s) => s.kind === "aceite_area").id)
  const pkg = exportarModelo({ ...model, versions: [v] }, registry, { agora: "2026-11-18T12:00:00-03:00", versaoId: v.id })
  assert.deepEqual(pkg.modelo.politica_eletrica, policy)
  const result = importarModelo(pkg, registry, { agora: "2026-11-18T12:00:00-03:00" })
  assert.deepEqual(result.problemas.filter((p) => p.nivel === "erro"), [])
  assert.equal(formProblem(result.rascunho.versao.form), null)
  assert.equal(result.rascunho.versao.form.electrical.standard, policy.standard)
  assert.notEqual(result.rascunho.versao.form.electrical.procedure, policy.procedure)
})

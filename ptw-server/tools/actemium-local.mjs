import assert from "node:assert/strict"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { Api, id, key, match } from "./actemium-api.mjs"
import { electricalContent } from "./actemium-electrical.mjs"
import { fixtureForPermit } from "./actemium-fixtures.mjs"

const api = new Api()
const baseline = process.argv.includes("--base-vigente")
const scenarioId = (name) => id((baseline ? "base-vigente:" : "") + name)
const conditionId = baseline ? "act_sinal" : "act_porta"
const output = resolve(process.env.PTW_EVIDENCE_DIR ?? fileURLToPath(new URL("../../../outputs/actemium/", import.meta.url)))
mkdirSync(output, { recursive: true })
const evidence = resolve(output, baseline ? "resultado-fluxo-nr10-vigente.json" : "resultado-fluxo-nr10-2027.json")
let report = { scenario: baseline ? "Actemium fictício — base NR-10 vigente (2019)" : "Actemium fictício v1", checks: [], inventory: {}, startedAt: new Date().toISOString() }
try { report = JSON.parse(readFileSync(evidence, "utf8")) } catch (error) {
  if (error.code !== "ENOENT") throw error
}
delete report.error
const check = (name, detail) => {
  report.checks.push({ name, detail, at: new Date().toISOString() })
  writeFileSync(evidence, JSON.stringify(report, null, 2))
  console.log(name, typeof detail === "string" ? detail : "")
}
const sessions = {}
let user = ""
async function as(login) {
  if (user === login) return
  await api.logout()
  sessions[login] = await api.login(login)
  user = login
}
async function list(path) {
  const items = []
  for (let page = 0; ; page++) {
    const r = await api.ok("GET", `${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=100`)
    items.push(...r.items)
    if (items.length >= r.total || !r.items.length) return items
  }
}
async function ensure(path, data) {
  const r = await api.call("GET", `${path}/${data.id}`)
  if (r.status === 200) return r.data
  assert.equal(r.status, 404)
  return api.ok("POST", path, data, key(id("create:" + data.id)))
}
async function type(family, label) {
  const existing = (await list("/types")).find((t) => t.family === family && t.label === label)
  return existing ?? api.ok("POST", "/types", { id: id(family + label), family, label, active: true }, key())
}

async function setup() {
  await as("marina.costa")
  const unit = await api.ok("GET", "/unit")
  assert.equal(unit.code, "UN-01", "Use a unidade do laboratório.")
  assert.equal(unit.name, "Unidade piloto (exemplo)")
  const source = (await list("/templates")).find((t) => t.name === "Intervenção desenergizada em painel")
  assert.ok(source)
  const original = source.versions.find((v) => v.status === "ativa")
  const places = [
    ["ACT-DEMO", "Actemium fictícia — homologação", "Área", "L02"],
    ["ACT-GAL", "Galpão de montagem fictício", "Prédio", "ACT-DEMO"],
    ["ACT-MEC", "Montagem mecânica fictícia", "Área", "ACT-GAL"],
    ["ACT-ELE", "Montagem elétrica fictícia", "Área", "ACT-GAL"],
    ["ACT-BAIA", "Baia de montagem fictícia", "Ponto de trabalho", "ACT-ELE"],
    ["ACT-ENS", "Área de ensaios fictícia", "Área", "ACT-GAL"],
    ["ACT-TEST", "Baia de ensaios fictícia", "Ponto de trabalho", "ACT-ENS"],
    ["ACT-ALM", "Almoxarifado fictício", "Área", "ACT-DEMO"],
    ["ACT-EXP", "Expedição fictícia", "Área", "ACT-DEMO"],
    ["ACT-CLI", "Instalação fictícia do cliente", "Área", "ACT-DEMO"],
    ["ACT-SUB", "Subestação fictícia do cliente", "Área", "ACT-CLI"],
    ["ACT-SALA", "Sala elétrica fictícia", "Sala", "ACT-SUB"],
    ["ACT-EC-INT", "Interior do eletrocentro fictício", "Sala", "ACT-SUB"],
  ]
  const locations = new Map((await list("/locations")).map((l) => [l.code, l]))
  for (const [code, name, label, parent] of places) {
    const t = await type("local", label)
    const l = await ensure("/locations", { id: id(code), code, name, typeId: t.id, parentId: locations.get(parent).id, aliases: ["Homologação fictícia"] })
    locations.set(code, l)
  }
  const assets = [
    ["ACT-CM4-001", "CM4 fictício — conjunto", "Painel / CCM", "ACT-SALA"],
    ["ACT-CM4-C01", "CM4 fictício — coluna 01", "Coluna de painel", "ACT-SALA", "ACT-CM4-001"],
    ["ACT-CM4-U01", "CM4 fictício — unidade funcional 01", "Módulo / gaveta", "ACT-SALA", "ACT-CM4-C01"],
    ["ACT-CM4-Q01", "CM4 fictício — disjuntor da unidade 01", "Disjuntor", "ACT-SALA", "ACT-CM4-U01"],
    ["ACT-PA4-001", "PA4 fictício — conjunto MT", "Painel / CCM", "ACT-SALA"],
    ["ACT-PA4-C01", "PA4 fictício — cubículo de entrada", "Cubículo MT", "ACT-SALA", "ACT-PA4-001"],
    ["ACT-PA4-Q01", "PA4 fictício — disjuntor extraível", "Disjuntor", "ACT-SALA", "ACT-PA4-C01"],
    ["ACT-EC-001", "Eletrocentro fictício — conjunto", "Eletrocentro", "ACT-SUB"],
    ["ACT-EC-Q01", "Quadro auxiliar fictício do eletrocentro", "Painel / CCM", "ACT-EC-INT", "ACT-EC-001"],
  ]
  const assetRows = []
  for (const [code, name, label, place] of assets) {
    const t = await type("ativo", label)
    const result = await ensure("/assets", { id: id(code), code, name, typeId: t.id, locationIds: [locations.get(place).id], aliases: ["Fabricante de referência Actemium — dados fictícios"] })
    assetRows.push(result.asset ?? result)
  }
  const relation = (await list("/types")).find((t) => t.systemKey === "parte_de")
  const links = await list("/asset-relations")
  for (const [code, , , , parent] of assets.filter((a) => a[4])) {
    if (!links.some((r) => r.fromId === id(code) && r.toId === id(parent) && r.kindId === relation.id)) {
      await api.ok("POST", "/asset-relations", { id: id(code + ":parent"), fromId: id(code), toId: id(parent), kindId: relation.id }, key())
    }
  }
  const modelId = scenarioId("model")
  let modelResponse = await api.call("GET", "/templates/" + modelId)
  if (modelResponse.status === 404) {
    const ids = new Map([...original.stages.map((s) => s.id), ...original.stages.flatMap((s) => s.slots.map((slot) => slot.id))].map((old) => [old, scenarioId(old)]))
    const content = JSON.parse(JSON.stringify({
      locationTypeIds: original.locationTypeIds, assetTypeIds: original.assetTypeIds,
      stages: original.stages, separation: original.separation, form: original.form,
      note: baseline
        ? "Homologação fictícia baseada no checklist local e NR-10 vigente (2019). Revisar engenharia/SST. Comparação com modelo de preparação 2027."
        : "Homologação fictícia. Base: checklist do laboratório. Validar engenharia/SST. Mapeamento NR-10 2027 no roteiro.",
      maxWindowHours: 8, holdsEquipment: true,
    }), (_, value) => typeof value === "string" && ids.has(value) ? ids.get(value) : value)
    content.assetTypeIds = [...new Set(assetRows.map((a) => a.typeId))]
    const stage = content.stages[0].id
    content.form.sections.push({
      id: baseline ? "act_vigente" : "act_previa",
      title: baseline ? "Controles fictícios — NR-10 vigente (2019)" : "Avaliação prévia fictícia — referência NR-10 10.7",
      stageId: stage, items: [{
        id: "act_controles", kind: "verificacao", label: "Controles da demonstração", required: true,
        answers: "sim_nao", lines: [
          ["act_apr", "APR e procedimento fictícios disponíveis para esta intervenção"],
          ["act_equipa", "Equipe, autorizações e supervisor conferidos no cenário"],
          ["act_entorno", "Entorno, trabalhos simultâneos e emergência avaliados no cenário"],
          baseline
            ? ["act_sinal", "Identificação dos circuitos, sinalização de segurança e restrição de acesso conferidas no cenário"]
            : ["act_porta", "Portas e sinalização de tensão, choque, arco e acesso verificadas no cenário"],
        ].map(([id, label]) => ({ id, label, blockOn: ["nao"], noteOn: [] })),
      }],
    })
    const newModel = await api.ok("POST", "/templates", {
      id: modelId,
      name: baseline ? "ACTEMIUM fictício — CM4 — NR-10 vigente (2019)" : "ACTEMIUM fictício — Intervenção em CM4",
      retentionClass: "pt", version: electricalContent(content, baseline),
    }, key())
    modelResponse = { status: 200, data: newModel }
  }
  assert.equal(modelResponse.status, 200)
  let model = modelResponse.data
  let version = model.versions.find((v) => v.status === "ativa")
  if (version && !version.form?.electrical) {
    const versionId = id(model.id + ":fluxo-nr10-v2")
    const existing = await api.call("GET", `/templates/${model.id}/versions/${versionId}`)
    let draft = existing.status === 200 ? existing.data : await api.ok("POST", `/templates/${model.id}/versions`, { id: versionId, copyFrom: version.id }, key(versionId))
    if (!draft.form?.electrical) {
      const content = electricalContent(structuredClone(draft), baseline)
      const { locationTypeIds, assetTypeIds, stages, separation, form, note, maxWindowHours, holdsEquipment } = content
      draft = await api.ok("PUT", `/templates/${model.id}/versions/${draft.id}`, { locationTypeIds, assetTypeIds, stages, separation, form, note, maxWindowHours, holdsEquipment }, match(draft.revision))
    }
    model = await api.ok("POST", `/templates/${model.id}/versions/${draft.id}/activate`, undefined, match(draft.revision))
    version = model.versions.find((v) => v.status === "ativa")
  }
  if (!version) {
    const draft = model.versions.find((v) => v.status === "rascunho")
    model = await api.ok("POST", `/templates/${model.id}/versions/${draft.id}/activate`, undefined, match(draft.revision))
    version = model.versions.find((v) => v.status === "ativa")
  }
  report.inventory = { unit, locations: places.map(([code]) => locations.get(code)), assets: assetRows, model, sourceModel: { id: source.id, activeVersion: original.id } }
  check("Cadastros preparados sem duplicação", { locations: places.length, assets: assets.length, model: model.id })
  return { model, version, locationId: locations.get("ACT-SALA").id, original }
}

const detail = (pid) => api.ok("GET", "/permits/" + pid)
async function draft(ctx, name, asset) {
  const pid = scenarioId(name)
  const exists = await api.call("GET", "/permits/" + pid)
  if (exists.status === 200) return exists.data
  assert.equal(exists.status, 404)
  const now = Date.now()
  const people = Object.fromEntries(["rafael.nunes", "paulo.lima", "marina.costa"].map((name, i) => [name, `019a0020-0000-7000-8000-${String(i === 2 ? 1 : i + 2).padStart(12, "0")}`]))
  return api.ok("POST", "/permits", {
    id: pid, templateId: ctx.model.id, versionId: ctx.version.id, locationId: ctx.locationId,
    assetIds: [id(asset)], scope: "ACTEMIUM FICTÍCIO — " + (baseline ? "base vigente — " : "") + name,
    windowStart: new Date(now - 60000).toISOString(), windowEnd: new Date(now + 7 * 3600000).toISOString(),
    team: {
      "019a0004-0000-7000-8000-000000000003": [people["rafael.nunes"]],
      "019a0004-0000-7000-8000-000000000001": [people["paulo.lima"]],
      "019a0004-0000-7000-8000-000000000004": [people["marina.costa"]],
    },
  }, key(scenarioId(name + ":create")))
}
async function answer(pid, itemId, value) {
  return api.ok("PUT", `/permits/${pid}/answers/${itemId}`, value)
}
async function fill(pid, stageId) {
  const d = await detail(pid)
  for (const item of d.form.sections.filter((s) => s.stageId === stageId).flatMap((s) => s.items)) {
    if (d.permit.answers[item.id]) continue
    let attachmentId
    if (item.kind === "anexo" || item.kind === "documento") {
      // The fixture is visibly labeled as fictional test evidence.
      const png = readFileSync(new URL("actemium-evidencia.png", import.meta.url))
      const sha256 = createHash("sha256").update(png).digest("hex")
      await api.ok("PUT", "/blobs/" + sha256, png, { "Content-Type": "image/png" })
      const attachment = await api.ok("POST", `/permits/${pid}/attachments`, {
        id: id(pid + item.id), itemId: item.id, kind: item.kind === "documento" ? "arquivo" : "foto", sha256,
        fileName: "FICTICIO-actemium.png", width: 640, height: 240,
      }, key(id(pid + item.id)))
      attachmentId = attachment.id
    }
    const value = fixtureForPermit(item, d.permit, { personId: sessions["rafael.nunes"].person.id, attachmentId,
      timezone: report.inventory.unit.timezone })
    if (value) await answer(pid, item.id, value)
  }
}
async function refused(name, response, code) {
  assert.ok(response.status >= 400 && response.status < 500, JSON.stringify(response.data))
  if (code) assert.equal(response.data.code, code, name)
  check(name, { http: response.status, code: response.data.code, message: response.data.message })
}
async function submit(d, token) {
  return api.call("POST", `/permits/${d.permit.id}/submit`, undefined, { ...match(d.permit.rowVersion), ...key(token) })
}
async function sign(pid, stageName, meaning, login) {
  await as(login)
  let d = await detail(pid)
  const stage = report.inventory.model.versions.find((v) => v.status === "ativa").stages.find((s) => s.name === stageName)
  const slot = stage.slots.find((s) => s.meaning === meaning)
  const existing = d.signatures.find((s) => s.slotId === slot.id && !s.voidedAt && s.rev === d.permit.revision)
  if (existing) return d
  await fill(pid, stage.id)
  const token = id(pid + meaning + (d.permit.resumedAt ?? "first"))
  const body = { slotId: slot.id, rev: d.permit.revision, id: token }
  d = await api.ok("POST", `/permits/${pid}/signatures`, body, key(token))
  const replay = await api.ok("POST", `/permits/${pid}/signatures`, body, key(token))
  assert.equal(replay.signatures.length, d.signatures.length)
  assert.ok(d.signatures.some((s) => s.slotId === slot.id && s.personId === sessions[login].person.id && !s.voidedAt))
  check("Assinatura " + meaning, { user: login, state: d.permit.state, idempotency: true })
  return d
}

async function verifyFinal(pid) {
  await as("marina.costa")
  const d = await detail(pid)
  assert.equal(d.permit.state, "encerrada")
  const files = []
  for (const attachment of d.attachments) {
    const response = await api.call("GET", `/attachments/${attachment.id}/content?mode=visto`)
    assert.equal(response.status, 200)
    assert.equal(createHash("sha256").update(response.raw).digest("hex"), attachment.sha256)
    files.push({ id: attachment.id, name: attachment.fileName, sha256: attachment.sha256 })
  }
  assert.ok(files.length >= 3)
  const history = await api.ok("GET", `/permits/${pid}/history?pageSize=100`)
  const denied = history.items.filter((event) => event.ok === false)
  assert.ok(denied.length >= 4, "Campos, condição e duas recusas de cargo devem estar na auditoria.")
  const chain = await api.ok("POST", "/audit/chain/verify")
  assert.equal(chain.verified.ok, true)
  assert.equal(chain.verified.firstBroken, null)
  const holds = await api.ok("GET", "/equipment-holds?assetId=" + id("ACT-CM4-Q01"))
  assert.ok(!holds.some((h) => h.permitId === pid))
  const source = await api.ok("GET", "/templates/" + report.inventory.sourceModel.id)
  assert.equal(source.versions.find((v) => v.status === "ativa").id, report.inventory.sourceModel.activeVersion)
  report.final = d
  report.history = history
  report.chain = chain
  report.files = files
  report.denied = denied
  check("Anexos íntegros, auditoria conferida e modelo original preservado", { files: files.length, denied: denied.length, chain })
}

async function run() {
  const ctx = await setup()
  await as("rafael.nunes")
  let d = await draft(ctx, "ciclo-completo-nr10-v2", "ACT-CM4-001")
  const pid = d.permit.id
  report.permitId = pid
  if (d.permit.state === "encerrada") {
    await verifyFinal(pid)
    check("Ciclo já encerrado; registros preservados", d.permit.number)
    return
  }
  const first = ctx.version.stages[0]
  if (d.permit.state === "rascunho") {
    if (!baseline) {
      const missingShift = await submit(d)
      await refused("Envio sem turno recusado", missingShift, "PTW34")
      assert.match(missingShift.data.message, /turno/)
      // Complete only the shift, then independently verify the missing-document gate.
      const shiftIds = new Set(Object.values(ctx.version.form.electrical.shift))
      for (const item of ctx.version.form.sections.flatMap((s) => s.items).filter((i) => shiftIds.has(i.id))) {
        await answer(pid, item.id, fixtureForPermit(item, d.permit, { timezone: report.inventory.unit.timezone }))
      }
    }
    await refused("Envio sem campos obrigatórios", await submit(await detail(pid)), "PTW16")
    await fill(pid, first.id)
    await answer(pid, "act_controles", { t: "verificacao", lines: { [conditionId]: { a: "nao" } } })
    await refused("Condição impeditiva recusa envio", await submit(await detail(pid)), "PTW16")
    await answer(pid, "act_controles", { t: "verificacao", lines: { [conditionId]: { a: "sim" } } })
    const token = scenarioId("submit-main-nr10-v2")
    const input = await detail(pid)
    const sent = await submit(input, token)
    assert.equal(sent.status, 200, JSON.stringify(sent.data))
    const replay = await submit(input, token)
    assert.equal(replay.data.signatures.length, sent.data.signatures.length)
    d = await detail(pid)
    assert.equal(d.permit.state, "em_analise")
    check("Envio e releitura persistida", { number: d.permit.number, state: d.permit.state, idempotency: true })
  }
  report.number = d.permit.number
  const probe = await draft(ctx, "conflito-subconjunto-nr10-v2", "ACT-CM4-Q01")
  if (probe.permit.state === "rascunho") {
    await fill(probe.permit.id, first.id)
    await refused("Subconjunto bloqueado pela PT do conjunto", await submit(await detail(probe.permit.id)), "PTW10")
    const p = await detail(probe.permit.id)
    await api.ok("POST", `/permits/${p.permit.id}/discard`, { reason: "FICTÍCIO — término do teste de conflito" }, { ...match(p.permit.rowVersion), ...key() })
  }
  const prep = ctx.version.stages.find((s) => s.name === "Preparação")
  if ((await detail(pid)).currentStageId === prep.id) {
    await as("marina.costa")
    await refused("Assinatura sem cargo técnico", await api.call("POST", `/permits/${pid}/signatures`, { slotId: prep.slots[0].id, rev: d.permit.revision }, key()), "PTW08")
    await as("beatriz.souza")
    await refused("Assinatura fora do escopo de local", await api.call("POST", `/permits/${pid}/signatures`, { slotId: prep.slots[1].id, rev: d.permit.revision }, key()), "PTW08")
  }
  await sign(pid, "Preparação", "Registra o isolamento", "rafael.nunes")
  await sign(pid, "Preparação", "Verifica o isolamento", "paulo.lima")
  await sign(pid, "Emissão", "Emite a PT", "marina.costa")
  d = await detail(pid)
  if (d.permit.state === "emitida") {
    d = await sign(pid, "Aceite no campo", "Aceita no campo", "paulo.lima")
    assert.equal(d.permit.state, "ativa"); assert.equal(d.released, true)
  }
  if (d.permit.state === "ativa" && !d.permit.resumedAt) {
    await as("paulo.lima")
    const stopped = await api.ok("POST", `/permits/${pid}/stop`, { reason: "FICTÍCIO — parada para reavaliação" }, key(scenarioId("stop-main-nr10-v2")))
    assert.equal(stopped.permit.state, "suspensa"); assert.equal(stopped.released, false)
    check("Parada confirmada", "suspensa")
    d = stopped
  }
  if (d.permit.state === "suspensa" && d.permit.holdReason) {
    await as("marina.costa")
    d = await detail(pid)
    d = await api.ok("POST", `/permits/${pid}/resume`, { reason: "FICTÍCIO — reavaliação concluída" }, match(d.permit.rowVersion))
    assert.equal(d.released, false)
    check("Retomada aguarda novo aceite", { state: d.permit.state, released: d.released })
  }
  if (d.permit.state === "suspensa") {
    d = await sign(pid, "Aceite no campo", "Aceita no campo", "paulo.lima")
    assert.equal(d.released, true)
  }
  if (!baseline && !d.permit.revalidation) {
    await as("marina.costa")
    d = await detail(pid)
    await refused("Prorrogação não ultrapassa o turno", await api.call("POST", `/permits/${pid}/extensions`, {
      newEnd: new Date(Date.parse(d.permit.windowEnd) + 30 * 60000).toISOString(), reason: "FICTÍCIO — teste do turno",
    }, match(d.permit.rowVersion)), "PTW34")
    const now = Date.now()
    const body = { shiftStart: new Date(now - 60000).toISOString(), shiftEnd: new Date(now + 3 * 3600000).toISOString(),
      newEnd: new Date(now + 2 * 3600000).toISOString(), reason: "FICTÍCIO — avaliação local para revalidação", conditionsUnchanged: true, teamUnchanged: true, assessmentConfirmed: true }
    await as("rafael.nunes")
    d = await detail(pid)
    await refused("Revalidação por outro responsável recusada", await api.call("POST", `/permits/${pid}/revalidations`, body, match(d.permit.rowVersion)), "PTW34")
    await as("marina.costa")
    d = await detail(pid)
    await refused("Mudança de equipe exige nova PT", await api.call("POST", `/permits/${pid}/revalidations`, { ...body, teamUnchanged: false }, match(d.permit.rowVersion)), "PTW34")
    const headers = { ...match(d.permit.rowVersion), ...key(scenarioId("revalidation-main-v2")) }
    d = await api.ok("POST", `/permits/${pid}/revalidations`, body, headers)
    const replay = await api.ok("POST", `/permits/${pid}/revalidations`, body, headers)
    assert.equal(d.permit.revalidation.id, replay.permit.revalidation.id)
    assert.equal(d.permit.state, "suspensa"); assert.equal(d.released, false)
    d = await sign(pid, "Aceite no campo", "Aceita no campo", "paulo.lima")
    assert.equal(d.released, true)
    check("Revalidação auditada e idempotente; novo aceite obrigatório", d.permit.revalidation)
  }
  await sign(pid, "Entrega", "Entrega a área", "paulo.lima")
  d = await sign(pid, "Aceite da área", "Encerra a PT", "marina.costa")
  assert.equal(d.permit.state, "encerrada")
  const holds = await api.ok("GET", "/equipment-holds?assetId=" + id("ACT-CM4-Q01"))
  assert.equal(holds.filter((h) => h.permitId === pid).length, 0)
  const history = await api.ok("GET", `/permits/${pid}/history?pageSize=100`)
  assert.ok(history.items.some((e) => e.ok === false))
  report.history = history
  report.final = d
  check("PT encerrada, equipamento liberado e recusas auditadas", { number: d.permit.number, state: d.permit.state, events: history.items.length })
  await verifyFinal(pid)
}

try {
  await run()
  report.completedAt = new Date().toISOString()
} catch (error) {
  report.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  await api.logout().catch(() => {})
  writeFileSync(evidence, JSON.stringify(report, null, 2))
}

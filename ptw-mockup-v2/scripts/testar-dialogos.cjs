/** Regressão Playwright dos diálogos responsivos. Instruções em testar-dialogos.md. */
const { chromium } = require(process.env.PTW_TEST_PLAYWRIGHT || "playwright")
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../ptw-server/api/seed/dados/exemplo.json"), "utf8"))
const base = process.env.PTW_TEST_URL || "https://localhost"
const output = process.env.PTW_TEST_OUTPUT || path.join(require("node:os").tmpdir(), "ptw-testes-dialogos")
const widths = [390, 768, 1024, 1440]
const cases = (process.env.PTW_TEST_CASES || "retomar,prorrogar,parar,enviar,devolver").split(",")
const checks = [], fieldChecks = [], errors = [], resizeEvents = []
const sessions = process.env.PTW_TEST_SESSIONS ? JSON.parse(fs.readFileSync(process.env.PTW_TEST_SESSIONS, "utf8")) : {}
fs.mkdirSync(output, { recursive: true })

function fixture(kind) {
  const template = seed.templates.find(t => t.name === "Intervenção desenergizada em painel")
  const version = template.versions.find(v => v.status === "ativa")
  const now = new Date().toISOString()
  const permit = {
    id: "019a00ee-0000-7000-8000-000000000001", templateId: template.id, versionId: version.id,
    locationId: "019a0010-0000-7000-8000-000000000003", assetIds: ["019a00ee-0000-7000-8000-000000000002"], team: {},
    authorId: seed.people.find(p => p.login === "rafael.nunes").id, revision: 1, rowVersion: 1,
    scope: "Teste controlado dos diálogos responsivos", note: null,
    state: kind === "enviar" ? "rascunho" : kind === "devolver" ? "em_analise" : "emitida",
    number: kind === "enviar" ? null : "PT-TESTE-INTERFACE",
    windowStart: new Date(Date.now() - 3600000).toISOString(), windowEnd: new Date(Date.now() + 7200000).toISOString(),
    holdAt: kind === "retomar" ? now : null, holdBy: kind === "retomar" ? seed.people[2].id : null,
    holdReason: kind === "retomar" ? "Parada do cenário controlado" : null,
    resumedAt: null, resumedBy: null, resumedReason: null,
    snapshotAt: null, snapshotSha256: null, answers: {}, answerMeta: {}, createdAt: now, updatedAt: now,
  }
  for (const item of version.form.sections.filter(s => s.stageId === version.stages[0].id).flatMap(s => s.items)) {
    permit.answers[item.id] = { t: "texto", v: "Resposta fictícia de teste" }
    permit.answerMeta[item.id] = { answeredBy: permit.authorId, answeredAt: now }
  }
  const signatures = kind === "enviar" ? [] : version.stages.slice(0, 2).flatMap(stage => stage.slots.map((slot, index) => ({
    id: `019a00ef-0000-7000-8000-${String(stage === version.stages[0] ? 1 : index + 2).padStart(12, "0")}`,
    permitId: permit.id, rev: 1, slotId: slot.id,
    personId: slot.roleIds.includes("019a0004-0000-7000-8000-000000000001") ? seed.people[2].id : permit.authorId,
    signedAt: now, voidedAt: null, voidedReason: null,
  })))
  const asset = { ...seed.assets.find(a => a.code === "CCM-L2-01"), id: permit.assetIds[0], code: "ATIVO-TESTE-INTERFACE" }
  return { permit, form: version.form, signatures, revisions: [], extensions: [], attachments: [], blobs: [], assets: [asset], blocker: null, released: false, now, currentStageId: version.stages[kind === "enviar" ? 0 : 2].id }
}

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.PTW_TEST_CHROMIUM ? { executablePath: process.env.PTW_TEST_CHROMIUM } : {}) })
  try {
    for (const kind of cases) {
      const login = kind === "enviar" ? "rafael.nunes" : "marina.costa"
      const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 }, ...(sessions[login] ? { storageState: sessions[login] } : {}) })
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on("pageerror", error => errors.push({ kind, message: error.message }))
      page.on("console", message => {
        if (message.type() === "error" && !/status of (401|403)\b/.test(message.text())) errors.push({ kind, message: message.text() })
      })
      const detail = fixture(kind), id = detail.permit.id
      let release, intercepted = 0
      const endpoint = { retomar: "resume", prorrogar: "extensions", parar: "stop", enviar: "submit", devolver: "return" }[kind]
      const responseGate = new Promise(resolve => { release = resolve })
      await page.exposeFunction("recordResize", e => resizeEvents.push({ kind, ...e }))
      await page.addInitScript(() => addEventListener("resize", () => window.recordResize({ width: innerWidth, height: innerHeight, mobile: matchMedia("(max-width: 767px)").matches })))
      await page.route("**/permits/mine*", route => route.fulfill({ json: { items: [detail], gone: [], asOf: new Date().toISOString() } }))
      await page.route("**/permits/" + id, route => route.fulfill({ json: detail }))
      // Every write to this fictitious PT is intercepted. Only login/access/session traffic reaches the server.
      await page.route("**/permits/" + id + "/**", async route => {
        const request = route.request()
        if (["GET", "HEAD"].includes(request.method())) {
          if (request.url().includes("/history")) return route.fulfill({ json: { items: [], total: 0, cursor: null } })
          return route.abort()
        }
        if (request.url().endsWith("/access")) return route.fulfill({ status: 204 })
        if (!request.url().endsWith("/" + endpoint)) {
          errors.push({ kind, message: "Escrita não esperada: " + request.url() })
          return route.fulfill({ status: 500, json: { code: "PTA99", message: "Requisição não prevista pelo teste" } })
        }
        intercepted++
        await responseGate
        await route.fulfill({ status: 403, json: { code: "PTA03", message: "Recusa controlada: preserve os dados" } })
      })
      try {
        await page.goto(base)
        if (!sessions[login]) {
          await page.getByLabel("Login", { exact: true }).fill(login)
          await page.getByLabel("Senha", { exact: true }).fill(process.env.PTW_TEST_PASSWORD || "Teste-local-2026!")
          const entered = page.waitForResponse(response => response.url().endsWith("/session/login"))
          await page.getByRole("button", { name: "Entrar", exact: true }).click()
          const response = await entered
          assert.equal(response.status(), 200, `Entrada recusada: HTTP ${response.status()}; aguarde ${response.headers()["retry-after"] || "o prazo informado"} segundos antes de repetir.`)
        }
        await page.getByRole("button", { name: /Pessoa atual:/ }).waitFor()
        sessions[login] = await context.storageState()
        await page.goto(base + "/#pt/" + id + "/etapas")
        const open = { retomar: /^Retomar$/, prorrogar: /^Prorrogar$/, parar: /^Parar$/, enviar: /^Enviar/, devolver: /^Devolver$/ }[kind]
        await page.getByRole("button", { name: open }).first().click()
        const dialog = page.getByRole("dialog")
        const initialValues = await dialog.locator("input,textarea").evaluateAll(elements => elements.map(e => e.value))
        const confirm = { retomar: "Retomar", prorrogar: "Prorrogar", parar: "Parar o trabalho", enviar: "Enviar", devolver: "Devolver a PT" }[kind]
        if (kind === "retomar") await dialog.getByLabel("Motivo da retomada", { exact: true }).fill("Preservar motivo ao girar o aparelho")
        if (kind === "devolver") await dialog.getByLabel("Motivo da devolução", { exact: true }).fill("Preservar motivo da devolução")
        if (kind === "prorrogar") {
          const end = new Date(Date.parse(detail.permit.windowEnd) + 1800000 - 10800000).toISOString()
          await dialog.getByLabel("Data do novo fim").fill(end.slice(8, 10) + end.slice(5, 7) + end.slice(0, 4))
          await dialog.getByLabel("Hora do novo fim").fill(end.slice(11, 16))
          await dialog.getByLabel("Justificativa", { exact: true }).fill("Preservar justificativa e novo fim")
        }
        if (kind === "parar") await dialog.getByRole("radio", { name: "Mudança no serviço", exact: true }).click()
        const values = async () => dialog.locator("input,textarea").evaluateAll(elements => elements.map(e => e.value))
        const before = await values()
        await dialog.getByRole("button", { name: confirm, exact: true }).click()
        for (const width of widths) {
          await page.setViewportSize({ width, height: 1000 })
          await page.waitForTimeout(100)
          assert.equal(await dialog.getAttribute("aria-busy"), "true")
          assert.deepEqual(await values(), before)
          assert.equal(await dialog.getByRole("button", { name: "Cancelar", exact: true }).isEnabled(), false)
          await page.keyboard.press("Escape")
          assert.ok(await dialog.isVisible())
          await page.screenshot({ path: path.join(output, `${kind}-pendente-${width}.png`), fullPage: true })
          assert.equal(await dialog.getAttribute("aria-busy"), "true")
          assert.deepEqual(await values(), before)
          checks.push({ kind, width, state: "pending" })
        }
        release()
        await dialog.getByRole("alert").waitFor()
        for (const width of widths) {
          await page.setViewportSize({ width, height: 1000 })
          await page.waitForTimeout(100)
          assert.match(await dialog.getByRole("alert").innerText(), /Recusa controlada/)
          assert.deepEqual(await values(), before)
          if (kind === "parar") assert.equal(await dialog.getByRole("radio", { name: "Mudança no serviço", exact: true }).getAttribute("aria-checked"), "true")
          assert.ok(await dialog.getByRole("button", { name: confirm, exact: true }).isEnabled())
          assert.equal(await page.locator('[data-sonner-toast][data-type="success"]').count(), 0)
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          await page.screenshot({ path: path.join(output, `${kind}-erro-${width}.png`), fullPage: true })
          checks.push({ kind, width, state: "refused" })
        }
        assert.equal(intercepted, 1)
        if (kind === "prorrogar") {
          const date = dialog.getByLabel("Data do novo fim")
          const validDate = await date.inputValue()
          await date.fill("120")
          const partial = await date.inputValue()
          for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 1000 })
            await page.waitForTimeout(100)
            assert.equal(await date.inputValue(), partial)
            assert.equal(await date.getAttribute("aria-invalid"), "true")
            assert.equal(await dialog.getByRole("button", { name: confirm, exact: true }).isEnabled(), false)
            fieldChecks.push({ field: "date", width, incompletePreserved: true, confirmBlocked: true })
          }
          await date.fill(validDate)
          assert.ok(await dialog.getByRole("button", { name: confirm, exact: true }).isEnabled())
          const time = dialog.getByLabel("Hora do novo fim")
          const validTime = await time.inputValue()
          await time.fill("12")
          const partialTime = await time.inputValue()
          for (const width of [390, 1440]) {
            await page.setViewportSize({ width, height: 1000 })
            await page.waitForTimeout(100)
            assert.equal(await time.inputValue(), partialTime)
            assert.equal(await time.getAttribute("aria-invalid"), "true")
            assert.equal(await dialog.getByRole("button", { name: confirm, exact: true }).isEnabled(), false)
            fieldChecks.push({ field: "time", width, incompletePreserved: true, confirmBlocked: true })
          }
          await time.fill(validTime)
          assert.ok(await dialog.getByRole("button", { name: confirm, exact: true }).isEnabled())
        }
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
        await dialog.waitFor({ state: "hidden" })
        await page.getByRole("button", { name: open }).first().click()
        await dialog.waitFor()
        assert.deepEqual(await values(), initialValues)
        assert.equal(await dialog.getByRole("alert").count(), 0)
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click()
        console.log("OK", kind)
      } catch (error) {
        errors.push({ kind, message: String(error), text: await page.locator("body").innerText() })
        await page.screenshot({ path: path.join(output, `${kind}-failure.png`), fullPage: true })
        throw error
      } finally {
        release()
        await context.tracing.stop({ path: path.join(output, `${kind}-trace.zip`) })
        await context.close()
      }
    }
    assert.deepEqual(errors, [])
    console.log(`APROVADO: ${checks.length} cenários e ${fieldChecks.length} verificações de campos incompletos`)
  } finally {
    fs.writeFileSync(path.join(output, "resultado.json"), JSON.stringify({ checks, fieldChecks, errors, resizeEvents }, null, 2))
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })

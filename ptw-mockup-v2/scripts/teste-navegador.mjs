import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { test } from "node:test"

const base = new URL(process.env.PTW_E2E_URL ?? "https://localhost")
assert.equal(base.protocol, "https:")
assert.equal(base.hostname, "localhost", "Use o laboratório integrado local.")

const { chromium } = await import(process.env.PTW_PLAYWRIGHT_ENTRY
  ? pathToFileURL(process.env.PTW_PLAYWRIGHT_ENTRY).href
  : "playwright")
const submit = process.env.PTW_E2E_SUBMIT === "1"
const resumeId = process.env.PTW_E2E_RESUME_ID
const prepare = process.env.PTW_E2E_PREPARE === "1"
if (resumeId) assert.match(resumeId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
if (prepare) assert.ok(resumeId, "Informe PTW_E2E_RESUME_ID para assinar a Preparação.")

const preparationStage = "019a0051-0000-7000-8000-000000000002"
const issuanceStage = "019a0051-0000-7000-8000-000000000003"
const preparationSigners = [
  {
    user: "rafael.nunes",
    person: "019a0020-0000-7000-8000-000000000002",
    slot: "019a0061-0000-7000-8000-000000000002",
    action: "Assinar: Registra o isolamento",
  },
  {
    user: "paulo.lima",
    person: "019a0020-0000-7000-8000-000000000003",
    slot: "019a0061-0000-7000-8000-000000000003",
    action: "Assinar: Verifica o isolamento",
  },
]

async function waitForApi(page, method, path, status, action) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === `/api/v1${path}`),
    action(),
  ])
  assert.equal(response.status(), status, `${method} ${path}`)
  return response
}

async function signIn(page, user) {
  await page.goto(base.href)
  await page.getByLabel("Login", { exact: true }).fill(user)
  await page.getByLabel("Senha", { exact: true }).fill(process.env.PTW_E2E_PASSWORD ?? "Teste-local-2026!")
  const login = await waitForApi(page, "POST", "/session/login", 200, () =>
    page.getByRole("button", { name: "Entrar", exact: true }).click())
  assert.equal((await login.json()).auth, "ldap")
}

async function signOut(page) {
  await page.getByRole("button", { name: /^Pessoa atual:/ }).click()
  await waitForApi(page, "POST", "/session/logout", 204, () =>
    page.getByRole("button", { name: "Sair", exact: true }).click())
  await page.getByLabel("Login", { exact: true }).waitFor()
  const closedSession = await page.goto(new URL("/api/v1/session", base).href)
  assert.equal(closedSession?.status(), 401)
  assert.equal((await closedSession.json()).code, "PTA02")
}

async function verifyPreparation(page, permitUrl, scope) {
  const status = page.getByRole("status").getByText("Em análise", { exact: true }).filter({ visible: true })
  await status.first().waitFor()
  await page.getByRole("listitem", { name: "Preparação", exact: true })
    .getByText("Sua vez", { exact: true }).waitFor()
  await signOut(page)
  await signIn(page, "paulo.lima")
  await page.goto(permitUrl)
  await page.getByRole("heading", { name: scope, exact: true }).waitFor()
  await status.first().waitFor()
  await signOut(page)
}

async function signPreparation(page, permitUrl, detail) {
  for (const [index, signer] of preparationSigners.entries()) {
    if (index > 0) await signIn(page, signer.user)
    const signed = () => detail.signatures.some((signature) =>
      signature.slotId === signer.slot && signature.personId === signer.person
      && signature.rev === detail.permit.revision && signature.voidedAt === null)
    if (!signed()) {
      assert.equal(detail.currentStageId, preparationStage)
      await page.goto(permitUrl)
      const stage = page.getByRole("listitem", { name: "Preparação", exact: true })
      await stage.getByRole("button", { name: signer.action, exact: true }).click()
      const hold = page.getByRole("button", { name: "Segure para assinar", exact: true })
      const response = await waitForApi(page, "POST", `/permits/${detail.permit.id}/signatures`, 200, () =>
        hold.press("Space", { delay: 1100 }))
      detail = await response.json()
      assert.ok(signed(), `A assinatura de ${signer.user} deve constar na revisão atual.`)
    }
    await signOut(page)
  }
  assert.equal(detail.permit.state, "em_analise")
  assert.equal(detail.currentStageId, issuanceStage, "As duas assinaturas devem liberar a etapa Emissão.")
}

const scenario = prepare ? "Assinar Preparação com Rafael e Paulo" :
  resumeId ? "Conferir PT enviada e etapa de Preparação" :
  submit ? "LDAP, rascunho e envio para análise" : "LDAP, criação de rascunho, recarga e encerramento da sessão"
test(scenario, async () => {
  const browser = await chromium.launch({ channel: process.env.PTW_BROWSER_CHANNEL ?? "chrome" })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(15000)
    await signIn(page, "rafael.nunes")

    if (resumeId) {
      const detail = await page.goto(new URL(`/api/v1/permits/${resumeId}`, base).href)
      assert.equal(detail?.status(), 200)
      const snapshot = await detail.json()
      const { permit } = snapshot
      assert.equal(permit.state, "em_analise")
      assert.match(permit.scope, /^Teste de navegador /)
      const permitUrl = new URL(`/#pt/${resumeId}/etapas`, base).href
      if (prepare) {
        await signPreparation(page, permitUrl, snapshot)
        return
      }
      await page.goto(permitUrl)
      await page.getByRole("heading", { name: permit.scope, exact: true }).waitFor()
      await verifyPreparation(page, permitUrl, permit.scope)
      return
    }

    await page.getByRole("button", { name: "Nova PT", exact: true }).click()
    await page.getByLabel("Modelo", { exact: true }).click()
    await page.getByRole("option", { name: "Intervenção desenergizada em painel", exact: true }).click()
    await page.getByLabel("Local", { exact: true }).click()
    await page.getByRole("option", { name: /^L02-SE · / }).click()
    if (submit) {
      await page.getByPlaceholder("Buscar por código ou nome").fill("CCM-L2-01")
      await page.getByRole("checkbox", { name: /^CCM-L2-01 · / }).check()
    }
    const scope = `Teste de navegador ${new Date().toISOString()}`
    await page.getByLabel("Serviço", { exact: true }).fill(scope)
    const created = await waitForApi(page, "POST", "/permits", 201, () =>
      page.getByRole("button", { name: "Criar rascunho", exact: true }).click())
    const { permit } = await created.json()
    assert.equal(permit.scope, scope)
    assert.equal(permit.state, "rascunho")

    await page.waitForURL((url) => url.hash.includes(permit.id))
    await page.reload()
    await page.getByRole("heading", { name: scope, exact: true }).waitFor()
    assert.ok(new URL(page.url()).hash.includes(permit.id), "A recarga deve reabrir a mesma PT.")

    if (submit) {
      const answers = `/permits/${permit.id}/answers`
      for (const [id, label, value] of [
        ["fi_ordem_de_servico", /Ordem de serviço/, "OS fictícia do teste de navegador"],
        ["fi_limite_do_circuito", /Limite do circuito/, "Painel fictício CCM-L2-01"],
      ]) {
        const field = page.getByRole("textbox", { name: label })
        await waitForApi(page, "PUT", `${answers}/${id}`, 200, async () => {
          await field.fill(value)
          await field.press("Tab")
        })
      }
      await page.getByRole("button", { name: "Enviar a PT", exact: true }).first().click()
      const hold = page.getByRole("button", { name: "Segure para enviar", exact: true })
      const sent = await waitForApi(page, "POST", `/permits/${permit.id}/submit`, 200, () =>
        hold.press("Space", { delay: 1100 }))
      assert.equal((await sent.json()).permit.state, "em_analise")
      console.log(`PT enviada para análise: ${permit.id}`)
      await verifyPreparation(page, page.url(), scope)
    } else await signOut(page)
  } finally {
    await browser.close()
  }
})

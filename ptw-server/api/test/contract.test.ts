/**
 * Contrato (`openapi.yaml`) × rotas. Lista as operações com e sem rota — a fase 1 fecha em 80/80
 * (com `PTW_CONTRACT_FULL=1` a falta de qualquer rota reprova) — e confere que o contrato inteiro
 * compila no validador que a API usa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { FastifyInstance } from "fastify"
import { Ajv2020 } from "ajv/dist/2020.js"
import { buildApp, coverage } from "../src/app.js"
import { defaultOpenapiPath } from "../src/config.js"
import { fastifyPath, loadContract } from "../src/contract/openapi.js"
import { ContractValidator } from "../src/contract/validate.js"
import { pta } from "../src/errors/apiError.js"
import { DENIED_ACTION } from "../src/errors/denied.js"
import { testConfig } from "./helpers/app.js"
import { FakeDriver } from "./helpers/fakeDb.js"

const contract = loadContract(defaultOpenapiPath())
const TOTAL = 82
/** As operações deste pacote (F1-01): tags `sessao` e `sistema`. */
const BASE = ["getSession", "login", "sessionActivity", "devLogin", "listDevPeople", "logout", "getHealth", "getStatus", "streamEvents"]

let app: FastifyInstance
beforeAll(async () => {
  // Carregamento automático de src/routes/, como em produção.
  app = await buildApp({ config: testConfig(), driver: new FakeDriver(), logger: false })
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

describe("contrato", () => {
  it(`tem ${TOTAL} operações, com operationId único, em /api/v1`, () => {
    expect(contract.operations.size).toBe(TOTAL)
    expect(contract.basePath).toBe("/api/v1")
  })

  it("só saúde e entrada dispensam sessão", () => {
    const open = [...contract.operations.values()].filter((o) => !o.secured).map((o) => o.operationId).sort()
    expect(open).toEqual(["devLogin", "getHealth", "listDevPeople", "login"])
  })

  it("todo esquema de toda operação compila no validador da API (corpo, consulta, parâmetros, cabeçalhos, respostas)", () => {
    const v = new ContractValidator(contract)
    for (const op of contract.operations.values()) expect(() => v.for(op), op.operationId).not.toThrow()
  })

  it("If-Match e Idempotency-Key são lidos do contrato; Parar não exige If-Match", () => {
    const op = (id: string) => contract.operations.get(id)!
    expect(op("stopPermit")).toMatchObject({ ifMatch: false, idempotent: true })
    expect(op("returnPermit")).toMatchObject({ ifMatch: true })
    expect(op("updateLocation")).toMatchObject({ ifMatch: true, undo: true })
    expect(op("createLocation")).toMatchObject({ ifMatch: false, idempotent: true })
    expect(op("signPermit").ptwCodes).toContain("PTW20")
  })

  it("os erros da API seguem o esquema Error do contrato", () => {
    const ajv = new Ajv2020({ strict: false, validateSchema: false })
    ajv.addSchema({ ...contract.doc, $id: "c" })
    const check = ajv.compile({ $ref: "c#/components/schemas/Error" })
    for (const e of [pta.unavailable(), pta.unauthorized(), pta.forbidden(), pta.notFound(), pta.badRequest("x", "body/a"), pta.staleRevision(7), pta.ifMatchRequired(),
      pta.idempotencyMismatch(), pta.blobMismatch(), pta.importStale(), pta.tooLarge(), pta.tooMany(), pta.notImplemented(), pta.unexpected()]) {
      expect(check(e.body()), `${e.code}: ${JSON.stringify(check.errors)}`).toBe(true)
    }
  })

  it("a tabela de ações negadas só cita operações do contrato, em formato que o banco aceita", () => {
    for (const [id, action] of Object.entries(DENIED_ACTION)) {
      expect(contract.operations.has(id), id).toBe(true)
      expect(action).toMatch(/^[a-z_]+(\.[a-z_]+)*$/)
    }
  })
})

describe("rotas × contrato", () => {
  it("lista as operações com e sem rota", () => {
    const { withRoute, withoutRoute } = coverage(app)
    console.info(`Contrato: ${withRoute.length}/${TOTAL} operações com rota.`)
    console.info(`  com rota: ${withRoute.join(", ")}`)
    console.info(`  sem rota (${withoutRoute.length}): ${withoutRoute.join(", ") || "nenhuma"}`)
    expect(withRoute.length + withoutRoute.length).toBe(TOTAL)
    expect(withRoute).toEqual(expect.arrayContaining(BASE))
    // Portão de fechamento da fase: PTW_CONTRACT_FULL=1 exige 80/80.
    if (process.env.PTW_CONTRACT_FULL === "1") expect(withoutRoute).toEqual([])
  })

  it("cada rota registrada está no método e no endereço do contrato", () => {
    for (const id of coverage(app).withRoute) {
      const op = contract.operations.get(id)!
      expect(app.hasRoute({ method: op.method, url: contract.basePath + fastifyPath(op.path) }), id).toBe(true)
    }
  })

  it("registrar uma operação que não existe no contrato, ou duas vezes, falha ao subir", async () => {
    const outside = buildApp({ config: testConfig(), driver: new FakeDriver(), logger: false, autoload: false, routes: [(api) => api.op("naoExiste" as never, () => ({}))] })
    await expect(outside).rejects.toThrow(/fora do contrato/)
    const twice = buildApp({ config: testConfig(), driver: new FakeDriver(), logger: false, routes: [(api) => api.op("getHealth", () => ({ ok: true as const, now: "" }))] })
    await expect(twice).rejects.toThrow(/duas vezes/)
  })

  it("operação do contrato ainda sem rota responde 404 PTA04 no formato único", async () => {
    const missing = coverage(app).withoutRoute[0]
    if (missing === undefined) return
    const op = contract.operations.get(missing)!
    const url = contract.basePath + op.path.replace(/\{[^}]+\}/g, "00000000-0000-7000-8000-000000000001")
    const res = await app.inject({ method: op.method, url })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ code: "PTA04" })
  })
})

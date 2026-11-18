/**
 * A aplicação: Fastify + o contrato. Cada rota é registrada por `operationId` (`api.op(...)`), e tudo
 * que é transversal acontece aqui, na mesma ordem para todas:
 *
 *   id da requisição → unidade → sessão → CSRF/Origin → If-Match → validação pelo contrato →
 *   rota (banco só por `withCtx`, ou `idempotent` nas escritas com Idempotency-Key) → conferência da
 *   resposta → erro no formato único (com a negação gravada na trilha).
 *
 * Carrega sozinho todos os módulos de `src/routes/` (qualquer profundidade) cujo `default` é uma função
 * `(api: RouteApi) => void`.
 */
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify"
import type { Config } from "./config.js"
import { fastifyPath, loadContract, type Contract } from "./contract/openapi.js"
import type { OpBody, OpParams, OpQuery, OperationId } from "./contract/types.js"
import { ContractValidator } from "./contract/validate.js"
import { Db, isUuid, type Driver } from "./db.js"
import { ApiError, pta } from "./errors/apiError.js"
import { isAuditedDenial, toApiError } from "./errors/dbError.js"
import { recordDenial } from "./errors/denied.js"
import { checkCsrf, checkOrigin, isWrite } from "./http/csrf.js"
import { EventHub } from "./http/events.js"
import { ifMatchOf } from "./http/ifMatch.js"
import { checkCommonHeaders, clientOf, reasonOf, requestIdOf, undoOf } from "./http/requestId.js"
import type { AppState, OpOptions, Probe } from "./http/state.js"
import { authenticate } from "./session/auth.js"
import { checkGrants } from "./session/grants.js"
import { DbSessionStore, type SessionStore } from "./session/store.js"

export type OpRequest<K extends OperationId> = FastifyRequest<{ Params: OpParams<K>; Querystring: OpQuery<K>; Body: OpBody<K> }>
export type OpHandler<K extends OperationId> = (req: OpRequest<K>, reply: FastifyReply) => unknown

export interface RouteApi {
  /** Registra a rota de uma operação do contrato (método, caminho e esquemas vêm do `openapi.yaml`). */
  op<K extends OperationId>(operationId: K, handler: OpHandler<K>, opts?: OpOptions): void
  readonly fastify: FastifyInstance
  readonly state: AppState
  readonly config: Config
}
export type RouteModule = (api: RouteApi) => void | Promise<void>
/** Só para dar o tipo ao `export default` de um arquivo de rotas. */
export const defineRoutes = (m: RouteModule): RouteModule => m

export interface BuildOptions {
  config: Config
  driver: Driver
  contract?: Contract
  /** Padrão: no banco (`ptw.api_session`). */
  sessions?: SessionStore
  /** Carrega `src/routes/` (padrão: sim). */
  autoload?: boolean
  /** Módulos a mais (testes). */
  routes?: RouteModule[]
  storageProbe?: () => Promise<Probe>
  now?: () => Date
  logger?: FastifyBaseLogger | boolean
}


async function httpProbe(url: string): Promise<Probe> {
  const t0 = performance.now()
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) })
    await r.body?.cancel()
    return { ok: r.ok, latencyMs: Math.round((performance.now() - t0) * 10) / 10 }
  } catch {
    return { ok: false }
  }
}

/** Todos os arquivos de rota abaixo de `dir`, em ordem estável. */
function routeFiles(dir: string): string[] {
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...routeFiles(p))
    else if (/\.(js|ts)$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.test\.(js|ts)$/.test(e.name)) out.push(p)
  }
  return out
}

function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const f = (err ?? {}) as { code?: unknown; statusCode?: unknown; message?: unknown }
  const status = typeof f.statusCode === "number" ? f.statusCode : null
  const fastifyOwn = typeof f.code === "string" && f.code.startsWith("FST_")
  if (fastifyOwn || (status !== null && status >= 400 && status < 500 && typeof f.code !== "string")) {
    if (status === 413) return pta.tooLarge()
    if (status !== null && status >= 400 && status < 500) return pta.badRequest("Requisição fora do contrato", typeof f.message === "string" ? f.message : undefined)
    return pta.unexpected(err)
  }
  return toApiError(err)
}

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const { config } = opts
  const contract = opts.contract ?? loadContract(config.openapiPath)
  const basePath = contract.basePath || config.basePath
  const db = new Db(opts.driver)
  const shutdown: (() => Promise<void>)[] = []

  const app = Fastify({
    logger: opts.logger ?? { level: config.logLevel },
    genReqId: (req) => requestIdOf(req.headers),
    bodyLimit: config.bodyLimit,
    trustProxy: true,
    exposeHeadRoutes: false,
    forceCloseConnections: true,
    // A validação é a do contrato (abaixo), não a do Fastify.
    ajv: { customOptions: { strict: false } },
  })

  let unitId: string | null = isUuid(config.unit) ? config.unit : null
  let unitPending: Promise<string> | null = null
  const state: AppState = {
    config,
    contract,
    validator: new ContractValidator(contract),
    db,
    sessions: opts.sessions ?? new DbSessionStore(),
    events: new EventHub(db, (err) => app.log.warn({ err }, "avisos em tempo real (LISTEN ptw) falharam"), config.db.listenPort !== undefined),
    unit: async () => {
      if (unitId !== null) return unitId
      unitPending ??= db
        .unitByCode(config.unit)
        .then((id) => {
          if (id === null) throw new Error(`PTW_UNIT: não existe unidade com o código "${config.unit}"`)
          unitId = id
          return id
        })
        .finally(() => {
          unitPending = null
        })
      return unitPending
    },
    registered: new Map(),
    startedAt: (opts.now ?? (() => new Date()))(),
    now: opts.now ?? (() => new Date()),
    storageProbe: opts.storageProbe ?? (() => httpProbe(`${config.storageUrl.replace(/\/$/, "")}/healthz`)),
    onShutdown: (fn) => {
      shutdown.push(fn)
    },
  }
  app.decorate("ptw", state)
  app.decorateRequest("ptw", null as never)

  // Corpo que não é JSON (arquivo) chega como fluxo: a rota lê sem carregar na memória.
  app.addContentTypeParser("*", (_req, payload, done) => done(null, payload))

  app.addHook("onRequest", async (req, reply) => {
    const operationId = req.routeOptions.config.operationId
    req.ptw = {
      op: operationId === undefined ? null : (contract.operations.get(operationId) ?? null),
      requestId: req.id,
      client: null,
      undo: false,
      reason: null,
      unitId: null,
      session: null,
      cookieToken: null,
    }
    reply.header("x-request-id", req.id)
    reply.header("cache-control", "no-store")
    checkCommonHeaders(req.headers)
    req.ptw.client = clientOf(req.headers)
    req.ptw.undo = undoOf(req.headers)
    req.ptw.reason = reasonOf(req.headers)
    if (operationId === "putBlob") {
      req.ptw.uploadMime = req.headers["content-type"]
      req.headers["content-type"] = "application/octet-stream"
    }
  })

  app.addHook("preValidation", async (req) => {
    const op = req.ptw.op
    if (!op) return
    const o = state.registered.get(op.operationId) ?? {}
    if (o.enabled && !o.enabled()) throw pta.notFound()
    if (o.standalone) return
    req.ptw.unitId = await state.unit()
    await authenticate(req, op.secured)
    checkGrants(req)
    if (isWrite(req.method)) {
      if (op.secured) checkCsrf(req)
      else checkOrigin(req, op.operationId === "login")
    }
    if (op.ifMatch && ifMatchOf(req) === null) throw pta.ifMatchRequired()
    if (op.operationId === "putBlob" && Number(req.headers["content-length"]) > 2_147_483_648) throw pta.tooLarge()
    const problem = state.validator.checkRequest(op, req)
    if (problem) throw pta.badRequest("Requisição fora do contrato", problem.detail)
  })

  // Resposta 2xx fora do contrato é erro da API (ligado nos testes: PTW_CHECK_RESPONSES=1).
  app.addHook("preSerialization", async (req, reply, payload) => {
    const op = req.ptw?.op
    if (!config.checkResponses || !op || reply.statusCode < 200 || reply.statusCode >= 300) return payload
    const problem = state.validator.checkResponse(op, reply.statusCode, payload)
    if (problem) throw pta.unexpected(undefined, problem.detail)
    return payload
  })

  app.setErrorHandler(async (err, req, reply) => {
    const e = normalizeError(err)
    if (req.ptw && isAuditedDenial(e)) await recordDenial(req, e)
    if (e.status >= 500) req.log.error({ err: e.cause ?? err, code: e.code, detail: e.detail }, e.message)
    else req.log.info({ code: e.code, status: e.status }, e.message)
    for (const [k, v] of Object.entries(e.headers)) reply.header(k, v)
    return reply.code(e.status).send(e.body())
  })

  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send(pta.notFound("Endereço fora do contrato").body())
  })

  const api: RouteApi = {
    fastify: app,
    state,
    config,
    op(operationId, handler, o = {}) {
      const def = contract.operations.get(operationId)
      if (!def) throw new Error(`Rota fora do contrato: operationId "${operationId}" não existe no openapi.yaml`)
      if (state.registered.has(operationId)) throw new Error(`Operação "${operationId}" registrada duas vezes`)
      state.registered.set(operationId, o)
      app.route({
        method: def.method,
        url: basePath + fastifyPath(def.path),
        config: { operationId },
        ...(o.bodyLimit === undefined ? {} : { bodyLimit: o.bodyLimit }),
        handler: (req, reply) => handler(req as never, reply),
      })
    },
  }

  if (opts.autoload !== false) {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "routes")
    for (const file of routeFiles(dir)) {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown }
      if (typeof mod.default === "function") await (mod.default as RouteModule)(api)
    }
  }
  for (const m of opts.routes ?? []) await m(api)

  app.addHook("onClose", async () => {
    for (const fn of shutdown) await fn().catch((err: unknown) => app.log.warn({ err }, "falha ao desligar"))
    await state.events.close()
    await db.end().catch(() => {})
  })

  return app
}

/** Operações do contrato com e sem rota (o portão da fase: 80/80). */
export function coverage(app: FastifyInstance): { withRoute: string[]; withoutRoute: string[] } {
  const all = [...app.ptw.contract.operations.keys()]
  return { withRoute: all.filter((id) => app.ptw.registered.has(id)), withoutRoute: all.filter((id) => !app.ptw.registered.has(id)) }
}

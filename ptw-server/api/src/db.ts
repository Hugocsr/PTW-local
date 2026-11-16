/**
 * Único caminho até o banco (A3). Nenhuma rota recebe a conexão: recebe a transação de `withCtx`,
 * que já começou por `ptw.set_context(...)`. Sem contexto o RLS não mostra nada e nada é auditado.
 *
 * O `Driver` é a parte trocável: `postgres` em produção, um driver falso nos testes sem banco.
 */
import postgres from "postgres"
import type { FastifyRequest } from "fastify"
import type { Config } from "./config.js"
import { isRetryable } from "./errors/dbError.js"

/** A transação que as rotas usam: a `sql` marcada do `postgres` (``tx`select …` ``). */
export type Tx = postgres.TransactionSql

export type AuthMethod = "senha" | "ldap" | "pin" | "sessao" | "emergencia" | "servico" | "sistema"

/** Os argumentos de `ptw.set_context`. */
export interface Ctx {
  unitId: string
  personId: string | null
  roleId?: string | null
  auth: AuthMethod
  client?: string | null
  requestId?: string | null
  reason?: string | null
  undo?: boolean
}

export interface Driver {
  begin<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
  /** LISTEN num canal; devolve como parar. */
  listen(channel: string, onNotify: (payload: string) => void): Promise<() => Promise<void>>
  end(): Promise<void>
}

export interface TxOptions {
  /** Tempo limite só desta transação (exportação, verificação da cadeia). */
  statementTimeoutMs?: number
  /** Repetições em `40001`, `40P01` e `PTW12` (padrão 2). */
  retries?: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class Db {
  constructor(private readonly driver: Driver) {}

  /**
   * Abre uma transação, chama `ptw.set_context` e só então entrega a transação a `fn`.
   * Erro em `fn` desfaz tudo. Corrida de serialização, impasse e `PTW12` repetem a transação inteira.
   */
  async withContext<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
    const retries = opts.retries ?? 2
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.driver.begin(async (tx) => {
          await tx`select ptw.set_context(${ctx.unitId}::uuid, ${ctx.personId}::uuid, ${ctx.roleId ?? null}::uuid, ${ctx.auth}::text,
            ${ctx.client ?? null}::text, ${ctx.requestId ?? null}::text, ${ctx.reason ?? null}::text, ${ctx.undo === true}::boolean)`
          if (opts.statementTimeoutMs !== undefined) {
            await tx`select set_config('statement_timeout', ${String(Math.trunc(opts.statementTimeoutMs))}, true)`
          }
          return await fn(tx)
        })
      } catch (e) {
        if (attempt >= retries || !isRetryable(e)) throw e
        await sleep(15 * (attempt + 1) + Math.random() * 20)
      }
    }
  }

  /**
   * Código da unidade → id. É a única instrução antes de um contexto (sem o id não há `set_context`,
   * e o RLS esconde `ptw.unit` de quem não tem contexto): por isso depende de `ptw.unit_by_code`.
   */
  async unitByCode(code: string): Promise<string | null> {
    const rows = await this.driver.begin((tx) => tx<{ id: string | null }[]>`select ptw.unit_by_code(${code}::text) as id`)
    return rows[0]?.id ?? null
  }

  listen(channel: string, onNotify: (payload: string) => void): Promise<() => Promise<void>> {
    return this.driver.listen(channel, onNotify)
  }

  end(): Promise<void> {
    return this.driver.end()
  }
}

/** Opções de `withCtx` que só a rota conhece. */
export interface CtxOverrides extends TxOptions {
  /** Cargo com que a pessoa age (A4: só na assinatura). */
  roleId?: string | null
  /** Motivo do ato (do corpo); sem ele vale o `X-Ptw-Reason`. */
  reason?: string | null
}

/** O contexto de uma requisição: unidade e pessoa da sessão, aparelho, id da requisição, motivo, desfazer. */
export function ctxOf(req: FastifyRequest, over: CtxOverrides = {}): Ctx {
  const s = req.ptw
  if (s.unitId === null) throw new Error("withCtx antes de a unidade ser resolvida")
  const reason = over.reason !== undefined ? over.reason : s.reason
  return {
    unitId: s.unitId,
    personId: s.session?.personId ?? null,
    roleId: over.roleId ?? null,
    auth: s.session?.auth ?? "sessao",
    client: s.client,
    requestId: s.requestId,
    // set_context aceita até 500; motivo maior (exportação: até 1500) vai só no argumento da função.
    reason: reason !== null && reason !== undefined && reason.length <= 500 ? reason : null,
    undo: s.undo,
  }
}

/** Todo acesso de rota ao banco: transação com o contexto da requisição. Vale para leitura também. */
export function withCtx<T>(req: FastifyRequest, fn: (tx: Tx) => Promise<T>, over: CtxOverrides = {}): Promise<T> {
  return req.server.ptw.db.withContext(ctxOf(req, over), fn, over)
}

/** O driver de produção: `postgres` como `ptw_api`, pool pequeno, datas (`date`) como texto `AAAA-MM-DD`. */
export function postgresDriver(config: Config["db"], onNotice?: (n: unknown) => void): Driver {
  const sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    max: config.max,
    ...(config.tls ? { ssl: { rejectUnauthorized: true, servername: config.host } } : {}),
    idle_timeout: 60,
    connect_timeout: 5,
    onnotice: onNotice ?? false,
    // O papel ptw_api tem search_path = ptw (db/init.sh), mas os gatilhos usam ltree, que mora em public.
    connection: { application_name: "ptw-api", search_path: "ptw, public" },
    types: {
      // O código manda jsonb como texto JSON (`${JSON.stringify(x)}::jsonb`): o texto passa como está.
      // Sem isto o `postgres` codifica de novo e o banco grava um texto dentro do jsonb.
      json: { to: 114, from: [114, 3802], serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) as unknown },
      // `date` é dia civil no fuso da unidade: nunca vira Date (que mudaria o dia).
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  })
  return {
    begin: <T>(fn: (tx: Tx) => Promise<T>) => sql.begin((tx) => fn(tx as unknown as Tx)) as Promise<T>,
    listen: async (channel, onNotify) => {
      const meta = await sql.listen(channel, onNotify)
      return () => meta.unlisten()
    },
    end: () => sql.end({ timeout: 5 }),
  }
}

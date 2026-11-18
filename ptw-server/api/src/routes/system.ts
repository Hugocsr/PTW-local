/**
 * Sistema: saúde, situação, avisos em tempo real — e o que a API faz sozinha (A21, obrigação 5 do
 * README): `sistema.servidor.iniciado/parado` na trilha, `ptw.expire_due` a cada minuto e
 * `sistema.relogio.desvio` quando o relógio da API se afasta do relógio do banco.
 */
import type { ServerResponse } from "node:http"
import { defineRoutes } from "../app.js"
import type { Schemas } from "../contract/types.js"
import { withCtx, type Ctx, type Tx } from "../db.js"
import type { AppState } from "../http/state.js"
import { authenticate } from "../session/auth.js"

type StatusBody = Schemas["SystemStatus"]

/** Contexto do sistema: sem pessoa (ator nulo), autenticação `sistema`. */
export const systemCtx = (unitId: string): Ctx => ({ unitId, personId: null, auth: "sistema", client: "api", requestId: null })

export interface ClockReading {
  dbNow: Date
  /** Relógio da API menos o do banco, em ms (no meio da ida e volta). */
  driftMs: number
  latencyMs: number
}

export async function readClock(tx: Tx, now: () => Date): Promise<ClockReading> {
  const t0 = now().getTime()
  const p0 = performance.now()
  const rows = await tx<{ now: Date }[]>`select clock_timestamp() as now`
  const latencyMs = performance.now() - p0
  const dbNow = rows[0]?.now ?? new Date(t0)
  return { dbNow, driftMs: Math.round(t0 + latencyMs / 2 - dbNow.getTime()), latencyMs: Math.round(latencyMs * 10) / 10 }
}

export async function recordStarted(state: AppState): Promise<void> {
  const unitId = await state.unit()
  const data = JSON.stringify({ versao: state.config.version, entrada_dev: state.config.devLogin })
  await state.db.withContext(systemCtx(unitId), (tx) => tx`select ptw.audit_system('sistema.servidor.iniciado', 'API iniciada'::text, ${data}::jsonb)`)
}

export async function recordStopped(state: AppState): Promise<void> {
  const unitId = await state.unit()
  const data = JSON.stringify({ versao: state.config.version })
  await state.db.withContext(systemCtx(unitId), (tx) => tx`select ptw.audit_system('sistema.servidor.parado', 'API parada'::text, ${data}::jsonb)`)
}

export interface TickMemo {
  /** Quando o último desvio foi gravado (um por hora enquanto durar). */
  driftRecordedAt: number | null
}

/** O minuto da API: expira as PTs vencidas e confere o relógio. Devolve quantas expiraram e o desvio. */
export async function tick(state: AppState, memo: TickMemo): Promise<{ expired: number; driftMs: number }> {
  const unitId = await state.unit()
  return state.db.withContext(systemCtx(unitId), async (tx) => {
    const rows = await tx<{ n: number }[]>`select ptw.expire_due(${unitId}::uuid) as n`
    await tx`select ptw.session_expire(${Math.ceil(state.config.sessionIdleMs/1000)}::integer)`
    const clock = await readClock(tx, state.now)
    const limit = state.config.clockDriftLimitMs
    if (Math.abs(clock.driftMs) > limit) {
      const at = state.now().getTime()
      if (memo.driftRecordedAt === null || at - memo.driftRecordedAt >= 3_600_000) {
        const data = JSON.stringify({ desvio_ms: clock.driftMs, limite_ms: limit })
        await tx`select ptw.audit_system('sistema.relogio.desvio', ${`Relógio da API ${Math.abs(clock.driftMs)} ms ${clock.driftMs > 0 ? "adiantado" : "atrasado"} em relação ao banco`}::text, ${data}::jsonb)`
        memo.driftRecordedAt = at
      }
    } else memo.driftRecordedAt = null
    return { expired: Number(rows[0]?.n ?? 0), driftMs: clock.driftMs }
  })
}

export default defineRoutes((api) => {
  const { state, fastify } = api
  const streams = new Set<ServerResponse>()

  api.op("getHealth", () => ({ ok: true as const, now: state.now().toISOString(), devLogin:state.config.devLogin, passwordLogin:state.config.ldap !== null }), { standalone: true })

  api.op("getStatus", async (req): Promise<StatusBody> => {
    // Banco fora: a transação falha e a resposta é 503 PTA01 (o app trava o que salva; Parar continua).
    const [dbState, storage] = await Promise.all([
      withCtx(req, async (tx) => {
        const clock = await readClock(tx, state.now)
        const info = await tx<{ files: Record<string, string> | null }[]>`select files from ptw.schema_info limit 1`
        return { clock, files: info[0]?.files ?? null }
      }),
      state.storageProbe(),
    ])
    const { clock, files } = dbState
    return {
      now: clock.dbNow.toISOString(),
      version: state.config.version,
      ...(files ? { schema: files } : {}),
      db: { ok: true, latencyMs: clock.latencyMs },
      storage,
      clock: { driftMs: clock.driftMs, ok: Math.abs(clock.driftMs) <= state.config.clockDriftLimitMs },
      devLogin: state.config.devLogin,
      startedAt: state.startedAt.toISOString(),
    }
  })

  api.op("streamEvents", (req, reply) => {
    const unitId = req.ptw.unitId
    const session = req.ptw.session!
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
      "x-request-id": req.id,
    })
    res.write("retry: 5000\n\n")
    // Voltou depois de uma queda: não há como saber o que perdeu, então manda reler (PT nula = tudo).
    const last = req.headers["last-event-id"]
    if (typeof last === "string" && /^[0-9]{1,18}$/.test(last)) {
      res.write(`event: ptw\ndata: ${JSON.stringify({ seq: Number(last), permit: null })}\n\n`)
    }
    const off = state.events.subscribe((n) => {
      if (n.unit !== unitId) return
      res.write(`id: ${n.seq}\nevent: ptw\ndata: ${JSON.stringify({ seq: n.seq, permit: n.permit })}\n\n`)
    })
    let checking = false
    const beat = setInterval(() => {
      if (checking) return
      checking = true
      authenticate(req,true).then(() => res.write(": ping\n\n")).catch(() => res.end()).finally(() => { checking=false })
    }, 25_000)
    // O fluxo não passa do fim da sessão: o cliente reconecta e recebe 401.
    const ttl = setTimeout(() => res.end(), Math.min(Math.max(session.expiresAt.getTime() - state.now().getTime(), 0), 2_000_000_000))
    beat.unref()
    ttl.unref()
    streams.add(res)
    res.on("close", () => {
      clearInterval(beat)
      clearTimeout(ttl)
      off()
      streams.delete(res)
    })
  })

  state.onShutdown(async () => {
    for (const res of streams) res.end()
  })

  if (!state.config.background) return

  // ---------- O que roda sozinho ----------
  const memo: TickMemo = { driftRecordedAt: null }
  let started = false
  let closed = false
  let timer: NodeJS.Timeout | null = null
  let retry: NodeJS.Timeout | null = null

  const start = async (): Promise<void> => {
    if (closed || started) return
    try {
      await recordStarted(state)
      started = true
      if (state.config.db.listenPort === undefined) void state.events.start()
    } catch (err) {
      fastify.log.warn({ err }, "banco indisponível ao iniciar: tentando de novo em 5 s")
      retry = setTimeout(() => void start(), 5000)
      retry.unref()
    }
  }

  fastify.addHook("onReady", async () => {
    void start()
    timer = setInterval(() => {
      if (!started) return
      tick(state, memo).catch((err: unknown) => fastify.log.warn({ err }, "expiração por minuto falhou"))
    }, state.config.tickMs)
    timer.unref()
  })

  state.onShutdown(async () => {
    closed = true
    if (timer) clearInterval(timer)
    if (retry) clearTimeout(retry)
    if (started) await recordStopped(state)
  })
})

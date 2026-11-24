import { createHash, randomUUID } from "node:crypto"
import type { FastifyInstance } from "fastify"
import type { Config } from "../config.js"
import { newTiming, timingContext, timingSummary, type RequestTiming } from "./performance.js"

declare module "fastify" { interface FastifyRequest { performanceTiming?: RequestTiming } }

/** Only bounded deployment metadata is allowed into performance records. */
export function deploymentMetadata(env: NodeJS.ProcessEnv = process.env) {
  const safe = (value: string | undefined) => value && /^[a-zA-Z0-9_.-]{1,100}$/.test(value) ? value : "unknown"
  return { deploy: safe(env.VERCEL_DEPLOYMENT_ID), commit: safe(env.VERCEL_GIT_COMMIT_SHA ?? env.PTW_BUILD_COMMIT), region: safe(env.VERCEL_REGION ?? env.PTW_RUNTIME_REGION) }
}

export function installPerformance(app: FastifyInstance, config: Config): void {
  if (!config.performance) return
  const inherited = process.env.PTW_PERF_INSTANCE
  const instance = inherited && /^[0-9a-f-]{36}$/.test(inherited) ? inherited : randomUUID()
  const meta = deploymentMetadata()
  const rate = config.performance.sampleRate
  const started = performance.now()
  app.log.info({ event: "ptw.performance.lifecycle", stage: "created", instance, ...meta, sampleRate: rate })
  app.addHook("onRequest", (req, reply, done) => {
    if (Math.random() >= rate) return done()
    const timing = newTiming()
    req.performanceTiming = timing
    const complete = () => {
      if (!timing.active) return
      timing.active = false
      const operation = req.routeOptions.config.operationId ?? "unmatched"
      const requestId = /^(ptw-)?[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.id) ? req.id : `sha256:${createHash("sha256").update(req.id).digest("hex")}`
      app.log.info({ event: "ptw.performance.request", requestId, operation,
        instance, ...meta, status: reply.raw.statusCode, stream: operation === "streamEvents", ...timingSummary(timing) })
    }
    reply.raw.once("finish", complete)
    reply.raw.once("close", complete)
    timingContext.run(timing, done)
  })
  app.addHook("onListen", async () => { app.log.info({ event: "ptw.performance.lifecycle", stage: "ready", instance, ...meta, elapsedMs: performance.now() - started }) })
  app.addHook("onClose", async () => { app.log.info({ event: "ptw.performance.lifecycle", stage: "closed", instance, ...meta, elapsedMs: performance.now() - started }) })
}

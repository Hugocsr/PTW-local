import { randomUUID } from "node:crypto"

export function startupTimings(env, emit = value => console.log(JSON.stringify(value)), now = () => performance.now()) {
  const enabled = env.PTW_PERF === "1"
  const instance = enabled ? randomUUID() : null
  const start = now()
  if (enabled) env.PTW_PERF_INSTANCE = instance
  return stage => {
    if (!enabled) return
    try { emit({ event: "ptw.performance.startup", instance, stage, elapsedMs: now() - start }) }
    catch { /* A diagnostic sink cannot interrupt startup. */ }
  }
}

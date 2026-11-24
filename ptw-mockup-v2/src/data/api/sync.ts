export const DOMAINS = ["permits", "locations", "assets", "people", "types", "optionLists", "templates", "relations", "delegations", "appearance", "groups", "audit"] as const
export type Domain = typeof DOMAINS[number]
export function noticeDomains(raw: string): Domain[] {
  try {
    const n = JSON.parse(raw) as { domains?: unknown }
    if (Array.isArray(n.domains) && n.domains.length && n.domains.every(d => DOMAINS.includes(d))) return n.domains as Domain[]
  } catch { /* Legacy or unknown: recover broadly. */ }
  return [...DOMAINS]
}

/** A set of pending domains, never a queue of events. Failure waits for fallback/user retry. */
export function syncCoordinator(run: (domains: Domain[]) => Promise<boolean>, valid: () => boolean, retryMs: number) {
  const dirty = new Set<Domain>()
  let running = false, closed = false, recoverRequested = false, timer: ReturnType<typeof setTimeout> | undefined
  async function drain() {
    if (running || closed || !valid() || !dirty.size) return
    running = true
    recoverRequested = false
    const batch = [...dirty]; dirty.clear()
    let ok = false
    try { ok = await run(batch) } catch { /* Keep pending domains for bounded retry. */ }
    running = false
    if (closed) return
    if (!ok) {
      batch.forEach(d => dirty.add(d))
      if (recoverRequested) void drain()
      else timer = setTimeout(() => { timer = undefined; void drain() }, retryMs)
    } else if (dirty.size) void drain()
  }
  return {
    request(domains: readonly Domain[], recover = false) {
      if (closed) return
      if (recover) { recoverRequested = true; clearTimeout(timer); timer = undefined }
      domains.forEach(d => dirty.add(d))
      if (!timer) void drain()
    },
    close() { closed = true; dirty.clear(); clearTimeout(timer) },
  }
}

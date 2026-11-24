export type ClientPhase = "bootstrap" | "restore" | "login"
export type ClientTiming =
  | { kind: "span"; phase: ClientPhase; spanId: string; totalMs: number; ok: boolean }
  | { kind: "request"; spanId: string | null; requestId: string; endpoint: string; method: string; status: number; totalMs: number; bodyBytes: number | null }

export function normalizedEndpoint(path: string): string {
  // Restrict labels to known collections and static actions, never arbitrary identifiers.
  const known = new Set(["health", "status", "session", "login", "logout", "dev-login", "activity", "unit", "types", "locations", "assets", "people", "option-lists", "templates", "asset-relations", "permits", "mine", "counts", "audit", "events", "facets", "chain", "verify", "equipment-holds", "history", "access", "versions", "answers", "attachments", "blobs"])
  return path.split("?")[0]!.split("/").map(s => !s || known.has(s) ? s : ":id").join("/")
}

function optedIn(): boolean {
  try { return globalThis.sessionStorage?.getItem("ptw.performance") === "1" } catch { return false }
}

/** Optional, session-only diagnostics. Events contain no payload, identity, headers or query. */
export function createClientTimings(options: { enabled?: boolean; emit?: (event: ClientTiming) => void; now?: () => number } = {}) {
  const enabled = options.enabled ?? optedIn()
  const now = options.now ?? (() => performance.now())
  const spans: { phase: ClientPhase; id: string }[] = []
  const emit = (event: ClientTiming) => {
    try {
      if (options.emit) options.emit(event)
      else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ptw:performance", { detail: event }))
    } catch { /* Diagnostic sinks must not change user operations. */ }
  }
  return {
    enabled,
    start(phase: ClientPhase) {
      if (!enabled) return () => {}
      const span = { phase, id: crypto.randomUUID() }; const start = now(); spans.push(span)
      return (ok: boolean) => {
        const index = spans.indexOf(span)
        if (index < 0) return
        spans.splice(index, 1)
        emit({ kind: "span", phase, spanId: span.id, totalMs: now() - start, ok })
      }
    },
    request(requestId: string, path: string, method: string) {
      if (!enabled) return () => {}
      const start = now(); const spanId = spans.at(-1)?.id ?? null
      return (status: number, bodyBytes: number | null) => emit({ kind: "request", requestId, endpoint: normalizedEndpoint(path), method, spanId, status, bodyBytes, totalMs: now() - start })
    },
  }
}

export type ClientTimings = ReturnType<typeof createClientTimings>

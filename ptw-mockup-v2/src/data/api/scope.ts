import type { Shared } from "./state"
import { noServer, type Req } from "./http"
/** Fence every asynchronous read and publication to the session that requested it. */
export function scoped(s: Shared, valid: () => boolean): Shared {
  return {
    ...s,
    http: { ...s.http, async request<T>(r: Req) {
      if (!valid()) return { ok: false as const, error: noServer(), status: 0, down: false }
      const result = await s.http.request<T>(r)
      return valid() ? result : { ok: false as const, error: noServer(), status: 0, down: false }
    } },
    registry: { ...s.registry, set(value) {
      if (valid() && JSON.stringify(value) !== JSON.stringify(s.registry.get())) s.registry.set(value)
    } },
  }
}

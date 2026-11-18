import { setTimeout } from "node:timers/promises"

// Do not expose the proxy until the API can answer its health request.
export async function waitForApi(url, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(1000, Math.max(1, deadline - Date.now()))) })
      await response.arrayBuffer()
      if (response.ok) return
    } catch { /* The API can still be starting. */ }
    await setTimeout(Math.min(250, Math.max(1, deadline - Date.now())))
  }
  throw new Error("API não ficou pronta para receber requisições no prazo de inicialização")
}

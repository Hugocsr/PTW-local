/** Rede HTTP real e processo compilado separado: o cliente também envia blocos, sem Buffer de 200 MiB. */
import { spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { once } from "node:events"
import { readFileSync } from "node:fs"
import { Readable } from "node:stream"
import { setTimeout as delay } from "node:timers/promises"
import { expect, it } from "vitest"
import { S3 } from "../src/storage/s3.js"
import { createTestDb, HAS_DB, T_UNIT } from "./helpers/realDb.js"

it.skipIf(!HAS_DB || process.env.PTW_TEST_STORAGE !== "1")("upload de 200 MiB em fluxo usa menos de 160 MiB no processo da API", async () => {
  const db = await createTestDb("stream")
  const origin = "http://127.0.0.1:3011", base = origin + "/api/v1"
  const child = spawn(process.execPath, ["--max-old-space-size=112", "dist/server.js"], {
    env: { ...process.env, PTW_DB_NAME: db.name, PTW_UNIT: T_UNIT, PTW_DEV_LOGIN: "1", PTW_API_PORT: "3011",
      PTW_API_HOST: "127.0.0.1", PTW_DB_POOL: "2", PTW_BACKGROUND: "0", PTW_LOG_LEVEL: "error", PTW_CHECK_RESPONSES: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let logs = "", peakKb = 0, objectKey: string | undefined
  child.stdout.on("data", b => { logs += String(b) })
  child.stderr.on("data", b => { logs += String(b) })
  const monitor = setInterval(() => {
    try {
      const kb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${child.pid}/status`, "utf8"))?.[1] ?? 0)
      peakKb = Math.max(peakKb, kb)
    } catch { /* Processo ainda iniciando ou já encerrado. */ }
  }, 10)
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + "/health")).ok) { ready = true; break } } catch { /* Ainda iniciando. */ }
      if (child.exitCode !== null) break
      await delay(100)
    }
    expect(ready, logs).toBe(true)
    console.info(`API pronta: RSS ${(peakKb / 1024).toFixed(1)} MiB`)
    const login = await fetch(base + "/session/dev-login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ login: "ana" }) })
    expect(login.status).toBe(200)
    const session = await login.json() as { csrfToken: string }
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!
    const chunk = randomBytes(64 * 1024), count = 3200, size = chunk.length * count
    const hash = createHash("sha256")
    for (let i = 0; i < count; i++) hash.update(chunk)
    const sha = hash.digest("hex")
    objectKey = `${T_UNIT}/${sha.slice(0, 2)}/${sha}`
    async function* chunks() { for (let i = 0; i < count; i++) yield chunk }
    const response = await fetch(`${base}/blobs/${sha}`, { method: "PUT",
      headers: { origin, cookie, "x-ptw-csrf": session.csrfToken, "content-type": "application/octet-stream", "content-length": String(size) },
      body: Readable.toWeb(Readable.from(chunks(), { objectMode: false, highWaterMark: 64 * 1024 }), {
        strategy: { highWaterMark: 64 * 1024, size: block => block.byteLength },
      }), duplex: "half",
    } as RequestInit)
    const result = await response.text()
    expect(response.status, result + logs).toBe(201)
    expect(JSON.parse(result)).toMatchObject({ sha256: sha, size })
    console.info(`Upload: ${size} bytes; pico RSS da API: ${(peakKb / 1024).toFixed(1)} MiB`)
    expect(peakKb).toBeGreaterThan(0)
    expect(peakKb).toBeLessThan(160 * 1024)
  } finally {
    clearInterval(monitor)
    if (child.exitCode === null) { const closed = once(child, "exit"); child.kill("SIGTERM"); await closed }
    if (objectKey) await new S3("http://storage:8333").remove(objectKey)
    await db.drop()
  }
}, 180_000)

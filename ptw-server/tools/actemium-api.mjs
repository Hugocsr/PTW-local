import https from "node:https"
import { readFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import assert from "node:assert/strict"

export const id = (key) => {
  const h = createHash("sha256").update("ptw-actemium-local-v1:" + key).digest("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const ca = readFileSync(new URL("../ptw-local-root.crt", import.meta.url))
const base = new URL(process.env.PTW_LOCAL_URL ?? "https://localhost")
assert.equal(base.protocol, "https:")
assert.equal(base.hostname, "localhost", "O cenário só pode executar no laboratório local.")

export class Api {
  constructor() { this.cookie = ""; this.csrf = "" }
  async call(method, path, body, headers = {}) {
    const data = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
    const result = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: base.hostname, port: base.port || 443, family: 4, ca,
        path: "/api/v1" + path, method, timeout: 15000,
        headers: {
          Origin: base.origin, Cookie: this.cookie, "X-Ptw-Csrf": this.csrf,
          "X-Ptw-Client": "actemium-local-v1",
          ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}),
          ...headers,
        },
      }, (res) => {
        const chunks = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          const raw = Buffer.concat(chunks)
          const json = res.headers["content-type"]?.includes("application/json")
          resolve({ status: res.statusCode, headers: res.headers, data: json && raw.length ? JSON.parse(raw.toString()) : null, raw })
        })
        res.on("error", reject)
      })
      request.on("error", reject)
      request.on("timeout", () => request.destroy(new Error("Timeout " + path)))
      request.end(data)
    })
    return result
  }
  async ok(method, path, body, headers = {}) {
    const r = await this.call(method, path, body, headers)
    assert.ok(r.status >= 200 && r.status < 300, `${method} ${path}: HTTP ${r.status} ${JSON.stringify(r.data)}`)
    return r.data
  }
  async login(login) {
    const r = await this.call("POST", "/session/login", { login, password: process.env.PTW_LOCAL_PASSWORD ?? "Teste-local-2026!" })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.auth, "ldap")
    this.cookie = r.headers["set-cookie"][0].split(";")[0]
    this.csrf = r.data.csrfToken
    return r.data
  }
  async logout() {
    if (!this.cookie) return
    await this.ok("POST", "/session/logout")
    this.cookie = ""; this.csrf = ""
  }
}

export const match = (revision) => ({ "If-Match": `"${revision}"` })
export const key = (name) => ({ "Idempotency-Key": name ?? randomUUID() })

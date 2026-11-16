import { spawn } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const env = { ...process.env }
for (const name of [
  "PTW_UNIT", "PTW_DB_HOST", "PTW_DB_PASSWORD", "PTW_S3_URL", "PTW_S3_KEY",
  "PTW_S3_SECRET", "PTW_LDAP_CONFIG_JSON", "PTW_LDAP_BIND_PASSWORD",
]) {
  if (!env[name]?.trim()) throw new Error(`Variável obrigatória ausente: ${name}`)
}
if (new URL(env.PTW_S3_URL).protocol !== "https:") {
  throw new Error("PTW_S3_URL deve usar HTTPS")
}
if (env.PTW_DEV_LOGIN === "1") throw new Error("Login de demonstração não é permitido nesta imagem")
let ldap
try { ldap = JSON.parse(env.PTW_LDAP_CONFIG_JSON) } catch {
  throw new Error("PTW_LDAP_CONFIG_JSON deve conter JSON válido")
}
const dir = mkdtempSync(join(tmpdir(), "ptw-"))
process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
function save(name, value) {
  const file = join(dir, name)
  writeFileSync(file, value, { mode: 0o600 })
  return file
}
delete ldap.caFile
ldap.passwordFile = save("ldap-bind", env.PTW_LDAP_BIND_PASSWORD)
if (env.PTW_LDAP_CA_PEM) ldap.caFile = save("ldap-ca", env.PTW_LDAP_CA_PEM)
env.PTW_LDAP_CONFIG_FILE = save("ldap.json", JSON.stringify(ldap))
env.PTW_S3_KEY_FILE = save("s3-key", env.PTW_S3_KEY)
env.PTW_S3_SECRET_FILE = save("s3-secret", env.PTW_S3_SECRET)
env.PTW_DB_TLS = "1"
env.PTW_API_HOST = "127.0.0.1"
env.PTW_API_PORT = "3300"
for (const name of ["PTW_LDAP_CONFIG_JSON", "PTW_LDAP_BIND_PASSWORD", "PTW_LDAP_CA_PEM", "PTW_S3_KEY", "PTW_S3_SECRET"]) {
  delete env[name]
}

const children = []
let stopping = false

function stop(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill("SIGTERM")
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL")
  }, 12_000).unref()
}

for (const [command, args, childEnv] of [
  [process.execPath, ["dist/server.js"], env],
  ["/usr/local/bin/caddy", ["run", "--config", "deploy/Caddyfile", "--adapter", "caddyfile"], { PORT: env.PORT ?? "3000", HOME: tmpdir() }],
]) {
  const child = spawn(command, args, { env: childEnv, stdio: "inherit" })
  children.push(child)
  child.on("error", (error) => { console.error(error.message); stop(1) })
  child.on("exit", () => stop(1))
}
process.on("SIGTERM", () => stop(0))
process.on("SIGINT", () => stop(0))

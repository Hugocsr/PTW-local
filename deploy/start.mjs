import { spawn } from "node:child_process"
import { X509Certificate } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { preparePreviewDirectory } from "./ldap-preview.mjs"

const env = { ...process.env }
const previewLdap = env.PTW_LDAP_MODE === "preview"
if (previewLdap && env.VERCEL_ENV !== "preview") {
  throw new Error("O LDAP de homologação só pode ser usado em Preview")
}
for (const name of [
  "PTW_UNIT", "PTW_DB_HOST", "PTW_DB_PASSWORD", "PTW_S3_URL", "PTW_S3_KEY",
  "PTW_S3_SECRET", ...(previewLdap ? ["PTW_PREVIEW_LOGIN_PASSWORD"] : ["PTW_LDAP_CONFIG_JSON", "PTW_LDAP_BIND_PASSWORD"]),
]) {
  if (!env[name]?.trim()) throw new Error(`Variável obrigatória ausente: ${name}`)
}
if (new URL(env.PTW_S3_URL).protocol !== "https:") {
  throw new Error("PTW_S3_URL deve usar HTTPS")
}
if (env.PTW_DEV_LOGIN === "1") throw new Error("Login de demonstração não é permitido nesta imagem")
const dbCa = env.PTW_DB_CA_PEM?.trim()
if (dbCa) new X509Certificate(dbCa)
const dir = mkdtempSync(join(tmpdir(), "ptw-"))
process.on("exit", () => rmSync(dir, { recursive: true, force: true }))
function save(name, value) {
  const file = join(dir, name)
  writeFileSync(file, value, { mode: 0o600 })
  return file
}
const directory = previewLdap ? preparePreviewDirectory(dir, env.PTW_PREVIEW_LOGIN_PASSWORD) : null
let ldap
try { ldap = directory?.config ?? JSON.parse(env.PTW_LDAP_CONFIG_JSON) } catch {
  throw new Error("PTW_LDAP_CONFIG_JSON deve conter JSON válido")
}
delete ldap.caFile
ldap.passwordFile = save("ldap-bind", directory?.password ?? env.PTW_LDAP_BIND_PASSWORD)
if (directory) ldap.caFile = directory.caFile
else if (env.PTW_LDAP_CA_PEM) ldap.caFile = save("ldap-ca", env.PTW_LDAP_CA_PEM)
env.PTW_LDAP_CONFIG_FILE = save("ldap.json", JSON.stringify(ldap))
env.PTW_S3_KEY_FILE = save("s3-key", env.PTW_S3_KEY)
env.PTW_S3_SECRET_FILE = save("s3-secret", env.PTW_S3_SECRET)
env.PTW_DB_TLS = "1"
if (dbCa) env.NODE_EXTRA_CA_CERTS = save("db-ca.pem", dbCa + "\n")
delete env.PTW_DB_CA_PEM
env.PTW_API_HOST = "127.0.0.1"
env.PTW_API_PORT = "3300"
for (const name of ["PTW_LDAP_CONFIG_JSON", "PTW_LDAP_BIND_PASSWORD", "PTW_LDAP_CA_PEM", "PTW_PREVIEW_LOGIN_PASSWORD", "PTW_S3_KEY", "PTW_S3_SECRET"]) {
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
  ...(directory ? [directory.command] : []),
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

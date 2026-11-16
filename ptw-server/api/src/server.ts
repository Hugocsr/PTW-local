/** Entrada do serviço `api`: lê a configuração, liga o banco e escuta em 3000 (só na rede interna). */
import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { postgresDriver } from "./db.js"

const config = loadConfig()
const app = await buildApp({ config, driver: postgresDriver(config.db) })

let closing = false
const close = (signal: string): void => {
  if (closing) return
  closing = true
  app.log.info({ signal }, "desligando")
  // Grava `sistema.servidor.parado` e fecha o banco; não passa de 10 s.
  const force = setTimeout(() => process.exit(1), 10_000)
  force.unref()
  app.close().then(
    () => process.exit(0),
    (err: unknown) => {
      app.log.error({ err }, "falha ao desligar")
      process.exit(1)
    },
  )
}
process.on("SIGTERM", () => close("SIGTERM"))
process.on("SIGINT", () => close("SIGINT"))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  app.log.error({ err }, "a API não subiu")
  process.exit(1)
}

/**
 * Configuração do serviço `api`, lida do ambiente uma vez ao subir. Segredos vêm de arquivos
 * (`/run/secrets`), nunca de variáveis.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadLdap, type LdapConfig } from "./session/ldap.js"

export interface Config {
  host: string
  port: number
  /** Prefixo das rotas: o `servers[0].url` do contrato. */
  basePath: string
  /** Unidade da instalação (A10): código (`UN-01`) ou uuid. */
  unit: string
  /** Entrada de desenvolvimento (`POST /session/dev-login`). Só com `PTW_DEV_LOGIN=1`. */
  devLogin: boolean
  ldap: LdapConfig | null
  sessionIdleMs: number
  db: { host: string; port: number; database: string; user: string; password: string; max: number; tls?: boolean; listenPort?: number; prepare?: boolean; idleSeconds?: number }
  /** Endereço do S3 (SeaweedFS) na rede interna; só a situação é conferida aqui. */
  storageUrl: string
  /** Duração máxima absoluta da sessão. */
  sessionTtlMs: number
  /** Limite de tentativas de entrada por login e por origem. Desligado por padrão (decisão do dono, 2026-11-11): numa planta todos chegam pelo mesmo endereço, e o diretório (AD) já tem o seu bloqueio. `PTW_LOGIN_LIMIT=1` religa. */
  loginLimit: boolean
  /** Acima disto, o desvio entre o relógio da API e o do banco é gravado na trilha. */
  clockDriftLimitMs: number
  /** Intervalo da expiração das PTs e da conferência do relógio (A21). */
  tickMs: number
  /** Liga o que roda sozinho: início/parada na trilha, expiração por minuto, LISTEN. */
  background: boolean
  /** Confere toda resposta 2xx contra o contrato; fora do esquema vira erro (ligado nos testes). */
  checkResponses: boolean
  openapiPath: string
  version: string
  /** Tamanho máximo do corpo JSON. */
  bodyLimit: number
  logLevel: string
}

const here = dirname(fileURLToPath(import.meta.url))

function secret(env: NodeJS.ProcessEnv, name: string, fallbackFile: string): string {
  const direct = env[name]
  if (direct !== undefined) return direct
  const file = env[`${name}_FILE`] ?? fallbackFile
  try {
    return readFileSync(file, "utf8").replace(/\r?\n$/, "")
  } catch {
    throw new Error(`Segredo ausente: defina ${name}_FILE (arquivo) — não achei ${file}`)
  }
}

const int = (v: string | undefined, d: number): number => {
  if (v === undefined || v === "") return d
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`Configuração: número inválido (${v})`)
  return n
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const unit = env.PTW_UNIT ?? ""
  if (unit === "") throw new Error("Configuração: PTW_UNIT (código ou uuid da unidade) é obrigatório")
  return {
    host: env.PTW_API_HOST ?? "0.0.0.0",
    port: int(env.PTW_API_PORT, 3000),
    basePath: "/api/v1",
    unit,
    devLogin: env.PTW_DEV_LOGIN === "1",
    ldap: loadLdap(env.PTW_LDAP_CONFIG_FILE),
    sessionIdleMs: positive(env.PTW_SESSION_IDLE_MINUTES, 30) * 60_000,
    db: {
      host: env.PTW_DB_HOST ?? "db",
      port: int(env.PTW_DB_PORT, 5432),
      database: env.PTW_DB_NAME ?? "ptw",
      user: env.PTW_DB_USER ?? "ptw_api",
      password: secret(env, "PTW_DB_PASSWORD", "/run/secrets/db_api"),
      max: int(env.PTW_DB_POOL, 10),
      tls: env.PTW_DB_TLS === "1",
      ...(env.PTW_DB_LISTEN_PORT ? { listenPort: int(env.PTW_DB_LISTEN_PORT, 5432) } : {}),
      prepare: env.PTW_DB_PREPARE !== "0",
      idleSeconds: int(env.PTW_DB_IDLE_SECONDS, 60),
    },
    storageUrl: env.PTW_S3_URL ?? "http://storage:8333",
    sessionTtlMs: positive(env.PTW_SESSION_HOURS, 12) * 3_600_000,
    loginLimit: env.PTW_LOGIN_LIMIT === "1",
    clockDriftLimitMs: int(env.PTW_CLOCK_DRIFT_MS, 2000),
    tickMs: int(env.PTW_TICK_MS, 60_000),
    background: env.PTW_BACKGROUND !== "0",
    checkResponses: env.PTW_CHECK_RESPONSES === "1",
    openapiPath: env.PTW_OPENAPI ?? defaultOpenapiPath(),
    version: env.PTW_API_VERSION ?? "1.0.0-fase1",
    bodyLimit: int(env.PTW_BODY_LIMIT, 8 * 1024 * 1024),
    logLevel: env.PTW_LOG_LEVEL ?? "info",
  }
}

function positive(v: string | undefined, fallback: number): number {
  const n = int(v, fallback)
  if (!Number.isInteger(n) || n <= 0 || n > 8760) throw new Error("Configuração: prazo deve ser inteiro positivo até 8760")
  return n
}

/** `openapi.yaml` fica na raiz do pacote: um nível acima de `src/` e de `dist/`. */
export function defaultOpenapiPath(): string {
  return resolve(here, "..", "openapi.yaml")
}

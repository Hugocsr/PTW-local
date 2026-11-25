/**
 * O que a API sabe de cada requisição (`req.ptw`) e do serviço (`app.ptw`). É daqui que `withCtx`
 * monta o `ptw.set_context`.
 */
import type { Config } from "../config.js"
import type { Contract, Operation } from "../contract/openapi.js"
import type { ContractValidator } from "../contract/validate.js"
import type { AuthMethod, Db } from "../db.js"
import type { SessionStore } from "../session/store.js"
import type { EventHub } from "./events.js"

export interface SessionInfo {
  /** SHA-256 (hexa) do valor do cookie: a chave da sessão. */
  hash: string
  /** Token de CSRF desta sessão (derivado do cookie; não é guardado). */
  csrfToken: string
  unitId: string
  personId: string
  auth: AuthMethod
  /** Permissões efetivas (diretório + grupos), recalculadas em cada chamada (SPEC 002). */
  grants: import("../session/ldap.js").Grant[]
  /** Só as do diretório, gravadas na sessão ao entrar. */
  directoryGrants: import("../session/ldap.js").Grant[]
  /** De onde vem cada permissão efetiva. */
  grantSources: import("../shared/core/governance.js").GrantSource[]
  createdAt: Date
  expiresAt: Date
}

export interface RequestState {
  /** MIME original do upload; o parser recebe sempre o corpo como fluxo. */
  uploadMime?: string
  /** Operação do contrato desta rota (nulo fora do contrato: 404). */
  op: Operation | null
  requestId: string
  /** `X-Ptw-Client`: o aparelho. */
  client: string | null
  /** `X-Ptw-Undo: true`. */
  undo: boolean
  /** `X-Ptw-Reason`. */
  reason: string | null
  /** Unidade da instalação (resolvida antes de qualquer rota do contrato). */
  unitId: string | null
  session: SessionInfo | null
  /** Valor do cookie apresentado (para sair e para o CSRF). */
  cookieToken: string | null
}

export interface OpOptions {
  /** Ação tentada que vai na negação (A6). Sem ela vale a tabela de `errors/denied.ts`. */
  deniedAction?: string
  /** PT da negação. Padrão: o `{id}` das rotas `/permits/{id}…`. */
  deniedPermit?: (req: import("fastify").FastifyRequest) => string | null
  /** Tamanho máximo do corpo desta rota (upload). */
  bodyLimit?: number
  /** Responde sem banco e sem unidade (só `GET /health`). */
  standalone?: boolean
  /** A rota existe nesta instalação? Falso → `404 PTA04` antes de qualquer outra conferência. */
  enabled?: () => boolean
}

export interface Probe {
  ok: boolean
  latencyMs?: number
}

export interface AppState {
  config: Config
  contract: Contract
  validator: ContractValidator
  db: Db
  sessions: SessionStore
  events: EventHub
  /** Id da unidade da instalação (resolve o código uma vez). */
  unit(): Promise<string>
  /** Operações com rota registrada. */
  registered: Map<string, OpOptions>
  startedAt: Date
  now(): Date
  /** O S3 responde? (só a situação; os arquivos são do pacote de anexos). */
  storageProbe(): Promise<Probe>
  /** Registra o que roda ao desligar, na ordem de registro, antes de fechar o banco. */
  onShutdown(fn: () => Promise<void>): void
}

declare module "fastify" {
  interface FastifyInstance {
    ptw: AppState
  }
  interface FastifyRequest {
    ptw: RequestState
  }
  interface FastifyContextConfig {
    operationId?: string
  }
}

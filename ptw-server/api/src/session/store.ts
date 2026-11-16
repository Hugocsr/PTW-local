/**
 * Onde as sessões moram. A API é só leitura no disco e reinicia: a sessão fica no banco
 * (`ptw.api_session`, lacuna L7), com o SHA-256 do cookie — nunca o valor. A API inclui, renova
 * (`seen_at`) e encerra (`ended_at`, uma vez); não apaga nem muda a identidade.
 *
 * Toda operação recebe a transação de quem chama (já com `set_context`): a sessão é lida junto com a
 * situação da conta, criada junto com `sessao.entrada` e encerrada junto com `sessao.saida`.
 *
 * `MemorySessionStore` serve aos testes sem banco (a sessão some ao reiniciar).
 */
import type { AuthMethod, Tx } from "../db.js"
import type { Grant } from "./ldap.js"

export interface SessionRecord {
  /** SHA-256 (hexa) do valor do cookie. */
  hash: string
  unitId: string
  personId: string
  auth: AuthMethod
  grants: Grant[]
  client: string | null
  createdAt: Date
  seenAt: Date
  expiresAt: Date
  endedAt: Date | null
}

export type NewSession = Pick<SessionRecord, "hash" | "unitId" | "personId" | "auth" | "grants" | "client" | "createdAt" | "expiresAt">

export interface SessionStore {
  create(tx: Tx, rec: NewSession): Promise<void>
  /** A sessão pela chave, mesmo vencida ou encerrada (quem chama decide). */
  get(tx: Tx, hash: string): Promise<SessionRecord | null>
  /** Marca a última vez em que a sessão foi vista. */
  touch(tx: Tx, hash: string, at: Date): Promise<void>
  /** Encerra (saída, troca de pessoa, conta desativada). Devolve se havia sessão aberta. */
  end(tx: Tx, hash: string, at: Date): Promise<boolean>
}

interface Row {
  grants: Grant[]
  hash: string
  unit_id: string
  person_id: string
  auth: AuthMethod
  client: string | null
  created_at: Date
  seen_at: Date
  expires_at: Date
  ended_at: Date | null
}

export class DbSessionStore implements SessionStore {
  async create(tx: Tx, rec: NewSession): Promise<void> {
    // created_at e seen_at são do banco (gatilho api_session_guard).
    await tx`insert into ptw.api_session (unit_id, token_sha256, person_id, auth, client, expires_at, grants)
             values (ptw.current_unit(), decode(${rec.hash}::text, 'hex'), ${rec.personId}::uuid, ${rec.auth}::ptw.auth_method, ${rec.client}::text, ${rec.expiresAt}::timestamptz, ${rec.grants}::text[])`
  }

  async get(tx: Tx, hash: string): Promise<SessionRecord | null> {
    const rows = await tx<Row[]>`
      select encode(token_sha256, 'hex') as hash, unit_id, person_id, auth, client, created_at, seen_at, expires_at, ended_at, grants
        from ptw.api_session where unit_id = ptw.current_unit() and token_sha256 = decode(${hash}::text, 'hex')`
    const r = rows[0]
    if (!r) return null
    return { hash: r.hash, unitId: r.unit_id, personId: r.person_id, auth: r.auth, grants: r.grants, client: r.client, createdAt: r.created_at, seenAt: r.seen_at, expiresAt: r.expires_at, endedAt: r.ended_at }
  }

  async touch(tx: Tx, hash: string): Promise<void> {
    await tx`update ptw.api_session set seen_at = now()
              where unit_id = ptw.current_unit() and token_sha256 = decode(${hash}::text, 'hex') and ended_at is null`
  }

  async end(tx: Tx, hash: string): Promise<boolean> {
    const rows = await tx`update ptw.api_session set ended_at = now()
                           where unit_id = ptw.current_unit() and token_sha256 = decode(${hash}::text, 'hex') and ended_at is null
                       returning id`
    return rows.length > 0
  }
}

export class MemorySessionStore implements SessionStore {
  readonly sessions = new Map<string, SessionRecord>()

  async create(_tx: Tx, rec: NewSession): Promise<void> {
    this.sessions.set(rec.hash, { ...rec, seenAt: rec.createdAt, endedAt: null })
  }

  async get(_tx: Tx, hash: string): Promise<SessionRecord | null> {
    return this.sessions.get(hash) ?? null
  }

  async touch(_tx: Tx, hash: string, at: Date): Promise<void> {
    const s = this.sessions.get(hash)
    if (s && !s.endedAt) s.seenAt = at
  }

  async end(_tx: Tx, hash: string, at: Date): Promise<boolean> {
    const s = this.sessions.get(hash)
    if (!s || s.endedAt) return false
    s.endedAt = at
    return true
  }
}

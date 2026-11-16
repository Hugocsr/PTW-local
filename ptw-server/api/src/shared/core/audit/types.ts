// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit/types.ts; não edite (node scripts/sync-shared.mjs)
/** The audit event and what goes into it. */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export type JsonObject = { [k: string]: Json }
/** A table row as the database's to_jsonb gives it: column names; day "AAAA-MM-DD", instant "…+00:00" in UTC, bytea "\\x…". */
export type Row = JsonObject
export type AuthMethod = "senha" | "ldap" | "pin" | "sessao" | "emergencia" | "servico" | "sistema"
export type AuditTable = "unit" | "type_def" | "location" | "asset" | "asset_location" | "asset_relation" | "person" | "person_role" | "option_list" | "option_item" | "template" | "template_version" | "version_location_type" | "version_asset_type" | "stage" | "sign_slot" | "separation" | "permit" | "permit_asset" | "permit_team" | "permit_answer" | "attachment" | "permit_revision"

/** Who acts and how, for every event (ptw.set_context). `reason = "Desfazer"` marks an undo. */
export interface AuditCtx { at: string; actorId: string | null; roleId?: string | null; auth?: AuthMethod; client?: string | null; requestId?: string | null; reason?: string | null }

/** An event before it enters the chain. `at` = ISO 8601 with offset. */
export interface AuditDraft {
  at: string
  actor: string | null
  role: string | null
  auth: AuthMethod | null
  client: string | null
  request: string | null
  reason: string | null
  /** Dotted lowercase, e.g. "pt.estado", "cadastro.ativo.alterado", "acesso.pt.aberta". */
  action: string
  /** false = denied attempt, recorded all the same. */
  ok: boolean
  permit: string | null
  rev: number | null
  asset: string | null
  /** Table or family of the record ("asset", "permit", "signature", "person"…). */
  entity: string | null
  entityId: string | null
  /** The sentence, in Portuguese, as the database writes it. */
  text: string
  data: JsonObject
}

export interface AuditEvent extends Omit<AuditDraft, "at"> {
  v: 2
  unit: string
  seq: number
  /** Microseconds since 1970 UTC. */
  at: number
  prev: string
  hash: string
}

export const GENESIS = "0".repeat(64)
export const ACTION = /^[a-z_]+(\.[a-z_]+)*$/

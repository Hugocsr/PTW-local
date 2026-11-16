// @ts-nocheck — cópia de ptw-mockup-v2/src/core/eligibility.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Pure eligibility rules, the mirror of `ptw.person_ineligible` (ptw-server/db/schema/10_cadastro.sql)
 * and of the signer checks in `ptw.signature_before_insert` (30_pt.sql). No React, no globals: the
 * day (`today`, "AAAA-MM-DD" in the unit's zone) and the instant (`now`) are always passed in.
 */
import type { Person, SignSlot } from "@/registry/types"
import { cmpInstant, instant } from "./time.ts"
import { byId, peopleInScope, peopleWithAnyRole } from "./indexes.ts"

export type AccountState = "ativa" | "desativada" | "vencida" | "sem_login"
/** The one vocabulary for account state, on every screen. */
export const ACCOUNT_LABEL: Record<AccountState, string> = { ativa: "Conta ativa", desativada: "Conta desativada", vencida: "Conta vencida", sem_login: "Sem login" }

/** First reason, in the database's order and words. */
export type IneligibleReason = "pessoa inexistente" | "cadastro inativo" | "cadastro em revisão" | "conta desativada" | "conta vencida" | "cargo vencido ou fora do escopo do local"
/** A signer needs a login (a contact does not sign): the database says it in these words (PTW08). */
export const NO_LOGIN_REASON = "sem login (contato não assina)"

export interface RoleCheck { person: Person; ok: boolean; reasons: string[] }
export type SlotRef = Pick<SignSlot, "kind" | "roleIds"> & { personId?: string | null }

/** Cargo ids asked for: one, several (any of them qualifies) or none (null / []). */
export type RoleReq = string | readonly string[] | null | undefined
const roleList = (r: RoleReq): readonly string[] => (r == null ? [] : typeof r === "string" ? (r ? [r] : []) : r)

export const slotKind = (sl: Pick<SignSlot, "kind">) => sl.kind ?? "cargo"

/** "A", "A ou B", "A, B ou C": how every screen names the cargos a signature accepts. */
export const joinOr = (xs: string[]): string => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} ou ${xs[xs.length - 1]}`)
/** The cargos of a signature, joined with "ou" ("" when none is chosen yet). */
export const rolesText = (roleIds: readonly string[], roleLabel: (id: string) => string): string => joinOr(roleIds.map(roleLabel))

/** The account at an instant: expired when `accountExpires <= now` (an instant, not a day). */
export function accountStateAt(p: Pick<Person, "login" | "enabled" | "accountExpires">, now: string): AccountState {
  if (!p.login) return "sem_login"
  if (!p.enabled) return "desativada"
  if (p.accountExpires && cmpInstant(p.accountExpires, now) <= 0) return "vencida"
  return "ativa"
}

/**
 * Why the person may not act today (null = eligible): record active, account active and in date if it
 * has a login (a login is not required here), and with `roleId` the cargo valid today with a scope
 * covering the place (`pathIds` = the place and its ancestors; null = do not check the scope). With
 * several cargos (a signature that accepts any of them), one of them is enough.
 */
export function personIneligible(p: Person | undefined, roleId: RoleReq, pathIds: string[] | null, today: string, now: string): IneligibleReason | null {
  if (!p) return "pessoa inexistente"
  if (p.status === "inativo") return "cadastro inativo"
  if (p.status === "em_revisao") return "cadastro em revisão"
  const acc = accountStateAt(p, now)
  if (acc === "desativada") return "conta desativada"
  if (acc === "vencida") return "conta vencida"
  const want = roleList(roleId)
  if (want.length && !p.roles.some((r) => want.includes(r.roleId) && r.validUntil >= today && (r.scopeLocationId === null || pathIds === null || pathIds.includes(r.scopeLocationId)))) {
    return "cargo vencido ou fora do escopo do local"
  }
  return null
}

/** Signer reasons: no login first (as the database checks it), then the eligibility rule. */
function signerReasons(p: Person, roleId: RoleReq, pathIds: string[] | null, today: string, now: string, signer: boolean): string[] {
  if (signer && !p.login) return [NO_LOGIN_REASON]
  const why = personIneligible(p, roleId, pathIds, today, now)
  return why ? [why] : []
}

/** Without an instant, the start of `today` in the unit's zone stands for it. */
const nowOr = (today: string, now?: string) => now ?? instant(`${today}T00:00:00`)
const roleIdsOf = (req: RoleReq | { id: string }): readonly string[] => (req && typeof req === "object" && "id" in req ? [req.id] : roleList(req as RoleReq))

/**
 * Everyone a cargo covers (cargo held with a scope covering the place, record not inactive), each with
 * whether they are eligible now and the first reason when not. A signer also needs a login.
 */
export function checkRoleAt(people: Person[], req: RoleReq | { id: string }, pathIds: string[] | null, signer: boolean, today: string, now?: string): RoleCheck[] {
  const roleId = roleIdsOf(req)
  if (!roleId.length) return []
  const inScope = (r: Person["roles"][number]) => roleId.includes(r.roleId) && (pathIds === null || r.scopeLocationId === null || pathIds.includes(r.scopeLocationId))
  // Only people holding one of the cargos (with a scope covering the place, when given): indexed, in the register's order.
  return (pathIds === null ? peopleWithAnyRole(people, roleId) : peopleInScope(people, roleId, pathIds))
    .filter((p) => p.status !== "inativo" && p.roles.some(inScope))
    .map((person) => {
      const reasons = signerReasons(person, roleId, pathIds, today, nowOr(today, now), signer)
      return { person, ok: reasons.length === 0, reasons }
    })
}

/** A named person is checked on record and account only; a cargo slot applies the cargo rule. */
export function checkSlotAt(people: Person[], _tpl: unknown, sl: SlotRef, pathIds: string[] | null, today: string, now?: string): RoleCheck[] {
  if (slotKind(sl) === "pessoa") {
    const person = sl.personId ? byId(people, sl.personId) : undefined
    if (!person) return []
    const reasons = signerReasons(person, null, pathIds, today, nowOr(today, now), true)
    return [{ person, ok: reasons.length === 0, reasons }]
  }
  return checkRoleAt(people, sl.roleIds, pathIds, true, today, now)
}

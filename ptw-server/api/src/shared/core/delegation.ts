// @ts-nocheck — cópia de ptw-mockup-v2/src/core/delegation.ts; não edite (node scripts/sync-shared.mjs)
import { cmpInstant } from "./time.ts"

export interface Delegation {
  id: string
  /** null = mandato geral: todas as aprovações administrativas delegáveis em que o delegante é o aprovador nominal. */
  slotId: string | null
  delegatorId: string
  delegateId: string
  scopeLocationId: string | null
  startsAt: string
  endsAt: string
  reason: string
  createdBy: string
  createdAt: string
  revokedAt: string | null
  revokedBy: string | null
  revokedReason: string | null
  revision: number
}
export type DelegationInput = Pick<Delegation, "id" | "slotId" | "delegatorId" | "delegateId" | "scopeLocationId" | "startsAt" | "endsAt" | "reason">
/** SPEC 003: what an agendada delegation may change; the delegator and the id stay. */
export type DelegationUpdate = Pick<Delegation, "slotId" | "delegateId" | "scopeLocationId" | "startsAt" | "endsAt" | "reason">
export type DelegationStatus = "agendada" | "ativa" | "expirada" | "revogada"

/** Delegation windows are start-inclusive and end-exclusive; revocation takes precedence. */
export function delegationStatus(d: Delegation, now: string): DelegationStatus {
  if (d.revokedAt) return "revogada"
  if (cmpInstant(now, d.startsAt) < 0) return "agendada"
  return cmpInstant(now, d.endsAt) >= 0 ? "expirada" : "ativa"
}

/** Matching a mandate never replaces either participant's current account/cargo eligibility. */
export function delegationMatches(d: Delegation, slot: { id?: string; personId?: string | null; delegable?: boolean }, pathIds: string[] | null, now: string): boolean {
  return slot.delegable === true && (d.slotId === null || d.slotId === slot.id) && d.delegatorId === slot.personId
    && d.delegateId !== d.delegatorId && delegationStatus(d, now) === "ativa"
    && (d.scopeLocationId === null || pathIds?.includes(d.scopeLocationId) === true)
}

/** Only an agendada (not started, not revoked) delegation is editable; once in force it can only be revoked (SPEC 003). */
export function canEditDelegation(d: Delegation, now: string): boolean {
  return delegationStatus(d, now) === "agendada"
}

/**
 * Stop and resume, pure. Stopping only reduces authorization, so anyone with an active login can do it
 * in the field states (PTW24, PTW25); resuming is a recorded decision by whoever may issue the permit
 * (PTW26), and a suspensa permit then needs a new Aceite no campo (the Retomada voids the old one).
 * No React, no globals: the clock is a parameter.
 */
import type { Location, Person, SignSlot, TemplateVersion } from "@/registry/types"
import type { Permit } from "@/permit/types"
import type { RuleError } from "./ptwErrors"
import { accountStateAt, checkSlotAt, rolesText, type RoleCheck } from "./eligibility"
import { PERMIT_STATE_LABEL, type PermitState } from "./permitState"
import { pathIds } from "./permitView"
import { STAGE, stageOfKind } from "./signing"
import { dayOf } from "./time"
import { deny, G7 } from "./permitActs"

/** States in which a stop makes sense: from issued until handed over. */
export const STOPPABLE: PermitState[] = ["emitida", "ativa", "suspensa", "entregue"]

/** The reason a Retomada voids the Aceite no campo (the database's words). */
export const RESUME_VOID_REASON = "Retomada: novo Aceite no campo exigido"
/** Why a resend voids the earlier revisions' signatures (the database's words). */
export const resendVoidReason = (rev: number) => `Reenviada após devolução: vale a revisão ${rev}`

export interface StopCheck { ok: boolean; reason?: string; deny?: RuleError }

/** `now`: an instant (the account's expiry is an instant). */
export function canStop(permit: Permit, person: Person, now: string): StopCheck {
  if (!STOPPABLE.includes(permit.state)) return { ok: false, reason: "A PT não está em campo", deny: deny(G7.naoEstaEmCampo, `A PT está ${PERMIT_STATE_LABEL[permit.state]}: não está em campo`) }
  if (accountStateAt(person, now) !== "ativa") return { ok: false, reason: "Sem login ativo: pare e avise o líder", deny: deny(G7.semLoginAtivo, "Sem login ativo: pare e avise o líder") }
  return { ok: true }
}

/**
 * What a stop does: every stop records the hold (`hold_*`); an ativa permit also becomes suspensa,
 * in the same write. In the other field states the state stays and the hold blocks the next acceptance.
 */
export function stopEffect(permit: Pick<Permit, "state">): { state: PermitState } {
  return { state: permit.state === "ativa" ? "suspensa" : permit.state }
}

/** True while the permit waits for a Retomada: a stop on record, or a suspensa never resumed. */
export const needsResume = (p: Pick<Permit, "holdReason" | "state" | "resumedReason">): boolean => p.holdReason !== null || (p.state === "suspensa" && p.resumedReason === null)

/** The Emissão slot: whoever may issue may also resume. */
export function emissionSlot(ver: TemplateVersion): SignSlot | null {
  return stageOfKind(ver, STAGE.emissao)?.slots[0] ?? null
}

export function resumeCandidates(permit: Permit, ver: TemplateVersion, people: Person[], locations: Location[], today: string, now?: string): RoleCheck[] {
  const slot = emissionSlot(ver)
  if (!slot) return []
  return checkSlotAt(people, ver, slot, pathIds(locations, permit.locationId), today, now)
}

export interface ResumeCheck { id: string; ok: boolean; text: string; deny?: RuleError }
export interface ResumePlan { checks: ResumeCheck[]; ok: boolean }

export function planResume(input: {
  permit: Permit
  ver: TemplateVersion
  signer: Person
  people: Person[]
  locations: Location[]
  roleLabel: (roleId: string) => string
  /** Instant with offset. */
  now: string
  today?: string
  serverDown?: boolean
}): ResumePlan {
  const { permit, ver, signer, people, locations, roleLabel, now, serverDown = false } = input
  const today = input.today ?? dayOf(now)
  const checks: ResumeCheck[] = []
  checks.push({ id: "server", ok: !serverDown, text: serverDown ? "Sem servidor" : "Servidor confirmando", ...(serverDown ? { deny: deny("sem_servidor", "Sem servidor: a gravação volta com o servidor") } : {}) })
  const waiting = needsResume(permit)
  checks.push({ id: "state", ok: waiting, text: waiting ? "PT aguarda Retomada" : "Não há parada a retomar", ...(waiting ? {} : { deny: deny(G7.semParada, "Não há parada a retomar") }) })
  const slot = emissionSlot(ver)
  const who = slot && slot.kind !== "pessoa" ? rolesText(slot.roleIds, roleLabel) || "quem emite" : "quem emite"
  const entry = resumeCandidates(permit, ver, people, locations, today, now).find((e) => e.person.id === signer.id)
  const ok = !!entry?.ok
  checks.push({
    id: "elegivel", ok,
    text: ok ? `${who} · cadastro e conta ativos` : entry ? `${who}: ${entry.reasons.join(", ")}` : `Só quem tem o cargo ${who} neste local retoma`,
    ...(ok ? {} : { deny: deny(G7.retomarNaoElegivel, `Só quem pode emitir a PT retoma (${entry?.reasons[0] ?? "cargo vencido ou fora do escopo do local"})`) }),
  })
  return { checks, ok: checks.every((c) => c.ok) }
}

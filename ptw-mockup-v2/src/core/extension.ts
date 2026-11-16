/**
 * The work window's limits, pure: the longest window a template version allows (R3,
 * `template_version.max_window`, PTW31) and the extension of the window of an issued or active permit
 * (R5, "Prorrogar", `ptw.permit_extend`: PTW32 who, PTW33 when and what, PTW31 the limit). The
 * messages are the database's. No React, no globals: the clock is a parameter.
 */
import type { Location, Person, TemplateVersion } from "@/registry/types"
import type { Permit } from "@/permit/types"
import type { RuleError } from "./ptwErrors"
import { deny } from "./permitActs"
import { emissionSlot, resumeCandidates } from "./stopResume"
import { rolesText } from "./eligibility"
import { cmpInstant, dayOf, wallOf } from "./time"
import { windowLimitDenied } from "./windowLimit"

/** Longest justification of an extension (as Parar and Retomar). */
export const EXTENSION_REASON_MAX = 500

export { maxWindowText, windowLimitDenied } from "./windowLimit"

/** States in which the window may be extended (before it ends). */
export const EXTENDABLE: Permit["state"][] = ["emitida", "ativa"]

export interface ExtendCheck { id: string; ok: boolean; text: string; deny?: RuleError }
export interface ExtendPlan { checks: ExtendCheck[]; ok: boolean }

/** "até 06/11 17:00" in the unit's zone: how the window's end is written in the history. */
export const endText = (iso: string, tz?: string) => { const w = wallOf(iso, tz); return `até ${w.slice(8, 10)}/${w.slice(5, 7)} ${w.slice(11, 16)}` }

/**
 * Prorrogar: who may (whoever is eligible for the Emissão's signature, as Retomar), when (emitida or
 * ativa, before the window ends), and, when `newEnd`/`reason` are given, what (a later end, a reason
 * of 1–500 characters, within the version's limit counted from the original start).
 */
export function planExtend(input: {
  permit: Permit
  ver: TemplateVersion
  signer: Person
  people: Person[]
  locations: Location[]
  roleLabel: (roleId: string) => string
  now: string
  today?: string
  serverDown?: boolean
  newEnd?: string
  reason?: string
}): ExtendPlan {
  const { permit, ver, signer, people, locations, roleLabel, now, serverDown = false } = input
  const today = input.today ?? dayOf(now)
  const checks: ExtendCheck[] = []
  checks.push({ id: "server", ok: !serverDown, text: serverDown ? "Sem servidor" : "Servidor confirmando", ...(serverDown ? { deny: deny("sem_servidor", "Sem servidor: a gravação volta com o servidor") } : {}) })
  const when = EXTENDABLE.includes(permit.state) && cmpInstant(now, permit.windowEnd) < 0
  const whenText = "Só a PT emitida ou ativa, antes do fim da janela, é prorrogada"
  checks.push({ id: "state", ok: when, text: when ? "PT emitida ou ativa, dentro da janela" : whenText, ...(when ? {} : { deny: deny("PTW33", whenText) }) })
  const slot = emissionSlot(ver)
  const who = slot && slot.kind !== "pessoa" ? rolesText(slot.roleIds, roleLabel) || "quem emite" : "quem emite"
  const entry = resumeCandidates(permit, ver, people, locations, today, now).find((e) => e.person.id === signer.id)
  const ok = !!entry?.ok
  checks.push({
    id: "elegivel", ok,
    text: ok ? `${who} · cadastro e conta ativos` : entry ? `${who}: ${entry.reasons.join(", ")}` : `Só quem pode emitir esta PT prorroga (${who})`,
    ...(ok ? {} : { deny: deny("PTW32", `Só quem pode emitir esta PT prorroga (${entry?.reasons[0] ?? "cargo vencido ou fora do escopo do local"})`) }),
  })
  if (input.newEnd !== undefined || input.reason !== undefined) {
    const reason = (input.reason ?? "").trim()
    const later = !!input.newEnd && cmpInstant(input.newEnd, permit.windowEnd) > 0
    const okInput = later && reason.length > 0 && reason.length <= EXTENSION_REASON_MAX
    const msg = "Prorrogação precisa de justificativa e de um fim depois do atual"
    checks.push({ id: "entrada", ok: okInput, text: okInput ? "Novo fim e justificativa" : msg, ...(okInput ? {} : { deny: deny("PTW33", msg) }) })
    const limit = later ? windowLimitDenied(ver, permit.windowStart, input.newEnd!) : null
    if (limit) checks.push({ id: "prazo", ok: false, text: limit.message, deny: limit })
  }
  return { checks, ok: checks.every((c) => c.ok) }
}

/** The first refusal of an extension plan (null = allowed). */
export const extendDenied = (plan: ExtendPlan): RuleError | null => plan.checks.find((c) => !c.ok && c.deny)?.deny ?? null

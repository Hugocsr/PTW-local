/** Versioned electrical policy, frozen with the form. No clock or safety answer is inferred. */
import type { FormSpec, Person, Stage } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import type { FormAnswers } from "./form"
import type { RuleError } from "./ptwErrors"
import { instant } from "./time.ts"
import { personIneligible } from "./eligibility.ts"

export interface ElectricalPolicy {
  standard: "vigente2019" | "preparacao2027"
  procedure: string
  riskAssessment: string
  authorizations: string
  workKind: string
  shift?: { startDate: string; startTime: string; endDate: string; endTime: string }
  isolation: string[]
  restoration: string[]
}

export interface RevalidationInput {
  shiftStart: string
  shiftEnd: string
  newEnd: string
  reason: string
  conditionsUnchanged: boolean
  teamUnchanged: boolean
  assessmentConfirmed: boolean
}

const fail = (message: string): RuleError => ({ code: "PTW34", message })

/** An electrical crew must be explicitly listed and every assigned role must still be eligible at the site. */
export function electricalTeamDenied(form: FormSpec, team: Permit["team"], people: Person[], pathIds: string[], today: string, now: string): RuleError | null {
  if (!form.electrical) return null
  const entries = Object.entries(team).flatMap(([roleId, ids]) => ids.map((id) => ({ roleId, id })))
  if (!entries.length) return fail("Informe a equipe e suas autorizações para esta PT")
  if (entries.some(({ roleId, id }) => personIneligible(people.find((p) => p.id === id), roleId, pathIds, today, now))) return fail("Equipe contém pessoa não elegível")
  return null
}

/** Reject incomplete policy references instead of silently disabling their controls. */
export function electricalPolicyProblem(form: FormSpec): string | null {
  const p = form.electrical
  if (p === undefined) return null
  if (!p || typeof p !== "object" || Array.isArray(p)) return "Referência NR-10 inválida"
  if (!["vigente2019", "preparacao2027"].includes(p.standard)) return "Referência NR-10 inválida"
  const items = form.sections.flatMap((s) => s.items)
  const need = (id: string, kind: string) => items.some((i) => i.id === id && i.kind === kind && i.required && !i.showWhen)
  for (const id of [p.procedure, p.riskAssessment, p.authorizations]) {
    if (!need(id, "documento")) return "Política elétrica exige documentos obrigatórios e visíveis"
    const item = items.find((i) => i.id === id)
    if (item?.kind !== "documento" || !item.attach || !item.validity) return "Documento elétrico exige anexo e validade"
  }
  const kind = items.find((i) => i.id === p.workKind)
  if (!need(p.workKind, "marcacao") || kind?.kind !== "marcacao" || kind.multiple || kind.other || kind.listId
    || kind.options.length !== 2) return "Classificação elétrica inválida"
  for (const steps of [p.isolation, p.restoration]) {
    if (!Array.isArray(steps) || steps.length === 0 || new Set(steps).size !== steps.length) return "Sequência elétrica inválida"
    for (const id of steps) {
      const i = items.find((i) => i.id === id)
      if (!need(id, "verificacao") || i?.kind !== "verificacao" || i.answers !== "sim_nao" || i.lines.length !== 1
        || !i.lines[0].blockOn.includes("nao")) return "Etapa elétrica exige uma verificação obrigatória Sim/Não"
    }
  }
  if (new Set([...p.isolation, ...p.restoration]).size !== p.isolation.length + p.restoration.length) return "Sequência elétrica inválida"
  if (p.standard === "preparacao2027" && !p.shift) return "Modelo 2027 exige os limites do turno"
  if (p.shift && (typeof p.shift !== "object" || Array.isArray(p.shift) || ["startDate", "startTime", "endDate", "endTime"].some((k) => !(k in p.shift!)))) return "Limites do turno inválidos"
  if (p.shift) for (const [k, id] of Object.entries(p.shift)) {
    if (!need(id, k.endsWith("Date") ? "data" : "horario")) return "Limites do turno inválidos"
  }
  return null
}

/** Safety fields cannot be moved after their authorizing signature by the flow editor. */
export function electricalActivationProblem(form: FormSpec, stages: Stage[]): string | null {
  const p = form.electrical
  if (!p) return null
  const stage = (id: string) => stages.find((st) => st.id === form.sections.find((s) => s.items.some((i) => i.id === id))?.stageId)
  for (const id of [p.procedure, p.riskAssessment, p.authorizations, p.workKind, ...Object.values(p.shift ?? {})]) {
    if (stage(id)?.kind !== "solicitacao") return "Documentos, classificação e turno devem estar na Solicitação"
  }
  const emission = stages.findIndex((s) => s.kind === "emissao")
  if (p.isolation.some((id) => !stage(id) || stages.indexOf(stage(id)!) >= emission)
    || p.restoration.some((id) => stage(id)?.kind !== "aceite_area")) return "Isolamento deve preceder Emissão; reenergização pertence ao Aceite da área"
  return null
}

/** Portable packages refer to their original item refs; imports allocate fresh item ids. */
export function remapElectricalPolicy(p: ElectricalPolicy, idOf: (ref: string) => string): ElectricalPolicy {
  return { ...p, procedure: idOf(p.procedure), riskAssessment: idOf(p.riskAssessment), authorizations: idOf(p.authorizations), workKind: idOf(p.workKind),
    isolation: p.isolation.map(idOf), restoration: p.restoration.map(idOf),
    ...(p.shift ? { shift: { startDate: idOf(p.shift.startDate), startTime: idOf(p.shift.startTime), endDate: idOf(p.shift.endDate), endTime: idOf(p.shift.endTime) } } : {}) }
}

/** Shift boundaries are explicit local dates/times in the unit's timezone, including overnight shifts. */
export function electricalShift(form: FormSpec, answers: FormAnswers, timezone?: string): { start: string; end: string } | null {
  const shift = form.electrical?.shift
  if (!shift) return null
  const value = (id: string) => { const a = answers[id]; return a?.t === "data" || a?.t === "horario" ? a.v : "" }
  if (Object.values(shift).some((id) => !value(id))) return null
  const start = instant(`${value(shift.startDate)}T${value(shift.startTime)}`, timezone)
  const end = instant(`${value(shift.endDate)}T${value(shift.endTime)}`, timezone)
  return Number.isFinite(Date.parse(start)) && Date.parse(end) > Date.parse(start) ? { start, end } : null
}

/** Every window, including an ordinary extension, must fit the explicit shift. */
export function electricalWindowDenied(form: FormSpec, p: Pick<Permit, "answers" | "windowStart" | "windowEnd" | "revalidation">, timezone?: string): RuleError | null {
  if (form.electrical?.standard !== "preparacao2027") return null
  const shift = p.revalidation ? { start: p.revalidation.shiftStart, end: p.revalidation.shiftEnd } : electricalShift(form, p.answers, timezone)
  if (!shift || Date.parse(p.windowStart) < Date.parse(shift.start) || Date.parse(p.windowEnd) > Date.parse(shift.end)) {
    return fail("A janela da PT deve estar contida no turno informado")
  }
  return null
}

/** A later step cannot be recorded before the previous steps have been individually confirmed. */
export function electricalSequenceDenied(form: FormSpec, answers: FormAnswers, itemId: string): RuleError | null {
  const p = form.electrical
  if (!p) return null
  const sequence = [p.isolation, p.restoration].find((s) => s.includes(itemId))
  if (!sequence) return null
  for (const id of sequence.slice(0, sequence.indexOf(itemId))) {
    const a = answers[id]
    if (a?.t !== "verificacao" || !Object.values(a.lines).length || Object.values(a.lines).some((v) => v.a !== "sim")) {
      return fail("Confirme as verificações anteriores na ordem do procedimento")
    }
  }
  return null
}

/** Revalidation belongs to the actual issuer and requires an unchanged crew/conditions and a new field assessment. */
export function revalidationDenied(p: Permit, form: FormSpec, sigs: SignatureRec[], emissionSlots: string[], personId: string,
  input: RevalidationInput, now: string): RuleError | null {
  if (form.electrical?.standard !== "preparacao2027" || !["emitida", "ativa", "suspensa", "expirada"].includes(p.state)) return fail("Esta PT não admite revalidação")
  if (p.holdReason) return fail("Resolva a parada registrada antes de revalidar")
  if (!sigs.some((s) => s.permitId === p.id && s.rev === p.revision && !s.voidedAt && s.personId === personId && emissionSlots.includes(s.slotId))) return fail("Só o responsável que autorizou esta PT pode revalidá-la")
  if (!input.conditionsUnchanged || !input.teamUnchanged || !input.assessmentConfirmed) return fail("Revalidação exige condições e equipe preservadas e avaliação no local; mudanças exigem nova PT")
  const start = Date.parse(input.shiftStart), end = Date.parse(input.shiftEnd), workEnd = Date.parse(input.newEnd), t = Date.parse(now)
  if (![start, end, workEnd, t].every(Number.isFinite) || start > t || end <= t || workEnd <= t || workEnd > end || start >= end
    || !input.reason.trim() || input.reason.trim().length > 500) return fail("Informe turno atual, fim da atividade dentro do turno e justificativa")
  return null
}

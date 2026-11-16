/**
 * What stops a template version from being used, on the signature side: stages without a
 * signature, signatures without a cargo/person or a description, and — against the plant's people —
 * nobody (or too few) eligible and separation rules nobody can satisfy. Pure: the date comes in.
 * Used by the Fluxo editor (activation) and by the package import (`templatePackage.ts`).
 *
 * Imports use the ".ts" extension so `node scripts/validar-modelo.ts` runs this file directly.
 */
import type { Location, Person, SignSlot, TemplateContent, TypeDef } from "@/registry/types"
import type { RoleCheck, RoleReq, SlotRef } from "./eligibility.ts"
import { checkRoleAt, checkSlotAt, slotKind } from "./eligibility.ts"

/** What the checks read from the registry. */
export interface ChecksRegistry { people: Person[]; locations: Location[]; roleTypes: TypeDef[] }

/** Ids from the root down to `id` (the location itself last). */
export function locationPathIds(locs: Location[], id: string): string[] {
  const out: string[] = []
  let cur = locs.find((l) => l.id === id)
  while (cur) {
    out.unshift(cur.id)
    cur = cur.parentId ? locs.find((l) => l.id === cur!.parentId) : undefined
  }
  return out
}

/**
 * Eligibility while editing a template: a person counts if they qualify at ANY location the
 * template accepts (role scope respected). With no accepted location yet, scope is ignored.
 */
export function checksForTemplate(reg: ChecksRegistry, tpl: TemplateContent, roleId: RoleReq, today: string): RoleCheck[] {
  const req = roleId
  const allowed = reg.locations.filter((l) => tpl.locationTypeIds.includes(l.typeId) && l.status !== "inativo")
  if (allowed.length === 0) return checkRoleAt(reg.people, req, null, true, today)
  const best = new Map<string, RoleCheck>()
  for (const l of allowed) {
    for (const c of checkRoleAt(reg.people, req, locationPathIds(reg.locations, l.id), true, today)) {
      const prev = best.get(c.person.id)
      if (!prev || (c.ok && !prev.ok)) best.set(c.person.id, c)
    }
  }
  return [...best.values()]
}

export function checksForSlot(reg: ChecksRegistry, tpl: TemplateContent, sl: SlotRef, today: string): RoleCheck[] {
  return slotKind(sl) === "pessoa" ? checkSlotAt(reg.people, tpl, sl, null, today) : checksForTemplate(reg, tpl, sl.roleIds, today)
}

/**
 * estrutura = the template itself is incomplete (stage without signature, signature without who or
 * without description, a rule tying a signature to itself); pessoas = the plant's people today
 * cannot fill it (nobody/too few eligible, a rule nobody can satisfy).
 */
export type SignatureIssueKind = "sem_assinatura" | "sem_quem" | "sem_descricao" | "regra_mesma" | "ninguem_elegivel" | "poucos_elegiveis" | "regra_inviavel"
export interface SignatureIssue {
  kind: SignatureIssueKind
  text: string
  /** Where to fix it: the stages concerned, or the slot / rule (rule = "slotA|slotB"). */
  stageIds?: string[]
  slotId?: string
  ruleId?: string
}
export const STRUCTURAL: SignatureIssueKind[] = ["sem_assinatura", "sem_quem", "sem_descricao", "regra_mesma"]

export function signatureIssues(t: TemplateContent, reg: ChecksRegistry, today: string): SignatureIssue[] {
  const out: SignatureIssue[] = []
  const slots = t.stages.flatMap((s) => s.slots)
  const empty = t.stages.filter((s) => s.slots.length === 0)
  if (empty.length) out.push({ kind: "sem_assinatura", text: "Há etapa sem assinatura", stageIds: empty.map((s) => s.id) })
  const missing = (s: SignSlot) => (slotKind(s) === "pessoa" ? !reg.people.some((p) => p.id === s.personId) : s.roleIds.length === 0 || s.roleIds.some((id) => !reg.roleTypes.some((r) => r.id === id)))
  // Name the stages, so the list says where to fix it (Fluxo, stage N).
  const where = (bad: (s: SignSlot) => boolean) => {
    const hit = t.stages.map((st, i) => ({ st, i })).filter(({ st }) => st.slots.some(bad))
    return { ids: hit.map(({ st }) => st.id), text: hit.map(({ st, i }) => `${i + 1}. ${st.name || "sem nome"}`).join(", ") }
  }
  const noWho = where(missing)
  if (noWho.ids.length) out.push({ kind: "sem_quem", text: `Assinatura sem cargo ou pessoa nas etapas ${noWho.text}`, stageIds: noWho.ids })
  const noText = where((s) => !s.meaning?.trim())
  if (noText.ids.length) out.push({ kind: "sem_descricao", text: `Assinatura sem descrição nas etapas ${noText.text}`, stageIds: noText.ids })
  for (const sl of slots) {
    if (missing(sl)) continue
    const n = checksForSlot(reg, t, sl, today).filter((c) => c.ok).length
    if (n === 0) out.push({ kind: "ninguem_elegivel", text: `Ninguém elegível: ${sl.meaning || "assinatura"}`, slotId: sl.id })
    else if (n < sl.min) out.push({ kind: "poucos_elegiveis", text: `Poucos elegíveis: ${sl.meaning || "assinatura"} (${n} de ${sl.min})`, slotId: sl.id })
  }
  for (const rule of t.separation) {
    const a = slots.find((s) => s.id === rule.slotA)
    const b = slots.find((s) => s.id === rule.slotB)
    const ruleId = `${rule.slotA}|${rule.slotB}`
    if (!a || !b) continue
    if (a.id === b.id) { out.push({ kind: "regra_mesma", text: "Regra liga a assinatura a ela mesma", ruleId, slotId: a.id }); continue }
    const A = checksForSlot(reg, t, a, today).filter((c) => c.ok)
    const B = checksForSlot(reg, t, b, today).filter((c) => c.ok)
    if (A.length && B.length && !A.some((x) => B.some((y) => y.person.id !== x.person.id))) out.push({ kind: "regra_inviavel", text: `Regra inviável: ${a.meaning} ≠ ${b.meaning}`, ruleId, slotId: a.id })
  }
  return out
}

/** The same issues as sentences (the version's panel lists them before "Ativar versão"). */
export const signatureProblems = (t: TemplateContent, reg: ChecksRegistry, today: string): string[] => signatureIssues(t, reg, today).map((i) => i.text)

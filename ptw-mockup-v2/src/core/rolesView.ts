/**
 * What a person's cargos let them do, how long they last, and the notices that follow.
 * Pure: the date is a parameter. Only the ACTIVE version of each template counts.
 */
import type { PermitTemplate, Person } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import { accountStateAt } from "./eligibility"
import { dayOf } from "./time"

/** Whole days from `a` to `b` (days "AAAA-MM-DD"; an instant counts by its first 10 characters, so pass `dayOf` of it). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000)

export const EXPIRING_DAYS = 30

export type RoleStatus = "vigente" | "vence_em_breve" | "vencido"
export interface SignRef { templateName: string; version: number; stage: string; meaning: string; required: boolean }
export interface TemplateSigns { templateName: string; version: number; signs: { meaning: string; required: boolean }[]; cannotAlso: string[] }
export interface RoleView {
  roleId: string
  scopeLocationId: string | null
  validUntil: string
  daysLeft: number
  status: RoleStatus
  signs: SignRef[]
  /** The same facts grouped by template, for display. */
  byTemplate: TemplateSigns[]
  /** Acts the separation rules forbid doing in the same permit as a signature of this cargo. */
  cannotAlso: string[]
}

export function rolesView(person: Person, templates: PermitTemplate[], today: string): RoleView[] {
  return person.roles.map((r) => {
    const daysLeft = daysBetween(today, r.validUntil)
    const status: RoleStatus = daysLeft < 0 ? "vencido" : daysLeft <= EXPIRING_DAYS ? "vence_em_breve" : "vigente"
    const signs: SignRef[] = []
    const cannot = new Set<string>()
    const byTemplate: TemplateSigns[] = []
    for (const t of templates) {
      const ver = t.versions.find((v) => v.status === "ativa")
      if (!ver) continue
      const group: TemplateSigns = { templateName: t.name, version: ver.number, signs: [], cannotAlso: [] }
      const slots = ver.stages.flatMap((st) => st.slots.map((slot) => ({ slot, stage: st.name })))
      byTemplate.push(group)
      for (const { slot, stage } of slots) {
        if (slot.kind !== "cargo" || !slot.roleIds.includes(r.roleId)) continue
        signs.push({ templateName: t.name, version: ver.number, stage, meaning: slot.meaning ?? "", required: slot.required })
        group.signs.push({ meaning: slot.meaning ?? "", required: slot.required })
        for (const rule of ver.separation) {
          const other = rule.slotA === slot.id ? rule.slotB : rule.slotB === slot.id ? rule.slotA : null
          const meaning = other && slots.find((s) => s.slot.id === other)?.slot.meaning
          if (meaning) { cannot.add(meaning); if (!group.cannotAlso.includes(meaning)) group.cannotAlso.push(meaning) }
        }
      }
    }
    return { roleId: r.roleId, scopeLocationId: r.scopeLocationId, validUntil: r.validUntil, daysLeft, status, signs, byTemplate: byTemplate.filter((g) => g.signs.length > 0), cannotAlso: [...cannot] }
  })
}

export interface Notice { id: string; severity: "bloqueia" | "aviso"; text: string }

/** Notices for the person: what already blocks them and what is about to. `now` (instant) decides an expired account. */
export function personalNotices(person: Person, roles: RoleView[], today: string, roleLabel: (id: string) => string, now?: string): Notice[] {
  const out: Notice[] = []
  if (person.status === "em_revisao") out.push({ id: "cadastro", severity: "bloqueia", text: "Cadastro em revisão: você não pode assinar." })
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  for (const r of roles) {
    const name = roleLabel(r.roleId)
    if (r.status === "vencido") out.push({ id: `cargo_${r.roleId}`, severity: "bloqueia", text: `Cargo ${name} venceu em ${dm(r.validUntil)}.` })
    else if (r.status === "vence_em_breve") out.push({ id: `cargo_${r.roleId}`, severity: "aviso", text: `Cargo ${name} vence em ${r.daysLeft} ${r.daysLeft === 1 ? "dia" : "dias"}.` })
  }
  if (person.accountExpires && person.login) {
    // The account stops at an instant; the notice speaks of its day in the unit's zone.
    const day = dayOf(person.accountExpires)
    const d = daysBetween(today, day)
    const over = now ? accountStateAt(person, now) === "vencida" : d < 0
    if (over) out.push({ id: "conta", severity: "bloqueia", text: `Conta venceu em ${dm(day)}.` })
    else if (d <= EXPIRING_DAYS) out.push({ id: "conta", severity: "aviso", text: `Conta vence em ${d} ${d === 1 ? "dia" : "dias"}.` })
  }
  return out
}

export type Involvement = "autor" | "lider" | "equipe" | "assinante"

/** How a person relates to a permit. The leader is the person on the team under the leader cargo (`leaderRoleId`). */
export function involvement(permit: Permit, sigs: SignatureRec[], personId: string, leaderRoleId?: string): Involvement[] {
  const out: Involvement[] = []
  if (permit.authorId === personId) out.push("autor")
  if (leaderRoleId && permit.team[leaderRoleId]?.includes(personId)) out.push("lider")
  else if (Object.values(permit.team).some((ids) => ids.includes(personId))) out.push("equipe")
  if (sigs.some((g) => g.permitId === permit.id && g.personId === personId)) out.push("assinante")
  return out
}

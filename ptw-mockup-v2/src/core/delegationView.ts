/**
 * Tela de Delegações no formato do SGI Forces (Aprovação › Delegações): delegante → delegado, período em
 * dias, escopo por planta e observação. As regras do PTW continuam as mesmas do banco
 * (ptw.delegation_guard): só aprovação administrativa nominal e delegável, as duas pessoas com conta e
 * cargo válidos no escopo, até sete dias, começando agora ou no futuro, sem sobreposição para o mesmo
 * delegante e a mesma aprovação. Sem aprovação escolhida, o mandato é geral (todas as do delegante).
 */
import type { Location, Person } from "@/registry/types"
import type { PermitTemplate, SignSlot } from "@/registry/modelTypes"
import { delegationStatus, type Delegation, type DelegationStatus } from "./delegation.ts"
import { checkRoleAt } from "./eligibility.ts"
import { cmpInstant, dayOf, instant, msOf, nextDayStart } from "./time.ts"

export const MAX_DAYS = 7
export const STATUS_LABEL: Record<DelegationStatus, string> = { ativa: "ativa", agendada: "agendada", expirada: "expirada", revogada: "revogada" }

/** Uma aprovação administrativa delegável e o rótulo que a identifica ("Soldagem · v2 · Aprova…"). */
export interface Approval { slot: SignSlot; label: string }

/** As aprovações em que a pessoa é a aprovadora nominal (versões ativas ou arquivadas, nunca rascunho). */
export function approvalsOf(templates: readonly PermitTemplate[], personId: string): Approval[] {
  return templates.flatMap((t) => t.versions.filter((v) => v.status !== "rascunho").flatMap((v) => v.stages.filter((st) => !st.kind)
    .flatMap((st) => st.slots.filter((sl) => sl.delegable && sl.kind === "pessoa" && sl.personId === personId)
      .map((slot) => ({ slot, label: `${t.name} · v${v.number} · ${slot.meaning ?? st.name}` })))))
}

/** Quem pode delegar: pessoas ativas que são aprovadoras nominais de alguma aprovação delegável. */
export function delegators(people: readonly Person[], templates: readonly PermitTemplate[]): Person[] {
  const ids = new Set(templates.flatMap((t) => t.versions.filter((v) => v.status !== "rascunho").flatMap((v) => v.stages.filter((st) => !st.kind)
    .flatMap((st) => st.slots.filter((sl) => sl.delegable && sl.kind === "pessoa" && sl.personId).map((sl) => sl.personId!)))))
  return people.filter((p) => ids.has(p.id) && p.status !== "inativo").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/**
 * Quem pode receber: pessoa diferente do delegante, com conta e cargo válidos no escopo para ao menos uma
 * das aprovações cobertas, e o delegante também válido nela (como o banco confere). `scope` [] = toda a unidade.
 */
export function delegateCandidates(people: Person[], approvals: readonly Approval[], delegatorId: string, scope: string[], today: string, now: string): Person[] {
  const out = new Map<string, Person>()
  for (const a of approvals) {
    const ok = checkRoleAt(people, a.slot.roleIds, scope, true, today, now).filter((c) => c.ok)
    if (!ok.some((c) => c.person.id === delegatorId)) continue
    for (const c of ok) if (c.person.id !== delegatorId) out.set(c.person.id, c.person)
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/** O escopo do SGI é a planta; uma delegação antiga com outro local mostra o local que tem. */
export function plantScopes(locations: readonly Location[]): Location[] {
  return locations.filter((l) => l.parentId === null && l.status !== "inativo").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/**
 * Período em dias (como no SGI) → instantes do mandato. Início hoje = agora; outro dia = 00:00 dele.
 * O fim é inclusivo: vale até 00:00 do dia seguinte. Até sete dias corridos.
 */
export function windowOf(startDay: string, endDay: string, now: string, tz: string): { startsAt: string; endsAt: string } | { error: string } {
  if (!startDay || !endDay) return { error: "Informe o início e o fim." }
  const today = dayOf(now, tz)
  if (startDay < today) return { error: "O início não pode ser no passado." }
  if (endDay < startDay) return { error: "O fim deve ser igual ou posterior ao início." }
  const startsAt = startDay === today ? now : instant(`${startDay}T00:00:00`, tz)
  const endsAt = nextDayStart(endDay, tz)
  if (msOf(endsAt, tz) - msOf(startsAt, tz) > MAX_DAYS * 86_400_000) return { error: `A delegação vale no máximo ${MAX_DAYS} dias corridos.` }
  return { startsAt, endsAt }
}

/** O último dia coberto: o fim é exclusivo, então 00:00 do dia 21 mostra "20". */
export const lastDay = (endsAt: string, tz: string) => dayOf(new Date(msOf(endsAt, tz) - 1).toISOString(), tz)

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
/** "10 jan 2024" */
export function dayLabel(day: string): string {
  return `${day.slice(8, 10)} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`
}
/** "10 jan 2024 — 20 jan 2024" */
export const periodLabel = (d: Pick<Delegation, "startsAt" | "endsAt">, tz: string) => `${dayLabel(dayOf(d.startsAt, tz))} — ${dayLabel(lastDay(d.endsAt, tz))}`

export interface DelegationFilter { status: DelegationStatus | ""; from: string; to: string }
export const NO_FILTER: DelegationFilter = { status: "", from: "", to: "" }

/** Situação e período (o mandato aparece quando cruza o intervalo de dias pedido); mais recentes primeiro. */
export function filterDelegations(list: readonly Delegation[], f: DelegationFilter, now: string, tz: string): Delegation[] {
  const from = f.from ? instant(`${f.from}T00:00:00`, tz) : null
  const to = f.to ? nextDayStart(f.to, tz) : null
  return list.filter((d) => (!f.status || delegationStatus(d, now) === f.status)
    && (!from || cmpInstant(d.endsAt, from, tz) > 0) && (!to || cmpInstant(d.startsAt, to, tz) < 0))
    .sort((a, b) => cmpInstant(b.startsAt, a.startsAt, tz) || b.id.localeCompare(a.id))
}

/** Revogar só faz sentido enquanto o mandato ainda vale ou vai valer. */
export const canRevoke = (d: Delegation, now: string) => { const s = delegationStatus(d, now); return s === "ativa" || s === "agendada" }

/** "AL" para "Ana Lima". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}

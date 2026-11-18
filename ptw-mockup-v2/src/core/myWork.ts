/**
 * "What is mine and what do I do now": every permit lands in exactly one group, the highest it
 * qualifies for. Pure; the clock is a parameter.
 *
 * Load: a permit no cargo of the person can reach (and that is not theirs by author, crew or
 * signature) is skipped before its rail is built, and the rail is read before the full sign plan,
 * which only runs when the person may act. A `MyWorkCache` keeps each permit's result while nothing
 * it depends on changed: the permit, its signatures, the day, the accounts that expired, which side
 * of its window "now" is on (and, for a draft, the other permits: the equipment lock).
 */
import type { FormSpec, Location, OptionList, Person, PermitTemplate, TemplateVersion } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import { isFinalState, nextLabel, pathIds, permitFormOf, railOf, stageProgress } from "./permitView"
import { actionLabel, pickSlot, planSign, STAGE, type Equipment } from "./signing"
import { emissionSlot, needsResume, resumeCandidates } from "./stopResume"
import { dayOf } from "./time"
import { rolesText } from "./eligibility"
import { accountEpoch, byId, signaturesOf } from "./indexes"

export type Group = "emCampo" | "agir" | "bloqueadas" | "proximas" | "aguardando" | "finalizadas"
export type Act = "assinar" | "entregar" | "retomar" | "abrir"
export interface WorkItem {
  permitId: string
  act: Act
  /** Short line under the permit: what to do, or who is next. */
  label: string
  /** The label is this person's own act (to do now, blocked, or later), not someone else's. */
  own: boolean
  /** Stage the label belongs to, shown as secondary text. */
  stage?: string
  /** Why it is blocked, or the time it waits for. */
  reasons: string[]
  /** Button text, the same one the PT shows (`actionLabel`): "Preencher e assinar: Emite a PT", "Retomar"… */
  cta?: string
  /** The person's part of the form is still open: the button opens the PT's Etapas tab. */
  fill?: boolean
  /** "Etapa n/total" of the permit's flow, the same on every card. */
  progress: { n: number; total: number }
  /** Why the permit is this person's: "Seu cargo: Líder de equipe", "Você solicitou", "Na equipe"… */
  why: string
  /** Open PTs holding this permit's equipment, named in `reasons`: screens link their numbers. */
  holders?: { id: string; number: string }[]
}
export type MyWork = Record<Group, WorkItem[]>

interface Input {
  personId: string
  permits: Permit[]
  signatures: SignatureRec[]
  people: Person[]
  locations: Location[]
  templates: PermitTemplate[]
  roleLabel: (roleId: string) => string
  /** Instant with offset. */
  now: string
  /** "AAAA-MM-DD" in the unit's zone; derived from `now` when absent. */
  today?: string
  timezone?: string
  equipment: Equipment
  /** Frozen forms (`PermitData.formSnapshots`) and the lists a draft's form reads. */
  formSnapshots?: Record<string, FormSpec>
  optionLists?: OptionList[]
}

type Placed = { group: Group; item: WorkItem } | null

/** Keeps each permit's place between calls (see the module note). One per screen/person is enough. */
export interface MyWorkCache {
  /** The inputs every permit depends on; when one changes, everything is computed again. */
  globals: unknown[]
  entries: Map<string, { key: unknown[]; sigs: readonly SignatureRec[]; out: Placed }>
  /**
   * The permits that can land anywhere for this person, given these permits and signatures: the
   * others (a finished permit that is not theirs, an open one no cargo of theirs reaches) stay out
   * whatever the clock says, so a tick looks only at this list.
   */
  scan: { permits: Permit[] | null; signatures: SignatureRec[] | null; list: Permit[] }
  /** The last answer and the list it was read from: returned as is when no permit's place changed. */
  last: { list: Permit[]; work: MyWork } | null
}
export const createMyWorkCache = (): MyWorkCache => ({ globals: [], entries: new Map(), scan: { permits: null, signatures: null, list: [] }, last: null })

const sameArray = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Cargo ids and named people of every slot of a version (who could ever be eligible on it). */
const reachIndex = new WeakMap<TemplateVersion, { roles: Set<string>; persons: Set<string> }>()
function reachOf(ver: TemplateVersion) {
  let r = reachIndex.get(ver)
  if (!r) {
    r = { roles: new Set(), persons: new Set() }
    for (const st of ver.stages) for (const sl of st.slots) {
      for (const id of sl.roleIds ?? []) r.roles.add(id)
      if (sl.personId) r.persons.add(sl.personId)
    }
    reachIndex.set(ver, r)
  }
  return r
}
const versionOf = (templates: PermitTemplate[], p: Pick<Permit, "templateId" | "versionId">) => byId(templates, p.templateId)?.versions.find((v) => v.id === p.versionId)

export function myWork(input: Input, cache?: MyWorkCache): MyWork {
  const { personId, permits, signatures, people, locations, templates, roleLabel, now, equipment, formSnapshots = {}, optionLists = [] } = input
  const out: MyWork = { emCampo: [], agir: [], bloqueadas: [], proximas: [], aguardando: [], finalizadas: [] }
  const me = byId(people, personId)
  if (!me) return out
  const today = input.today ?? dayOf(now)
  const epoch = accountEpoch(people, now)
  const nowMs = Date.parse(now)

  if (cache) {
    const globals = [input.timezone, personId, people, locations, templates, equipment.relations, equipment.assets, equipment.partOf.join("|"), formSnapshots, optionLists, roleLabel]
    if (!sameArray(cache.globals, globals)) { cache.globals = globals; cache.entries.clear(); cache.scan = { permits: null, signatures: null, list: [] }; cache.last = null }
    if (cache.scan.permits !== permits || cache.scan.signatures !== signatures) {
      cache.scan = { permits, signatures, list: permits.filter((p) => mayLand(p, signaturesOf(signatures, p.id))) }
    }
  }

  /** Can this permit land in any group for this person, at any time? (No clock read.) */
  function mayLand(permit: Permit, sigs: readonly SignatureRec[]): boolean {
    if (permit.authorId === personId || Object.values(permit.team).some((ids) => ids.includes(personId)) || sigs.some((g) => g.personId === personId)) return true
    if (isFinalState(permit.state) || permit.state === "rascunho" || permit.state === "devolvida") return false
    const ver = versionOf(templates, permit)
    if (!ver) return false
    const reach = reachOf(ver)
    const path = pathIds(locations, permit.locationId)
    return reach.persons.has(personId) || (me!.status !== "inativo" && me!.roles.some((r) => reach.roles.has(r.roleId) && (r.scopeLocationId === null || path.includes(r.scopeLocationId))))
  }

  let changed = !cache?.last || cache.last.list !== cache.scan.list
  for (const permit of cache ? cache.scan.list : permits) {
    const sigs = signaturesOf(signatures, permit.id)
    let placed: Placed
    if (cache) {
      // A finished permit's place depends on nothing but itself and its signatures.
      const draft = permit.state === "rascunho" || permit.state === "devolvida"
      const phase = (iso: string) => Math.sign(nowMs - Date.parse(iso))
      const key = isFinalState(permit.state) ? [permit] : [permit, today, epoch, phase(permit.windowStart), phase(permit.windowEnd), draft ? permits : null]
      const hit = cache.entries.get(permit.id)
      if (hit && sameArray(hit.key, key) && sameArray(hit.sigs, sigs)) placed = hit.out
      else {
        placed = place(permit, sigs)
        if (!hit || hit.out?.group !== placed?.group || JSON.stringify(hit.out?.item) !== JSON.stringify(placed?.item)) changed = true
        cache.entries.set(permit.id, { key, sigs, out: placed })
      }
    } else placed = place(permit, sigs)
    if (placed) out[placed.group].push(placed.item)
  }

  function place(permit: Permit, sigs: readonly SignatureRec[]): Placed {
    const author = permit.authorId === personId
    const crew = Object.values(permit.team).some((ids) => ids.includes(personId))
    const signed = sigs.some((g) => g.personId === personId)
    if (isFinalState(permit.state)) {
      const why = author ? "Você solicitou" : crew ? "Na equipe" : signed ? "Você assinou" : ""
      const total = versionOf(templates, permit)?.stages.length ?? 0
      return why ? { group: "finalizadas", item: { permitId: permit.id, act: "abrir", own: false, label: permit.note ?? "", reasons: [], why, progress: { n: total, total } } } : null
    }
    const ver = versionOf(templates, permit)
    if (!ver) return null
    const related = author || crew || signed
    const path = pathIds(locations, permit.locationId)
    if (!related) {
      // Nobody but the author, the crew or someone a cargo (or a named slot) reaches has anything here.
      const reach = reachOf(ver)
      const can = reach.persons.has(personId) || (me!.status !== "inativo" && me!.roles.some((r) => reach.roles.has(r.roleId) && (r.scopeLocationId === null || path.includes(r.scopeLocationId))))
      if (!can || permit.state === "rascunho" || permit.state === "devolvida") return null
    }
    const rail = railOf(permit, ver, sigs as SignatureRec[], people, locations, today, now)
    const resumers = needsResume(permit) ? resumeCandidates(permit, ver, people, locations, today, now) : []
    if (!related) {
      const pick = pickSlot(rail, personId, permit.answers)
      const mine = !!pick && pick.slot.eligible.some((e) => e.person.id === personId) && !pick.slot.signed.some((g) => g.personId === personId)
      if (!mine && !resumers.some((e) => e.ok && e.person.id === personId)) return null
    }
    return placeFull(permit, ver, rail, resumers, path, author, crew, signed)
  }

  function placeFull(permit: Permit, ver: TemplateVersion, rail: ReturnType<typeof railOf>, resumers: ReturnType<typeof resumeCandidates>, path: string[], author: boolean, crew: boolean, signed: boolean): Placed {
    const progress = stageProgress(rail)
    const plan = planSign({ permit, ver, rail, permits, signer: me!, roleLabel, now, today, timezone: input.timezone, equipment, people, form: permitFormOf(permit, ver, formSnapshots, optionLists), pathIds: path, lists: optionLists })
    const mineSlot = !!plan.slot && plan.slot.eligible.some((e) => e.person.id === personId) && !plan.slot.signed.some((g) => g.personId === personId)
    const next = `Aguarda ${nextLabel(permit, rail, people, resumers)}`
    // A signature may accept several cargos: name the one this person holds (else all of them).
    const heldOf = (ids: string[]) => { const mine = ids.filter((id) => me!.roles.some((r) => r.roleId === id)); return rolesText(mine.length ? mine : ids, roleLabel) }
    const slotWhy = plan.slot?.slot.kind === "pessoa" ? "Você é a pessoa indicada" : plan.slot ? `Seu cargo: ${heldOf(plan.slot.slot.roleIds)}` : ""
    const relWhy = author ? "Você solicitou" : crew ? "Na equipe" : signed ? "Você assinou" : ""
    const emi = emissionSlot(ver)
    const resumeWhy = emi && emi.kind !== "pessoa" ? `Seu cargo: ${heldOf(emi.roleIds)}` : "Você emite esta PT"
    let why = relWhy
    const item = (act: Act, label: string, reasons: string[] = [], stage?: string, own = act !== "abrir"): WorkItem => ({ permitId: permit.id, act, label, own, reasons, stage, why, progress })
    const put = (group: Group, it: WorkItem): Placed => ({ group, item: it })

    const cta = actionLabel(permit, plan, plan.fillOnly)
    // The state badge already says Rascunho/Devolvida: the line names the act, like every other row.
    const submitLabel = plan.slot?.slot.meaning || "Solicita a PT"
    const submitStage = plan.stageName ?? undefined
    if (permit.state === "rascunho" || permit.state === "devolvida") why = author ? "Você solicitou" : relWhy
    // A send that cannot happen (the equipment has another open PT) is blocked, not "to do now".
    const submitFails = plan.checks.filter((c) => !c.ok && !c.fill && c.id !== "server")
    const submitBlock = submitFails.map((c) => c.text)
    const holders = submitFails.flatMap((c) => (c.holder ? [c.holder] : []))
    if (permit.state === "rascunho") {
      if (author && submitBlock.length) return put("bloqueadas", { ...item("abrir", submitLabel, submitBlock, submitStage, true), holders })
      if (author) return put("agir", { ...item("assinar", submitLabel, [], submitStage), cta, fill: plan.fillOnly })
      if (crew) return put("proximas", item("abrir", "Ainda não enviada"))
      return null
    }
    if (permit.state === "devolvida") {
      if (author && submitBlock.length) return put("bloqueadas", { ...item("abrir", submitLabel, submitBlock, submitStage, true), holders })
      if (author) return put("agir", { ...item("assinar", submitLabel, permit.note ? [`Devolvida: ${permit.note}`] : [], submitStage), cta, fill: plan.fillOnly })
      if (crew) return put("proximas", item("abrir", "Devolvida ao solicitante"))
      return null
    }
    // A stopped permit waits for a Retomada by whoever may issue it.
    if (needsResume(permit) && resumers.some((e) => e.ok && e.person.id === personId)) {
      why = resumeWhy
      return put("agir", { ...item("retomar", "Registra a Retomada", permit.holdReason !== null ? [`Parada: ${permit.holdReason}`] : permit.note ? [permit.note] : []), cta: "Retomar" })
    }
    // After the Retomada the new Aceite no campo is the next act.
    if (mineSlot) why = slotWhy || relWhy
    if (permit.state === "suspensa" && permit.resumedReason !== null && mineSlot && plan.slot) {
      const failing = plan.checks.filter((c) => !c.ok)
      if (failing.length === 0 || plan.fillOnly) return put("agir", { ...item("assinar", plan.slot.slot.meaning ?? "", [], plan.stageName ?? undefined), cta, fill: plan.fillOnly })
      return put("bloqueadas", item("abrir", plan.slot.slot.meaning ?? "", failing.map((c) => c.text), plan.stageName ?? undefined, true))
    }
    if (permit.state === "ativa" || permit.state === "suspensa") {
      if (author || crew || signed || mineSlot) {
        const entregar = plan.stageKind === STAGE.entrega && mineSlot && (plan.ok || plan.fillOnly)
        const it = item(entregar ? "entregar" : "abrir", permit.state === "ativa" ? "Em execução" : "Suspensa", permit.holdReason !== null ? [`Parada: ${permit.holdReason}`] : permit.note ? [permit.note] : [], undefined, false)
        // The handover form still open: the button says so and opens Etapas, like every other fill.
        return put("emCampo", entregar ? { ...it, cta, fill: plan.fillOnly } : it)
      }
      return null
    }
    // em_analise, emitida, entregue, expirada (only the Entrega: hand the area back)
    if (mineSlot && plan.slot) {
      const label = plan.slot.slot.meaning ?? ""
      const stage = plan.stageName ?? undefined
      const failing = plan.checks.filter((c) => !c.ok)
      if (failing.length === 0 || plan.fillOnly) return put("agir", { ...item("assinar", label, [], stage), cta, fill: plan.fillOnly })
      if (failing.every((c) => c.wait || c.fill)) return put("proximas", item("abrir", label, failing.filter((c) => c.wait).map((c) => c.text), stage, true))
      return put("bloqueadas", item("abrir", label, failing.filter((c) => !c.wait && !c.fill).map((c) => c.text), stage, true))
    }
    if (crew) return put("proximas", item("abrir", next))
    if (author || signed) return put("aguardando", item("abrir", next))
    return null
  }

  if (cache && !changed) return cache.last!.work
  // Sort by window start (read once per item, not per comparison), stable; suspended first in Em campo.
  const startOf = new Map<string, number>()
  const suspended = new Set<string>()
  for (const g of Object.keys(out) as Group[]) for (const it of out[g]) {
    const p = byId(permits, it.permitId)
    startOf.set(it.permitId, p ? Date.parse(p.windowStart) : NaN)
    if (p?.state === "suspensa") suspended.add(it.permitId)
  }
  const byStart = (a: WorkItem, b: WorkItem) => { const x = startOf.get(a.permitId)!, y = startOf.get(b.permitId)!; return Number.isNaN(x) || Number.isNaN(y) ? 0 : x - y }
  for (const g of Object.keys(out) as Group[]) out[g].sort(byStart)
  out.emCampo.sort((a, b) => Number(suspended.has(b.permitId)) - Number(suspended.has(a.permitId)))
  if (cache) cache.last = { list: cache.scan.list, work: out }
  return out
}

/**
 * The number on the sidebar badge and on "Sua vez": acts the flow is stopped on, waiting for this
 * person now. Entregar is not counted: it closes the person's own work in the field, which stays
 * at the top of Minha área with its own live state (like a draft of your own, it is not a request
 * waiting on you).
 */
export const mustActCount = (w: MyWork) => w.agir.length

export type WaitKind = "bloqueada" | "depois" | "outros"
export type WaitingItem = WorkItem & { kind: WaitKind }

/**
 * "Aguardando": every open PT of mine that is not mine to act on now, in one list. My blocked parts
 * first (something must be fixed before I can sign), then my later turns, then what waits on others.
 */
export function waitingList(w: MyWork): WaitingItem[] {
  return [
    ...w.bloqueadas.map((i) => ({ ...i, kind: "bloqueada" as const })),
    ...w.proximas.filter((i) => i.own).map((i) => ({ ...i, kind: "depois" as const })),
    ...[...w.proximas.filter((i) => !i.own), ...w.aguardando].map((i) => ({ ...i, kind: "outros" as const })),
  ]
}

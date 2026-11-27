/**
 * Pure signing rules: what a signer must satisfy to sign the slot waiting on a permit, and how the
 * permit moves once a signature lands. Each check that the database also enforces carries its code
 * (`deny`), in the database's order (PTW07 → PTW19 → PTW20 → PTW17 → PTW21 → PTW22 → PTW23 → PTW08 →
 * PTW09 → PTW30 → PTW16); the store refuses with the first failing one. No React, no globals.
 */
import type { Asset, AssetRelation, FormSpec, OptionList, Person, Stage, StageKind, TemplateVersion } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import { PERMIT_STATE_LABEL, type PermitState } from "./permitState"
import { equipmentHolders, versionHolds } from "./equipmentLock"
import { liveSig, stagePositions, type SlotView, type StageView } from "./permitView"
import { freezeForm, slotRequired, stageGate, type FormAnswers } from "./form"
import { permitBlocker } from "./formRules"
import { NO_LOGIN_REASON, personIneligible, rolesText } from "./eligibility"
import { windowLimitDenied } from "./windowLimit"
import { electricalTeamDenied, electricalWindowDenied } from "./electrical"
import { cmpInstant, dayOf, dmHms, hms } from "./time"
import type { RuleError } from "./ptwErrors"
import { deny, G7 } from "./permitActs"

export interface SignCheck {
  id: string
  ok: boolean
  text: string
  /** A failure that only needs time to pass (e.g. the window has not started). */
  wait?: boolean
  /** A failure the signer resolves by filling in the stage's form sections. */
  fill?: boolean
  /** The open PT that holds the equipment: screens link its number (which appears in `text`). */
  holder?: { id: string; number: string }
  /** On a failing check the database also enforces: the refusal the store records (code + its words). */
  deny?: RuleError
}
export interface SignPlan {
  stageName: string | null
  stageKind: StageKind | null
  stageId: string | null
  slot: SlotView | null
  checks: SignCheck[]
  ok: boolean
  /** Everything passes except the form: the signer can act now by filling it in. */
  fillOnly: boolean
  /** The stage already has a signature on this revision: its sections are sealed and read-only. */
  sealed: boolean
}

/** The anchor stages of the skeleton, found by kind so a renamed stage keeps working. */
export const STAGE = { emissao: "emissao", campo: "aceite_campo", entrega: "entrega", area: "aceite_area" } as const satisfies Record<string, StageKind>

export const stageOfKind = (ver: Pick<TemplateVersion, "stages">, kind: StageKind): Stage | undefined => ver.stages.find((s) => s.kind === kind)

const SIGNABLE: PermitState[] = ["em_analise", "emitida", "ativa", "entregue"]
/** The area must always be able to be handed back: expirada, or suspensa with no Retomada (the job is abandoned). */
export const handingBack = (p: Pick<Permit, "state" | "resumedReason">) => p.state === "expirada" || (p.state === "suspensa" && p.resumedReason === null)
const L = PERMIT_STATE_LABEL

export interface Equipment {
  relations: AssetRelation[]
  assets: Pick<Asset, "id" | "code">[]
  /** Ids of the "é parte de" relation kinds (`partOfKindIds`). */
  partOf: string[]
  /** Versions that do not hold equipment (`nonHoldingVersionIds`); none when absent. */
  free?: ReadonlySet<string>
}

interface PlanInput {
  permit: Permit
  ver: TemplateVersion
  rail: StageView[]
  permits: Permit[]
  signer: Person
  roleLabel: (roleId: string) => string
  /** Simulated clock: an instant with offset. */
  now: string
  /** "AAAA-MM-DD" in the unit's zone; derived from `now` when absent. */
  today?: string
  timezone?: string
  serverDown?: boolean
  /** Registry facts for the equipment lock. */
  equipment: Equipment
  /** The register's people: a "Pessoa" question that must be eligible is checked against them. */
  people?: Person[]
  /** The form the permit is gated by (`permitFormOf`); the version's when absent. */
  form?: FormSpec
  /** The permit's location and its ancestors (cargo scope). */
  pathIds?: string[]
  /** Option lists: names of list answers and list options in the form's messages. */
  lists?: OptionList[]
  /** SPEC 017: why the PT's place no longer qualifies ("" or absent = fine). Stops Enviar / Reenviar on the screen; the server does not check it. */
  placeProblem?: string
  /** Sign this slot (the store's check of a given act); otherwise the slot the signer would pick. */
  slotId?: string
}

/**
 * The equipment lock as checks: one failing check per open PT that holds this permit's equipment,
 * worded like the database (PTW10): "CCM-L2-01 já tem a PT-UN01-2026-00010 aberta (Ativa) em CCM-L2-01".
 */
export function lockChecks(permit: Permit, permits: Permit[], { relations, assets, partOf, free }: Equipment): SignCheck[] {
  const code = (id: string) => assets.find((a) => a.id === id)?.code ?? id
  if (!versionHolds(permit, free)) return [{ id: "equipamento", ok: true, text: "Não prende o equipamento: pode existir junto com outra PT aberta" }]
  const holds = equipmentHolders(permit, permits, relations, partOf, free)
  if (!holds.length) return [{ id: "equipamento", ok: true, text: "Equipamento sem outra PT aberta" }]
  // One check per (holder, asset, held asset): the id names all three, so a holder blocking through two
  // held assets gives two distinct checks (React keys stay unique), and an exact repeat is dropped.
  const out = new Map<string, SignCheck>()
  for (const { asset, heldAsset, holder } of holds) {
    const number = holder.number ?? holder.id
    const id = `equipamento_${holder.id}_${asset}_${heldAsset}`
    const text = `${code(asset)} já tem a ${number} aberta (${L[holder.state]}) em ${code(heldAsset)}`
    if (!out.has(id)) out.set(id, { id, ok: false, holder: { id: holder.id, number }, text, deny: deny("PTW10", text, holder.id) })
  }
  return [...out.values()]
}

/**
 * Which slot the signer would sign: the first pending one they are eligible for, else the first pending one.
 * A conditional signature ("obrigatória só quando…") whose condition does not hold with these answers is
 * not asked of this permit, so it is never offered; a plainly optional one still is.
 */
export function pickSlot(rail: StageView[], signerId: string, answers?: FormAnswers): { stage: Stage; slot: SlotView } | null {
  const cur = rail.find((s) => s.status === "atual")
  if (!cur) return null
  const asked = (v: SlotView) => !v.slot.requiredWhen || slotRequired(v.slot, answers)
  const pending = cur.slots.filter((v) => !v.satisfied && asked(v)).sort((a, b) => Number(b.slot.required) - Number(a.slot.required))
  // One signature per person in a stage and revision (PTW30): after it, nothing else there is theirs.
  const signedHere = cur.slots.some((v) => v.signed.some((g) => g.personId === signerId))
  const mine = signedHere ? undefined : pending.find((v) => v.eligible.some((e) => e.person.id === signerId))
  const slot = mine ?? pending[0]
  return slot ? { stage: cur.stage, slot } : null
}

/** "falta 1 resposta" / "faltam 3 respostas": says what is missing, not just a number. */
export const missingText = (n: number) => (n === 1 ? "falta 1 resposta" : `faltam ${n} respostas`)

const formOf = (input: Pick<PlanInput, "form" | "ver">) => input.form ?? freezeForm(input.ver.form, [])
const todayOf = (input: Pick<PlanInput, "today" | "now">) => input.today ?? dayOf(input.now)

/** Form checks of one stage: one per section still incomplete or holding an answer that blocks. App completeness: no code. */
function fillChecks(input: PlanInput, stageId: string): SignCheck[] {
  return stageGate(formOf(input), stageId, input.permit.answers, { people: input.people, today: todayOf(input), lists: input.lists })
    .filter((g) => !g.status.done)
    .map((g) => ({
      id: `form_${g.section.id}`,
      ok: false,
      fill: true,
      text: g.status.blocked.length ? `${g.section.title}: ${g.status.blocked[0]}` : `${g.section.title}: ${missingText(g.status.missing.length)}`,
    }))
}

/** PTW16 from the sections of the stages before this one (the stage's own show up as form checks). */
function earlierBlock(input: PlanInput, stageId: string): SignCheck[] {
  const pos = input.ver.stages.findIndex((s) => s.id === stageId)
  if (pos <= 0) return []
  const b = permitBlocker(formOf(input), input.permit.answers, pos - 1, stagePositions(input.ver), { people: input.people ?? [], pathIds: input.pathIds ?? [], today: todayOf(input), now: input.now, optionLists: input.lists })
  return b ? [{ id: "bloqueio", ok: false, text: `Assinatura bloqueada: ${b}`, deny: deny("PTW16", `Assinatura bloqueada: ${b}`) }] : []
}

/** The database's check of a signature on a stage (`signature_gate`): the first block up to and including it. */
export function signatureBlocker(input: Pick<PlanInput, "ver" | "permit" | "form" | "people" | "pathIds" | "now" | "today" | "lists">, stageId: string): RuleError | null {
  const pos = input.ver.stages.findIndex((s) => s.id === stageId)
  const b = permitBlocker(formOf(input), input.permit.answers, Math.max(0, pos), stagePositions(input.ver), { people: input.people ?? [], pathIds: input.pathIds ?? [], today: todayOf(input), now: input.now, optionLists: input.lists })
  return b ? deny("PTW16", `Assinatura bloqueada: ${b}`) : null
}

const serverCheck = (down: boolean): SignCheck =>
  ({ id: "server", ok: !down, text: down ? "Sem servidor" : "Servidor confirmando", ...(down ? { deny: deny("sem_servidor", "Sem servidor: a gravação volta com o servidor") } : {}) })

const finish = (p: Omit<SignPlan, "ok" | "fillOnly">): SignPlan => {
  const failing = p.checks.filter((c) => !c.ok)
  return { ...p, ok: failing.length === 0, fillOnly: failing.length > 0 && failing.every((c) => c.fill) }
}

/** The signer's eligibility for a slot, as the database checks it (PTW08): login first, then the person rule. */
function signerDenied(signer: Person, slot: Pick<SlotView["slot"], "id" | "kind" | "roleIds" | "personId" | "delegable">, input: PlanInput): string | null {
  if (!signer.login) return `Pessoa não elegível: ${NO_LOGIN_REASON}`
  const mandate = input.rail.flatMap((s) => s.slots).find((s) => s.slot.id === slot.id)?.eligible.find((e) => e.person.id === signer.id && e.ok)?.delegation
  if (slot.kind === "pessoa" && slot.personId !== signer.id && !mandate) return "Esta assinatura é da pessoa indicada"
  const why = personIneligible(signer, slot.kind === "cargo" || slot.delegable ? slot.roleIds : null, input.pathIds ?? null, todayOf(input), input.now)
  return why ? `Pessoa não elegível: ${why}` : null
}

/**
 * Enviar (rascunho) and Reenviar (devolvida): the author signs the Solicitação after filling its
 * sections. A resubmission opens a new revision and voids the earlier signatures.
 */
function planSubmit(input: PlanInput): SignPlan {
  const { permit, ver, permits, signer, serverDown = false, equipment } = input
  const st = ver.stages.find((s) => s.kind === "solicitacao") ?? ver.stages[0]
  const checks: SignCheck[] = [serverCheck(serverDown)]
  const author = signer.id === permit.authorId
  checks.push({ id: "autor", ok: author, text: author ? "Você é o solicitante" : "Só o solicitante envia esta PT", ...(author ? {} : { deny: deny(G7.soAutorEnvia, "Só o solicitante envia esta PT") }) })
  if (input.placeProblem) checks.push({ id: "local", ok: false, text: input.placeProblem })
  if (permit.assetIds.length === 0) checks.push({ id: "ativos", ok: false, text: "A PT precisa de ao menos um ativo", deny: deny("PTW04", "A PT precisa de ao menos um ativo") })
  // PTW31: the window within the version's limit.
  const limit = windowLimitDenied(ver, permit.windowStart, permit.windowEnd)
  if (limit) checks.push({ id: "prazo", ok: false, text: limit.message, deny: limit })
  // Root invariant: Enviar opens the PT, so the equipment must be free of any other open PT.
  checks.push(...lockChecks(permit, permits, equipment))
  const slot0 = st.slots[0]
  if (author && slot0) {
    const why = signerDenied(signer, slot0, input)
    if (why) checks.push({ id: "elegivel", ok: false, text: why, deny: deny("PTW08", why) })
  }
  checks.push(...fillChecks(input, st.id))
  const electrical = electricalWindowDenied(input.form ?? ver.form ?? { sections: [] }, permit, input.timezone)
  if (electrical) checks.push({ id: "turno", ok: false, text: electrical.message, deny: electrical, fill: true })
  const teamError = electricalTeamDenied(input.form ?? ver.form ?? { sections: [] }, permit.team, input.people ?? [], input.pathIds ?? [], input.today ?? dayOf(input.now), input.now)
  if (teamError) checks.push({ id: "equipe", ok: false, text: teamError.message, deny: teamError })
  // Only the author has this act: for anyone else the slot lists nobody, so no screen offers it to them.
  const slot: SlotView = { slot: slot0, signed: [], struck: [], satisfied: false, eligible: author ? [{ person: signer, ok: true, reasons: [] }] : [] }
  return finish({ stageName: st.name, stageKind: st.kind ?? null, stageId: st.id, slot, checks, sealed: false })
}

export function planSign(input: PlanInput): SignPlan {
  const { permit, ver, rail, signer, roleLabel, now, serverDown = false } = input
  if (permit.state === "rascunho" || permit.state === "devolvida") return planSubmit(input)
  const checks: SignCheck[] = [serverCheck(serverDown)]
  const handBack = handingBack(permit)
  const cur = rail.find((s) => s.status === "atual")
  // The slot: the one asked for (the store), or the one the signer would pick (the screens).
  let picked: { stage: Stage; slot: SlotView } | null
  let foreign = false
  if (input.slotId) {
    const stage = ver.stages.find((s) => s.slots.some((x) => x.id === input.slotId))
    const view = stage && rail.find((r) => r.stage.id === stage.id)?.slots.find((v) => v.slot.id === input.slotId)
    foreign = !stage
    picked = stage && view ? { stage, slot: view } : null
  } else picked = pickSlot(rail, signer.id, permit.answers)

  // PTW07
  if (permit.state === "encerrada" || permit.state === "cancelada") {
    const text = `A PT está ${L[permit.state]} e não aceita assinatura`
    checks.push({ id: "state", ok: false, text, deny: deny("PTW07", text) })
  } else if (foreign) {
    checks.push({ id: "slot", ok: false, text: "A assinatura não é desta versão do modelo", deny: deny("PTW07", "A assinatura não é desta versão do modelo") })
  } else {
    // PTW19: expirada / suspensa without Retomada: only the Entrega (hand the area back), nothing else.
    const stateOk = SIGNABLE.includes(permit.state) || (permit.state === "suspensa" && permit.resumedReason !== null) || (handBack && picked?.stage.kind === STAGE.entrega)
    const bad = permit.state === "suspensa" && !handBack ? "A PT está Suspensa: aguarda Retomada"
      : handBack ? `A PT está ${L[permit.state]}: só a Entrega da área` : `A PT está ${L[permit.state]} e não aceita assinatura`
    checks.push({
      id: "state", ok: stateOk,
      text: stateOk ? (handBack ? `PT ${L[permit.state].toLowerCase()}: só a entrega da área` : "PT aceita assinaturas") : bad,
      ...(stateOk ? {} : { deny: deny(G7.estadoNaoAssina, bad) }),
    })
  }
  if (!picked) {
    if (!foreign) checks.push({ id: "slot", ok: false, text: "Nenhuma assinatura pendente", deny: deny(G7.naoEAVez, "Nenhuma assinatura pendente") })
    return { stageName: null, stageKind: null, stageId: null, slot: null, checks, ok: false, fillOnly: false, sealed: false }
  }
  const { slot } = picked
  const stageName = picked.stage.name
  const stageKind = picked.stage.kind ?? null
  if (stageKind === "emissao" || stageKind === "aceite_campo") {
    const electrical = electricalWindowDenied(input.form ?? ver.form ?? { sections: [] }, permit, input.timezone)
    if (electrical) checks.push({ id: "turno", ok: false, text: electrical.message, deny: electrical })
    const teamError = electricalTeamDenied(input.form ?? ver.form ?? { sections: [] }, permit.team, input.people ?? [], input.pathIds ?? [], input.today ?? dayOf(now), now)
    if (teamError) checks.push({ id: "equipe", ok: false, text: teamError.message, deny: teamError })
  }
  // PTW20: only the current stage signs.
  if (!cur || cur.stage.id !== picked.stage.id) {
    const text = cur ? `Só a etapa atual (${cur.stage.name}) aceita assinatura` : "Nenhuma assinatura pendente"
    checks.push({ id: "etapa", ok: false, text, deny: deny(G7.naoEAVez, text) })
  }
  // PTW20: a conditional signature whose condition does not hold is not asked of this permit.
  if (slot.slot.requiredWhen && !slotRequired(slot.slot, permit.answers)) {
    const text = `Esta assinatura não é pedida nesta PT (${slot.slot.meaning})`
    checks.push({ id: "condicao", ok: false, text, deny: deny(G7.naoEAVez, text) })
  }
  // PTW17: the Solicitação is the requester's.
  if (stageKind === "solicitacao" && signer.id !== permit.authorId) checks.push({ id: "autor", ok: false, text: "Só o solicitante assina a Solicitação", deny: deny(G7.soAutorEnvia, "Só o solicitante assina a Solicitação") })
  // PTW21
  if (permit.holdReason !== null && permit.holdAt && (stageKind === STAGE.campo || stageKind === STAGE.area)) {
    const text = `Parada registrada às ${hms(permit.holdAt)}: ${stageName} aguarda Retomada`
    checks.push({ id: "parada", ok: false, text, deny: deny(G7.paradaAguarda, text) })
  }
  // PTW22
  if (stageKind === STAGE.campo && permit.resumedBy === signer.id) {
    checks.push({ id: "retomador", ok: false, text: "Você registrou a Retomada: o novo aceite é de outra pessoa", deny: deny(G7.retomadorNaoAceita, "Quem registrou a Retomada não faz o novo Aceite no campo") })
  }
  // PTW23
  const win = `Aceite no campo só dentro da janela (${dmHms(permit.windowStart).slice(0, 11)} a ${dmHms(permit.windowEnd).slice(0, 11)})`
  if (stageKind === STAGE.campo) {
    if (cmpInstant(now, permit.windowStart) < 0) checks.push({ id: "janela", ok: false, wait: true, text: `Aceite a partir de ${dmHms(permit.windowStart)}`, deny: deny(G7.foraDaJanela, win) })
    else if (cmpInstant(now, permit.windowEnd) > 0) checks.push({ id: "janela", ok: false, text: "Janela encerrada", deny: deny(G7.foraDaJanela, "Janela encerrada") })
    else checks.push({ id: "janela", ok: true, text: "Dentro da janela" })
  // The handover stays possible after the window: work must stop, and the area still has to be returned.
  } else if (cmpInstant(now, permit.windowEnd) > 0 && permit.state !== "entregue" && stageKind !== STAGE.entrega) {
    checks.push({ id: "janela", ok: false, text: "Janela encerrada", deny: deny(G7.foraDaJanela, "Janela encerrada") })
  }
  // PTW31: issuing checks the window against the version's limit.
  if (stageKind === STAGE.emissao) {
    const limit = windowLimitDenied(ver, permit.windowStart, permit.windowEnd)
    if (limit) checks.push({ id: "prazo", ok: false, text: limit.message, deny: limit })
  }
  // PTW08
  const who = slot.slot.kind === "pessoa" ? "pessoa indicada" : rolesText(slot.slot.roleIds, roleLabel)
  const entry = slot.eligible.find((e) => e.person.id === signer.id)
  const why = signerDenied(signer, slot.slot, input)
  const okElig = !!entry?.ok && !why
  checks.push({
    id: "elegivel", ok: okElig,
    text: okElig ? `${who} · cadastro e conta ativos` : entry ? `${who}: ${entry.reasons.join(", ") || why}` : slot.slot.kind === "pessoa" ? "Esta assinatura é de outra pessoa" : `Você não tem o cargo ${who} neste local`,
    ...(okElig ? {} : { deny: deny("PTW08", why ?? "Pessoa não elegível: cargo vencido ou fora do escopo do local") }),
  })
  // PTW09
  for (const rule of ver.separation) {
    if (rule.slotA !== slot.slot.id && rule.slotB !== slot.slot.id) continue
    const otherId = rule.slotA === slot.slot.id ? rule.slotB : rule.slotA
    const other = rail.flatMap((s) => s.slots).find((v) => v.slot.id === otherId)
    const represented = picked.slot.eligible.find((e) => e.person.id === signer.id && e.ok)?.delegation?.delegatorId
    if (other?.signed.some((g) => g.personId === signer.id || g.representedPersonId === signer.id || (represented && (g.personId === represented || g.representedPersonId === represented)))) {
      checks.push({ id: `sep_${otherId}`, ok: false, text: `Você assinou “${other.slot.meaning}” nesta revisão`, deny: deny("PTW09", "A mesma pessoa não pode assinar as duas partes separadas") })
    }
  }
  // PTW30: one signature per person in a stage and revision.
  const represented = picked.slot.eligible.find((e) => e.person.id === signer.id && e.ok)?.delegation?.delegatorId
  const already = !!rail.find((s) => s.stage.id === picked.stage.id)?.slots.some((v) => v.signed.some((g) => g.personId === signer.id || g.representedPersonId === signer.id || (represented && (g.personId === represented || g.representedPersonId === represented))))
  checks.push({ id: "pendente", ok: !already, text: already ? "Você já assinou esta etapa" : "Assinatura ainda pendente", ...(already ? { deny: deny(G7.jaAssinou, `Você já assinou esta etapa (${stageName})`) } : {}) })
  // PTW16 from earlier stages, then the stage's own form (completeness and blocks) while not sealed.
  checks.push(...earlierBlock(input, picked.stage.id))
  const stageView = rail.find((s) => s.stage.id === picked.stage.id)
  const sealed = !!stageView?.slots.some((v) => v.signed.length > 0)
  if (!sealed) checks.push(...fillChecks(input, picked.stage.id))
  return finish({ stageName, stageKind, stageId: picked.stage.id, slot, checks, sealed })
}

/** The first refusal of a plan (the store's answer), or null when nothing the database enforces fails. */
export const planDenied = (plan: Pick<SignPlan, "checks">): RuleError | null => plan.checks.find((c) => !c.ok && c.deny)?.deny ?? null

/** The state the permit moves to after a signature, or the same state when nothing changes. */
export function stateAfterSign(permit: Permit, ver: TemplateVersion, sigs: SignatureRec[]): PermitState {
  const live = sigs.filter(liveSig(permit))
  const done = (kind: StageKind) => {
    const st = stageOfKind(ver, kind)
    return !!st && st.slots.every((s) => !slotRequired(s, permit.answers) || live.filter((g) => g.slotId === s.id).length >= s.min)
  }
  const s = permit.state
  if (s === "rascunho" || s === "devolvida") return "em_analise"
  if (s === "em_analise" && done(STAGE.emissao)) return "emitida"
  if (s === "emitida" && done(STAGE.campo)) return "ativa"
  if (s === "suspensa" && permit.resumedReason !== null && done(STAGE.campo)) return "ativa"
  if (s === "ativa" && done(STAGE.entrega)) return "entregue"
  // Handing the area back from expirada, or abandoning a suspensa job nobody resumed.
  if (handingBack(permit) && done(STAGE.entrega)) return "entregue"
  if (s === "entregue" && done(STAGE.area)) return "encerrada"
  return s
}

/**
 * The one name for the act a person does on a permit, used on every screen: Enviar (draft),
 * Reenviar (returned), Entregar (handover) or Assinar. `fill` prefixes "Preencher e …" while the
 * person's part of the form is still open.
 */
export function actionVerb(permit: Permit, plan: Pick<SignPlan, "stageKind">): "Enviar" | "Reenviar" | "Entregar" | "Assinar" {
  if (permit.state === "rascunho") return "Enviar"
  if (permit.state === "devolvida") return "Reenviar"
  return plan.stageKind === "entrega" ? "Entregar" : "Assinar"
}

export function actionLabel(permit: Permit, plan: Pick<SignPlan, "stageKind" | "slot">, fill = false): string {
  const verb = actionVerb(permit, plan)
  const submit = verb === "Enviar" || verb === "Reenviar"
  const head = fill ? `Preencher e ${verb.toLowerCase()}` : verb
  if (submit) return `${head} a PT`
  if (verb === "Entregar") return `${head} a área`
  return `${head}: ${plan.slot?.slot.meaning ?? ""}`
}

/**
 * Devolver: whoever is eligible for the slot pending in análise may return the permit, except its
 * author (PTW18: returning it to oneself makes no sense). Like Assinar it concludes with the button.
 */
export function returnDenied(permit: Permit, plan: Pick<SignPlan, "slot">, signerId: string): RuleError | null {
  if (permit.state !== "em_analise") return deny("PTW05", `Mudança de estado não permitida: ${L[permit.state]} → Devolvida`)
  if (permit.authorId === signerId) return deny(G7.autorNaoDevolve, "O solicitante não devolve a própria PT")
  if (!plan.slot || plan.slot.satisfied || !plan.slot.eligible.some((e) => e.ok && e.person.id === signerId)) return deny(G7.naoPodeDevolver, "Só quem pode assinar a etapa pendente devolve a PT")
  return null
}
export const canReturn = (permit: Permit, plan: Pick<SignPlan, "slot">, signerId: string): boolean => returnDenied(permit, plan, signerId) === null

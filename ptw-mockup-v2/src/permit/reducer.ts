import { actDenied, deny } from "@/core/permitActs"
import { dueToExpire, EXPIRE_NOTE, nextPermitNumber, pathIds, permitContentSha256, permitFormOf, railOf, stagePositions } from "@/core/permitView"
import { planDenied, planSign, returnDenied, signatureBlocker, STAGE, stageOfKind, stateAfterSign } from "@/core/signing"
import { canStop, planResume, resumeCandidates, RESUME_VOID_REASON, resendVoidReason, stopEffect } from "@/core/stopResume"
import { nonHoldingVersionIds, partOfKindIds } from "@/core/equipmentLock"
import { answerProblem, formSha256, itemStageId, permitBlocker } from "@/core/formRules"
import { personIneligible } from "@/core/eligibility"
import { DEFAULT_TZ, dayOf, instant } from "@/core/time"
import { endText, extendDenied, planExtend } from "@/core/extension"
import { windowLimitDenied } from "@/core/windowLimit"
import { electricalSequenceDenied, revalidationDenied, type RevalidationInput } from "@/core/electrical"
import { deniedEvent, extensionEvent, rowEvent, signatureEvent, type AuditCtx, type AuditDraft, type AuditTable, type Row, type RowLookups } from "@/core/audit"
import type { RuleError } from "@/core/ptwErrors"
import type { ItemAnswer } from "@/core/form"
import { uuidv7 } from "@/lib/id"
import type { RegistryState } from "@/registry/types"
import { attachmentRow, permitAnswerRow, permitRevisionRow, permitRow } from "./rows"
import type { BlobRec, Permit, PermitAttachment, PermitData, PermitExtension, SignatureRec } from "./types"

/**
 * Permits, signatures, revisions and files, in browser memory, written the way the database writes
 * them (ptw-server/db/schema/30_pt.sql): every rule is checked here, whatever screen asked, and a
 * refused act changes nothing and stays in the audit trail with its code. A reload restores the sample.
 */
export type PermitAction =
  /** Enviar / Reenviar (rascunho, devolvida) or a signature of the current stage. */
  | { kind: "sign"; permitId: string; slotId: string; personId: string }
  | { kind: "refuse"; permitId: string; personId: string; reason: string }
  /** One answer of the form, saved as it is given; null removes it. */
  | { kind: "answer"; permitId: string; personId: string; itemId: string; value: ItemAnswer | null }
  | { kind: "stop"; permitId: string; personId: string; reason: string }
  | { kind: "resume"; permitId: string; personId: string; reason: string }
  /** The server's clock: the window ended (ptw.expire_due). No person. */
  | { kind: "expire"; permitId: string }
  /** Prorrogar: a later end of the window, with its justification (ptw.permit_extend). */
  | { kind: "extend"; permitId: string; personId: string; newEnd: string; reason: string }
  | ({ kind: "revalidate"; permitId: string; personId: string } & RevalidationInput)
  /** A captured file: its blob (if new) and the attachment row. Insert only. */
  | { kind: "attach"; permitId: string; personId: string; attachment: PermitAttachment; blob: BlobRec }

export interface PermitCtx {
  serverDown?: boolean
  /** Who acts and when (`at` = the simulated instant). */
  audit: AuditCtx
  /** The registry the rules read (versions, people, places, relations, unit). */
  registry: RegistryState
  /** Ids of new rows (signatures); uuid v7 at `audit.at` when absent. The sample passes fixed ones. */
  newId?: () => string
  /** The unit's counter (permit_counter) before the first number this data gives; the sample only. */
  counterStart?: number
}

/** What a reducer step wrote: the new data and the audit drafts it produced (none when nothing happened). */
export interface PermitStep { data: PermitData; events: AuditDraft[]; /** Why the guard refused the act (nothing applied). */ denied?: RuleError }

const MIME_RE = /^(image|video|application|text)\/[a-z0-9.+-]{1,100}$/

/** The attempted action recorded with a refusal. */
function deniedAction(a: PermitAction, p: Permit): string {
  switch (a.kind) {
    // As the database records them: the write that was refused (the state change of Enviar / Devolver).
    case "sign": return p.state === "rascunho" || p.state === "devolvida" ? "pt.estado" : "pt.assinatura"
    case "refuse": return "pt.estado"
    case "answer": return "pt.resposta"
    case "stop": return "pt.parada"
    case "resume": return "pt.retomada"
    case "expire": return "pt.estado"
    case "attach": return "pt.anexo.incluido"
    case "extend": return "pt.prorrogada"
    case "revalidate": return "pt.revalidada"
  }
}

/** Exported for the core tests and the sample data. Pure: the provider appends `events` to the audit log. */
export function permitReducer(data: PermitData, a: PermitAction, ctx: PermitCtx): PermitStep {
  const p = data.permits.find((x) => x.id === a.permitId)
  if (!p) return { data, events: [] }
  const reg = ctx.registry
  const unit = reg.units[0]
  const unitId = unit?.id ?? ""
  const tz = unit?.timezone ?? DEFAULT_TZ
  const now = ctx.audit.at
  const newId = ctx.newId ?? (() => uuidv7(Date.parse(now)))
  const today = dayOf(now, tz)
  const ver = reg.templates.find((t) => t.id === p.templateId)?.versions.find((v) => v.id === p.versionId)
  const audit: AuditCtx = a.kind === "expire" ? { at: now, actorId: null, auth: "sistema" } : ctx.audit
  const refuse = (err: RuleError, extra: Record<string, string> = {}): PermitStep =>
    ({ data, events: [deniedEvent(deniedAction(a, p), err, { id: p.id, revision: p.revision }, audit, extra)], denied: err })
  if (!ver) return refuse(deny("PTW07", "A versão do modelo desta PT não existe"))

  const look: RowLookups = {
    permitRevision: (id) => data.permits.find((x) => x.id === id)?.revision,
    assetCode: (id) => reg.assets.find((x) => x.id === id)?.code,
    personName: (id) => reg.people.find((x) => x.id === id)?.name,
  }
  const row = (table: AuditTable, before: Row | undefined, after: Row | undefined, c: AuditCtx = audit) => rowEvent(table, before, after, c, look)
  const meaningOf = (slotId: string) => ver.stages.flatMap((s) => s.slots).find((s) => s.id === slotId)?.meaning ?? ""
  /** One write of the permit row: row_version + 1, updated_at = now (the trigger). */
  const write = (patch: Partial<Permit>): Permit => ({ ...p, ...patch, rowVersion: p.rowVersion + 1, updatedAt: now })
  const replace = (np: Permit) => data.permits.map((x) => (x.id === p.id ? np : x))
  const permitEvent = (np: Permit, c: AuditCtx = audit) => row("permit", permitRow(p, unitId), permitRow(np, unitId), c)
  const path = pathIds(reg.locations, p.locationId)
  const form = permitFormOf(p, ver, data.formSnapshots, reg.optionLists)
  const equipment = { relations: reg.relations, assets: reg.assets, partOf: partOfKindIds(reg.relationKinds), free: nonHoldingVersionIds(reg.templates) }
  const person = (id: string) => reg.people.find((x) => x.id === id)
  const rail = () => railOf(p, ver, data.signatures, reg.people, reg.locations, today, now, reg.delegations)
  const plan = (signerId: string, slotId?: string) => {
    const signer = person(signerId)
    return signer ? planSign({ permit: p, ver, rail: rail(), permits: data.permits, signer, roleLabel: (id) => id, now, today, timezone: tz, serverDown: ctx.serverDown, equipment, people: reg.people, form, pathIds: path, slotId, lists: reg.optionLists }) : null
  }
  const noPerson = deny("PTW08", "Pessoa não elegível: pessoa inexistente")

  switch (a.kind) {
    case "answer": {
      const stageId = itemStageId(form, a.itemId)
      const positions = stagePositions(ver)
      const entrega = stageOfKind(ver, STAGE.entrega)
      const stagePos = stageId === null ? undefined : stageId === undefined ? null : positions[stageId] ?? null
      const denied = actDenied(p, { kind: "answer", stagePos, entregaPos: entrega ? positions[entrega.id] : null }, ctx.serverDown)
        ?? (stageId === null ? deny("PTW15", `Item inexistente no formulário: ${a.itemId}`) : null)
      if (denied) return refuse(denied, { item: a.itemId })
      const sequenceError = electricalSequenceDenied(form, p.answers, a.itemId)
      if (sequenceError) return refuse(sequenceError)
      // Checklist lines merge, so two quick taps on different lines never overwrite each other.
      const prev = p.answers[a.itemId]
      const value: ItemAnswer | null = a.value && a.value.t === "verificacao" && prev?.t === "verificacao" ? { t: "verificacao", lines: { ...prev.lines, ...a.value.lines } } : a.value
      if (value) {
        const bad = answerProblem(form, a.itemId, value, {
          permitId: p.id, permitAssetIds: p.assetIds, attachments: data.attachments, people: reg.people, optionLists: reg.optionLists, pathIds: path, today, now,
        })
        if (bad) return refuse(bad, { item: a.itemId })
      }
      const answers = { ...p.answers }
      const answerMeta = { ...p.answerMeta }
      if (value) { answers[a.itemId] = value; answerMeta[a.itemId] = { answeredBy: a.personId, answeredAt: now } }
      else { delete answers[a.itemId]; delete answerMeta[a.itemId] }
      // An answer is its own row: the permit row does not change (no row_version bump).
      const np: Permit = { ...p, answers, answerMeta }
      const ev = row("permit_answer", permitAnswerRow(p, a.itemId, unitId), permitAnswerRow(np, a.itemId, unitId))
      return { data: { ...data, permits: replace(np) }, events: ev ? [ev] : [] }
    }

    case "attach": {
      if (ctx.serverDown) return refuse(deny("sem_servidor", "Sem servidor: a gravação volta com o servidor"))
      if (p.state === "encerrada" || p.state === "cancelada") return refuse(deny("PTW06", `A PT está ${p.state === "encerrada" ? "Encerrada" : "Cancelada"} e não aceita respostas`))
      if (!MIME_RE.test(a.blob.mime)) return refuse(deny("23514", `Tipo de arquivo não aceito: ${a.blob.mime || "desconhecido"}`))
      if (a.blob.size < 1 || a.blob.size > 2 ** 31) return refuse(deny("23514", "Arquivo vazio ou maior que 2 GiB"))
      const fileName = a.attachment.fileName.slice(0, 255) || "arquivo"
      const att: PermitAttachment = { ...a.attachment, fileName, permitId: p.id, capturedBy: a.personId, capturedAt: now }
      const blobs = data.blobs[a.blob.sha256] ? data.blobs : { ...data.blobs, [a.blob.sha256]: { ...a.blob, storedAt: now } }
      const ev = row("attachment", undefined, attachmentRow(att, unitId))
      return { data: { ...data, attachments: [...data.attachments, att], blobs }, events: ev ? [ev] : [] }
    }

    case "sign": {
      const submit = p.state === "rascunho" || p.state === "devolvida"
      const signer = person(a.personId)
      if (!signer) return refuse(noPerson)
      const pl = plan(a.personId, submit ? undefined : a.slotId)!
      const slotId = submit ? pl.slot?.slot.id ?? a.slotId : a.slotId
      const slot = ver.stages.flatMap((s) => s.slots).find((s) => s.id === slotId)
      const stage = ver.stages.find((s) => s.slots.some((x) => x.id === slotId))
      // The cargo the signer acts in: of the slot's cargos, the first the signer holds.
      const held = slot?.kind === "cargo" ? slot.roleIds.find((id) => signer.roles.some((r) => r.roleId === id)) ?? slot.roleIds[0] ?? null : null
      const roleCtx: AuditCtx = { ...audit, roleId: slot?.kind === "cargo" ? held : audit.roleId ?? null }

      if (submit) {
        const resend = p.state === "devolvida"
        const denied = actDenied(p, { kind: "sign", next: "em_analise" }, ctx.serverDown) ?? planDenied(pl)
          ?? (stage ? signatureBlocker({ ver, permit: p, form, people: reg.people, pathIds: path, now, today, lists: reg.optionLists }, stage.id) : null)
        if (denied) return refuse(denied, { slot: slotId })
        const rev = resend ? p.revision + 1 : p.revision
        const snapshotSha256 = p.snapshotSha256 ?? formSha256(form)
        const np = write({
          state: "em_analise", number: p.number ?? nextPermitNumber(data.permits, unit?.code ?? "", now, tz, ctx.counterStart),
          snapshotSha256, snapshotAt: p.snapshotAt ?? now, note: null, revision: rev,
        })
        const events: AuditDraft[] = []
        const pe = permitEvent(np, roleCtx)
        if (pe) events.push(pe)
        // Resend: the earlier revisions' signatures are voided (they stay on record), and a revision row opens.
        let signatures = data.signatures
        const revisions = [...data.revisions]
        if (resend) {
          const reason = resendVoidReason(rev)
          signatures = signatures.map((g) => {
            if (g.permitId !== p.id || g.rev >= rev || g.voidedAt !== null) return g
            events.push(signatureEvent(g, meaningOf(g.slotId), reason, roleCtx))
            return { ...g, voidedAt: now, voidedReason: reason }
          })
          const r = { permitId: p.id, rev, at: now, reason: "Reenviada após devolução", sha256: permitContentSha256(np) }
          revisions.push(r)
          const re = row("permit_revision", undefined, permitRevisionRow(r, unitId), roleCtx)
          if (re) events.push(re)
        }
        const sig: SignatureRec = { id: newId(), permitId: p.id, rev, slotId, personId: a.personId, signedAt: now, voidedAt: null, voidedReason: null }
        events.push(signatureEvent(sig, meaningOf(slotId), null, roleCtx))
        const formSnapshots = data.formSnapshots[snapshotSha256] ? data.formSnapshots : { ...data.formSnapshots, [snapshotSha256]: form }
        return { data: { ...data, permits: replace(np), signatures: [...signatures, sig], revisions, formSnapshots }, events }
      }

      const mandate = pl.slot?.eligible.find((e) => e.person.id === a.personId && e.ok)?.delegation
      const sig: SignatureRec = { id: newId(), permitId: p.id, rev: p.revision, slotId, personId: a.personId, signedAt: now, voidedAt: null, voidedReason: null,
        ...(mandate ? { delegationId: mandate.id, representedPersonId: mandate.delegatorId } : {}) }
      const next = stateAfterSign(p, ver, [...data.signatures, sig])
      const denied = actDenied(p, { kind: "sign", next }, ctx.serverDown) ?? planDenied(pl)
        ?? (stage ? signatureBlocker({ ver, permit: p, form, people: reg.people, pathIds: path, now, today, lists: reg.optionLists }, stage.id) : null)
      if (denied) return refuse(denied, { slot: slotId })
      const events: AuditDraft[] = [signatureEvent(sig, meaningOf(slotId), null, roleCtx)]
      let permits = data.permits
      if (next !== p.state) {
        // The new Aceite no campo of a resumed permit ends the suspension (the Retomada is spent).
        const reactivated = p.state === "suspensa" && next === "ativa"
        const np = write({ state: next, ...(reactivated ? { resumedReason: null, resumedBy: null, resumedAt: null } : {}) })
        const pe = permitEvent(np, roleCtx)
        if (pe) events.push(pe)
        permits = replace(np)
      }
      return { data: { ...data, permits, signatures: [...data.signatures, sig] }, events }
    }

    case "refuse": {
      const pl = plan(a.personId)
      const denied = actDenied(p, { kind: "refuse" }, ctx.serverDown) ?? (pl ? returnDenied(p, pl, a.personId) : noPerson)
        ?? (a.reason.trim() ? null : deny("23514", "Diga o motivo da devolução"))
      if (denied) return refuse(denied)
      const np = write({ state: "devolvida", note: a.reason.trim().slice(0, 500) })
      const ev = permitEvent(np)
      return { data: { ...data, permits: replace(np) }, events: ev ? [ev] : [] }
    }

    case "stop": {
      const who = person(a.personId)
      const denied = actDenied(p, { kind: "stop" }, ctx.serverDown) ?? (who ? canStop(p, who, now).deny ?? null : deny("PTW24", "Sem login ativo: pare e avise o líder"))
      if (denied) return refuse(denied)
      // Every stop records the hold; an ativa permit also becomes suspensa, in the same write.
      const np = write({
        state: stopEffect(p).state, holdReason: a.reason.slice(0, 500), holdBy: a.personId, holdAt: now,
        resumedReason: null, resumedBy: null, resumedAt: null,
      })
      const ev = permitEvent(np)
      return { data: { ...data, permits: replace(np) }, events: ev ? [ev] : [] }
    }

    case "resume": {
      const who = person(a.personId)
      if (!who) return refuse(noPerson)
      const rp = planResume({ permit: p, ver, signer: who, people: reg.people, locations: reg.locations, roleLabel: (id) => id, now, today, serverDown: ctx.serverDown })
      const denied = actDenied(p, { kind: "resume" }, ctx.serverDown) ?? rp.checks.find((c) => !c.ok && c.deny)?.deny ?? (a.reason.trim() ? null : deny("23514", "Diga o motivo da retomada"))
      if (denied) return refuse(denied)
      const np = write({ holdReason: null, holdBy: null, holdAt: null, resumedReason: a.reason.trim().slice(0, 500), resumedBy: a.personId, resumedAt: now })
      const events: AuditDraft[] = []
      const pe = permitEvent(np)
      if (pe) events.push(pe)
      // A suspensa permit needs a new Aceite no campo: the Retomada voids the current one.
      let signatures = data.signatures
      if (p.state === "suspensa") {
        const campo = new Set(stageOfKind(ver, STAGE.campo)?.slots.map((s) => s.id) ?? [])
        signatures = signatures.map((g) => {
          if (g.permitId !== p.id || g.rev !== p.revision || g.voidedAt !== null || !campo.has(g.slotId)) return g
          events.push(signatureEvent(g, meaningOf(g.slotId), RESUME_VOID_REASON, audit))
          return { ...g, voidedAt: now, voidedReason: RESUME_VOID_REASON }
        })
      }
      return { data: { ...data, permits: replace(np), signatures }, events }
    }

    case "revalidate": {
      if (ctx.serverDown) return refuse(deny("sem_servidor", "Sem servidor"))
      const denied = revalidationDenied(p, form, data.signatures, ver.stages.filter((s) => s.kind === "emissao").flatMap((s) => s.slots.map((sl) => sl.id)), a.personId, a, now)
        ?? windowLimitDenied(ver, p.revalidation?.originalStart ?? p.windowStart, a.newEnd)
      if (denied) return refuse(denied)
      if (!resumeCandidates(p, ver, reg.people, reg.locations, today, now).some((c) => c.person.id === a.personId && c.ok)) return refuse(deny("PTW34", "Responsável não elegível"))
      if (Object.entries(p.team).some(([roleId, ids]) => ids.some((id) => personIneligible(person(id), roleId, path, today, now)))) return refuse(deny("PTW34", "Equipe contém pessoa não elegível"))
      const fieldPos = ver.stages.findIndex((s) => s.kind === "aceite_campo")
      const blocker = permitBlocker(form, p.answers, fieldPos, stagePositions(ver), { people: reg.people, pathIds: path, today, now, optionLists: reg.optionLists })
      if (blocker) return refuse(deny("PTW34", `Revalidação bloqueada: ${blocker}`))
      const revalidation = { id: newId(), originalStart: p.revalidation?.originalStart ?? p.windowStart, shiftStart: a.shiftStart, shiftEnd: a.shiftEnd, newEnd: a.newEnd, reason: a.reason.trim(), personId: a.personId, at: now }
      const np = write({ state: "suspensa", windowStart: now, windowEnd: a.newEnd, note: null, resumedReason: a.reason.trim(), resumedBy: a.personId, resumedAt: now, revalidation })
      const fieldSlots = new Set(ver.stages.filter((s) => s.kind === "aceite_campo").flatMap((s) => s.slots.map((sl) => sl.id)))
      const events: AuditDraft[] = []
      const signatures = data.signatures.map((s) => {
        if (s.permitId !== p.id || s.voidedAt || !fieldSlots.has(s.slotId)) return s
        const reason = "Revalidação: novo aceite no campo necessário"
        events.push(signatureEvent(s, meaningOf(s.slotId), reason, audit))
        return { ...s, voidedAt: now, voidedReason: reason }
      })
      const event = permitEvent(np)
      if (event) events.push({ ...event, action: "pt.revalidada", text: `Revalidou a PT · ${a.reason.trim()}`, data: { ...event.data,
        turno: { inicio: a.shiftStart, fim: a.shiftEnd }, motivo: a.reason.trim(), condicoes_preservadas: a.conditionsUnchanged, equipe_preservada: a.teamUnchanged, avaliacao_local: a.assessmentConfirmed } })
      return { data: { ...data, permits: replace(np), signatures }, events }
    }

    case "extend": {
      const who = person(a.personId)
      if (!who) return refuse(noPerson)
      const ep = planExtend({ permit: p, ver, signer: who, people: reg.people, locations: reg.locations, roleLabel: (id) => id, now, today, timezone: tz, serverDown: ctx.serverDown, newEnd: a.newEnd, reason: a.reason })
      const denied = extendDenied(ep)
      if (denied) return refuse(denied)
      const newEnd = instant(a.newEnd, tz)
      const x: PermitExtension = { id: newId(), permitId: p.id, revision: p.revision, oldEnd: p.windowEnd, newEnd, reason: a.reason.trim(), personId: a.personId, at: now }
      const np = write({ windowEnd: newEnd })
      // One event is the record (the database's pt.prorrogada); the window's new end is in it.
      const ev = extensionEvent(x, `Janela prorrogada: ${endText(x.oldEnd, tz)} → ${endText(newEnd, tz)} · ${x.reason}`, audit)
      return { data: { ...data, permits: replace(np), extensions: [...data.extensions, x] }, events: [ev] }
    }

    case "expire": {
      if (!dueToExpire([p], now).length) return { data, events: [] }
      const denied = actDenied(p, { kind: "expire" })
      if (denied) return refuse(denied)
      const np = write({ state: "expirada", note: EXPIRE_NOTE })
      const ev = permitEvent(np)
      return { data: { ...data, permits: replace(np) }, events: ev ? [ev] : [] }
    }
  }
}


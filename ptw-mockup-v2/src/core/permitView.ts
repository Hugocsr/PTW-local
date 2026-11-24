/**
 * Pure read-side rules for a permit: which signatures stand, who can sign what is missing, who acts
 * next. No React, no globals; the date comes from the caller.
 */
import type { Location, OptionList, Person, SignSlot, Stage, StageKind, TemplateVersion, FormSpec } from "@/registry/types"
import type { Permit, PermitData, SignatureRec } from "@/permit/types"
import { checkSlotAt, type RoleCheck } from "./eligibility"
import { formOfPermit, slotRequired } from "./form"
import type { PermitState } from "./permitState"
import type { StatusTone } from "@/lib/tone"
import { cmpInstant, DEFAULT_TZ, wallOf } from "./time"
import { canonicalJson, sha256Hex, type Json } from "./audit"
import { locationPath, signaturesOf } from "./indexes"
import type { Delegation } from "./delegation"

export interface SlotView {
  slot: SignSlot
  /** Signatures on the current revision, not voided. */
  signed: SignatureRec[]
  /** Voided signatures (a resend after Devolver, a Retomada): they stay on record, struck, with their reason. */
  struck: SignatureRec[]
  satisfied: boolean
  eligible: RoleCheck[]
}
/** `pulada`: a stage left behind unsigned because the area is being handed back (see `handBackStage`). */
export type StageStatus = "feita" | "atual" | "futura" | "pulada"
export interface StageView { stage: Stage; slots: SlotView[]; status: StageStatus }

/** The place and its ancestors, nearest first (indexed per locations array; treat the result as read-only). */
export function pathIds(locations: Location[], id: string): string[] {
  return locationPath(locations, id)
}

/**
 * The area must always be able to be handed back (decision 2026-11-09). An expirada permit, or a
 * suspensa one nobody resumed (the job is abandoned), goes straight to the Entrega; once entregue,
 * the Aceite da área is next, even if a stage before it was never signed.
 */
export function handBackStage(p: Pick<Permit, "state" | "resumedReason">): StageKind | null {
  if (p.state === "expirada" || (p.state === "suspensa" && p.resumedReason === null)) return "entrega"
  if (p.state === "entregue") return "aceite_area"
  return null
}

/** A signature that still counts: on the permit's current revision and not voided. */
export const liveSig = (p: Pick<Permit, "id" | "revision">) => (g: SignatureRec) => g.permitId === p.id && g.rev === p.revision && g.voidedAt === null

/** `now` (instant) decides whether an account has expired; without it, the start of `today` counts. */
export function railOf(p: Permit, ver: TemplateVersion, sigs: SignatureRec[], people: Person[], locations: Location[], today: string, now?: string, delegations: readonly Delegation[] = []): StageView[] {
  const path = pathIds(locations, p.locationId)
  const anchorKind = handBackStage(p)
  const anchor = anchorKind ? ver.stages.findIndex((s) => s.kind === anchorKind) : -1
  let currentFound = false
  return ver.stages.map((stage, i) => {
    const slots = stage.slots.map((slot): SlotView => {
      const mine = signaturesOf(sigs, p.id).filter((s) => s.slotId === slot.id)
      const signed = mine.filter(liveSig(p))
      // Voided, or (data from before voiding existed) left on an earlier revision.
      const struck = mine.filter((s) => s.voidedAt !== null || s.rev < p.revision)
      const satisfied = signed.length >= slot.min
      return { slot, signed, struck, satisfied, eligible: satisfied ? [] : checkSlotAt(people, ver, slot, path, today, now, delegations) }
    })
    const done = slots.every((s) => s.satisfied || !slotRequired(s.slot, p.answers))
    let status: StageStatus = "feita"
    // Before the hand-back stage, what was left unsigned is skipped, never "current".
    if (!done && i < anchor) status = "pulada"
    // After the current stage nothing is "done", even a stage with no signature required now
    // (e.g. Aprovação when a blocking option left no conditional slot required): it has not been reached.
    else if (currentFound) status = "futura"
    else if (!done) { status = currentFound ? "futura" : "atual"; currentFound = true }
    return { stage, slots, status }
  })
}

/** Where the permit is in its flow: "Etapa n/total". When every stage is done it is the last one. */
export function stageProgress(rail: StageView[]): { n: number; total: number } {
  const total = rail.length
  const i = rail.findIndex((s) => s.status === "atual")
  return { n: i < 0 ? total : i + 1, total }
}

/**
 * Is field work released right now? Only an ativa permit with no stop waiting and the window still
 * open. The one rule behind "Trabalho liberado": the screen never decides it alone.
 */
/** Like `ptw.work_released`: ativa, no stop, and `windowStart <= now <= windowEnd` (closed at both ends). */
export type Release = { released: true } | { released: false; why: "estado" | "parada" | "janela_encerrada" | "antes_da_janela" }
export function workRelease(p: Permit, now: string): Release {
  if (p.state !== "ativa") return { released: false, why: "estado" }
  if (p.holdReason !== null) return { released: false, why: "parada" }
  if (cmpInstant(now, p.windowEnd) > 0) return { released: false, why: "janela_encerrada" }
  if (cmpInstant(now, p.windowStart) < 0) return { released: false, why: "antes_da_janela" }
  return { released: true }
}

/**
 * Tone of the window meter (DESIGN.md · Cor de estado; thresholds are a proposal to validate with the plant):
 * `ok` with more than 60 min left AND more than 15 % of the window; `attention` with 60 min or less, or 15 % or
 * less; `stop` once the window is over (`now` after its end, the same closed end as `workRelease`).
 */
export type WindowTone = "ok" | "attention" | "stop"
export interface WindowLeft {
  tone: WindowTone
  /** Milliseconds from `now` to the end (negative = over). */
  leftMs: number
  /** Whole minutes left, rounded up (0 when over): never "0 min" while seconds remain. */
  minutes: number
  /** Share of the window still ahead, 0..1. */
  fraction: number
}
export const WINDOW_ATTENTION_MIN = 60
export const WINDOW_ATTENTION_FRACTION = 0.15
export function windowLeft(p: Pick<Permit, "windowStart" | "windowEnd">, now: string): WindowLeft | null {
  const start = Date.parse(p.windowStart), end = Date.parse(p.windowEnd), t = Date.parse(now)
  if (!(end > start) || Number.isNaN(t)) return null
  const leftMs = end - t
  const fraction = Math.max(0, Math.min(1, leftMs / (end - start)))
  const minutes = Math.max(0, Math.ceil(leftMs / 60000))
  const tone: WindowTone = leftMs < 0 ? "stop" : leftMs <= WINDOW_ATTENTION_MIN * 60000 || fraction <= WINDOW_ATTENTION_FRACTION ? "attention" : "ok"
  return { tone, leftMs, minutes, fraction }
}

/**
 * The number Enviar gives a draft, like `ptw.next_permit_number`: "PT-<unit code without hyphens>-<year in
 * the unit's zone>-<00001>", one sequence per unit and year.
 */
export function nextPermitNumber(permits: Pick<Permit, "number">[], unitCode: string, now: string, tz: string = DEFAULT_TZ, counterStart = 0): string {
  const year = wallOf(now, tz).slice(0, 4)
  const head = `PT-${unitCode.replace(/-/g, "")}-${year}-`
  // A loop, not Math.max(...): spreading 100 000 numbers as arguments overflows the stack.
  let max = counterStart
  for (const x of permits) if (x.number?.startsWith(head)) max = Math.max(max, Number(x.number.slice(head.length)))
  return `${head}${String(max + 1).padStart(5, "0")}`
}

/** The form a permit shows and is gated by: its frozen copy once sent, the live version (lists copied in) while a draft. */
export function permitFormOf(p: Pick<Permit, "snapshotSha256">, ver: Pick<TemplateVersion, "form">, snapshots: PermitData["formSnapshots"], lists: OptionList[]): FormSpec {
  return formOfPermit(p.snapshotSha256 ? snapshots[p.snapshotSha256] : null, ver, lists)
}

/** Stage id → position in the version (`stage.position`, from 0). */
export const stagePositions = (ver: Pick<TemplateVersion, "stages">): Record<string, number> => Object.fromEntries(ver.stages.map((s, i) => [s.id, i]))

/** `expirada` is not final: the area still has to be handed back (Entrega, then Aceite da área). */
const FINAL: PermitState[] = ["encerrada", "cancelada"]
export const isFinalState = (s: PermitState) => FINAL.includes(s)

export const firstName = (name: string) => name.split(" ")[0]

/** The slot waiting for a signature right now, if any. */
/** `answers` decides conditional signatures ("obrigatória só quando…"); without them only plain required ones count. */
export function pendingSlot(rail: StageView[], answers?: Permit["answers"]): { stage: Stage; view: SlotView } | null {
  const cur = rail.find((s) => s.status === "atual")
  const view = cur?.slots.find((s) => !s.satisfied && slotRequired(s.slot, answers))
  return cur && view ? { stage: cur.stage, view } : null
}

/**
 * "Paulo · Entrega": who acts next and on which stage. `resume` are the people who may resume a
 * stopped permit (see stopResume.ts); without them the label says nobody is eligible.
 */
export function nextLabel(p: Permit, rail: StageView[], people: Person[], resume: RoleCheck[] = []): string {
  if (isFinalState(p.state)) return "—"
  const author = people.find((x) => x.id === p.authorId)
  if (p.state === "rascunho") return `${firstName(author?.name ?? "Autor")} · Enviar`
  if (p.state === "devolvida") return `${firstName(author?.name ?? "Autor")} · Reenviar`
  if (p.holdReason !== null || (p.state === "suspensa" && p.resumedReason === null)) {
    const who = resume.find((e) => e.ok)?.person
    return `${who ? firstName(who.name) : "Sem elegível"} · Retomada`
  }
  const next = pendingSlot(rail, p.answers)
  if (!next) return "—"
  const who = next.view.eligible.find((e) => e.ok)?.person ?? next.view.eligible[0]?.person
  return `${who ? firstName(who.name) : "Sem elegível"} · ${next.stage.name}`
}

/** Does this person have something to do on the permit? */
export function waitsFor(p: Permit, rail: StageView[], personId: string, resume: RoleCheck[] = []): boolean {
  if (p.state === "rascunho" || p.state === "devolvida") return p.authorId === personId
  if (isFinalState(p.state)) return false
  if (p.holdReason !== null || (p.state === "suspensa" && p.resumedReason === null)) return resume.some((e) => e.ok && e.person.id === personId)
  const next = pendingSlot(rail, p.answers)
  return !!next && next.view.eligible.some((e) => e.ok && e.person.id === personId) && !next.view.signed.some((s) => s.personId === personId)
}

/** Sort rank for the Quadro: what needs attention first. */
const RANK: Record<PermitState, number> = {
  suspensa: 0, devolvida: 1, entregue: 2, em_analise: 3, emitida: 4, ativa: 5, rascunho: 6, expirada: 7, cancelada: 8, encerrada: 9,
}
export const stateRank = (s: PermitState) => RANK[s]

/**
 * `ptw.expire_due`: emitida, ativa or suspensa whose window ended (`windowEnd <= now`) become expirada,
 * with the note "Janela encerrada". The server runs it every minute; the simulation on every tick.
 */
export const EXPIRE_NOTE = "Janela encerrada"
export const dueToExpire = (permits: Permit[], now: string): Permit[] =>
  permits.filter((p) => (p.state === "emitida" || p.state === "ativa" || p.state === "suspensa") && cmpInstant(p.windowEnd, now) <= 0)

/**
 * SHA-256 (hex) of a revision's content, like `ptw.permit_content_sha256`: frozen form, fields, assets,
 * team and answers, in canonical JSON. The database's own value depends on its session time zone
 * (the window as text): here it is the simulation's.
 */
export function permitContentSha256(p: Permit): string {
  const team = Object.entries(p.team).flatMap(([roleId, ids]) => ids.map((personId) => [roleId, personId])).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]))
  return sha256Hex(canonicalJson({
    form: p.snapshotSha256, scope: p.scope, location: p.locationId, window: `[${p.windowStart},${p.windowEnd}]`, version: p.versionId,
    assets: [...p.assetIds].sort(), team, answers: p.answers as unknown as Json,
  }))
}

/** PT state → status colour (DESIGN.md · Cor de estado). */
export const PERMIT_STATE_TONE: Record<PermitState, StatusTone> = {
  rascunho: "neutral", em_analise: "pending", devolvida: "attention", emitida: "pending", ativa: "ok",
  suspensa: "stop", entregue: "pending", encerrada: "neutral", cancelada: "neutral", expirada: "attention",
}

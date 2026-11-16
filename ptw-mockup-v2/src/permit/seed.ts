/**
 * The sample permits, built by replaying their history through the store's own reducer
 * (`permitReducer`): every answer, file, signature, return, stop and expiry passes the same rules a
 * user would meet, and the audit events are the ones the database would write. A change that breaks
 * a rule makes this module throw, so the sample can never drift from the rules.
 */
import { ID, seedUuid } from "@/registry/seedIds"
import { itemId, seed as registry } from "@/registry/seed"
import { sha256Hex, type AuditDraft } from "@/core/audit"
import { instant } from "@/core/time"
import type { ItemAnswer } from "@/core/form"
import type { PermitAction } from "./reducer"
import { replayPermits, type ReplayBase, type ReplayStep } from "./replay"
import type { PermitData } from "./types"

/** The simulated clock starts here. */
export const SIM_START = instant("2026-11-06T14:00:00")
/** People who only consult (no cargo). Kept apart from the registry's Person. */
export const SIM_AUDITORS = [ID.person.luis]

export const PERMIT_ID = {
  draft: seedUuid(0x0101, 1), p0004: seedUuid(0x0101, 4), p0005: seedUuid(0x0101, 5), p0006: seedUuid(0x0101, 6), p0007: seedUuid(0x0101, 7),
  p0008: seedUuid(0x0101, 8), p0009: seedUuid(0x0101, 9), p0010: seedUuid(0x0101, 10), p0011: seedUuid(0x0101, 11), p0012: seedUuid(0x0101, 12), p0013: seedUuid(0x0101, 13),
} as const

const { marina: MARINA, rafael: RAFAEL, paulo: PAULO, carlos: CARLOS, beatriz: BEA, joana: JOANA, diego: DIEGO } = ID.person
const UNIT = registry.units[0]
const at = (day: string, time: string) => instant(`${day}T${time}`, UNIT.timezone)

const painel = { templateId: ID.template.painel, versionId: ID.version.painel2 }
const vapor = { templateId: ID.template.vapor, versionId: ID.version.vapor1 }
const crewPainel = { [ID.role.lider]: [PAULO], [ID.role.exec]: [DIEGO] }
const crewVapor = { [ID.role.lider]: [BEA], [ID.role.exec]: [CARLOS] }
const slotP = (k: Parameters<typeof ID.slot>[1]) => ID.slot("painel2", k)
const slotV = (k: Parameters<typeof ID.slot>[1]) => ID.slot("vapor1", k)

type Base = ReplayBase

/** A placeholder picture for the sample data (no real photos ship with the mockup). */
const PHOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d9d9d9"/><text x="320" y="250" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#555">Foto de exemplo</text></svg>'
const PHOTO_BYTES = new TextEncoder().encode(PHOTO_SVG)
const PHOTO = { sha256: sha256Hex(PHOTO_BYTES), size: PHOTO_BYTES.length, mime: "image/svg+xml", url: "data:image/svg+xml;utf8," + encodeURIComponent(PHOTO_SVG) }

/* ---------- the history, in time order ---------- */

type Step = ReplayStep

const steps: Step[] = []
let attachN = 0
const create = (t: string, who: string, b: Base) => steps.push({ t, who, create: b })
const act = (t: string, who: string | null, a: PermitAction) => steps.push({ t, who, act: a })
const sign = (permitId: string, slotId: string, who: string, t: string) => act(t, who, { kind: "sign", permitId, slotId, personId: who })
const answer = (permitId: string, who: string, t: string, item: string, value: ItemAnswer) => act(t, who, { kind: "answer", permitId, personId: who, itemId: item, value })
const texts = (permitId: string, who: string, t: string, o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) answer(permitId, who, t, itemId(k), { t: "texto", v }) }
/** A photo captured on the spot, then answered on its item. */
function photo(permitId: string, who: string, t: string, item: string) {
  const id = seedUuid(0x0103, ++attachN)
  act(t, who, {
    kind: "attach", permitId, personId: who,
    attachment: { id, permitId, itemId: item, kind: "foto", sha256: PHOTO.sha256, fileName: "foto.jpg", previewSha256: null, width: 640, height: 480, durationMs: null, capturedBy: who, capturedAt: t },
    blob: { ...PHOTO, storedAt: t },
  })
  answer(permitId, who, t, item, { t: "anexo", files: [id] })
}
/** Marina's (or Joana's) part of the Painel's Emissão: the checks, the voltage, the photo. */
function emission(permitId: string, who: string, t: string) {
  answer(permitId, who, t, "fi_emi_conf", { t: "verificacao", lines: { fl_emi_etiq: { a: "confirmo" }, fl_emi_tensao: { a: "confirmo" } } })
  answer(permitId, who, t, "fi_emi_tensao_v", { t: "numero", v: 0 })
  photo(permitId, who, t, "fi_emi_foto")
}
function fieldStart(permitId: string, who: string, t: string) {
  answer(permitId, who, t, "fi_campo_check", { t: "verificacao", lines: { fl_campo_dds: { a: "sim" }, fl_campo_epi: { a: "sim" }, fl_campo_isol: { a: "sim" } } })
  photo(permitId, who, t, "fi_campo_foto")
}

const P = PERMIT_ID
const D = (d: string) => (t: string) => at(d, t)
const d1029 = D("2026-10-29"), d1031 = D("2026-10-31"), d1030 = D("2026-10-30"), d1101 = D("2026-11-01"), d1102 = D("2026-11-02"), d1103 = D("2026-11-03"), d1104 = D("2026-11-04"), d1105 = D("2026-11-05"), d1106 = D("2026-11-06")

// 0005 cancelada: sent, then withdrawn before anyone acted.
create(d1030("08:00:00"), RAFAEL, { id: P.p0005, ...painel, authorId: RAFAEL, locationId: ID.loc(3), assetIds: [ID.asset(1)], team: crewPainel, scope: "Inspeção termográfica do CCM", start: d1103("08:00:00"), end: d1103("17:00:00") })
sign(P.p0005, slotP("sol"), RAFAEL, d1030("09:00:00"))
steps.push({ t: d1031("08:00:00"), who: RAFAEL, cancel: { permitId: P.p0005, note: "Retirada pelo solicitante: serviço adiado" } })

// 0006 encerrada: the whole cycle.
create(d1101("08:00:00"), RAFAEL, { id: P.p0006, ...painel, authorId: RAFAEL, locationId: ID.loc(4), assetIds: [ID.asset(2)], team: crewPainel, scope: "Reaperto de bornes da gaveta C03", start: d1102("08:00:00"), end: d1102("17:00:00") })
sign(P.p0006, slotP("sol"), RAFAEL, d1101("15:00:00"))
sign(P.p0006, slotP("iso"), RAFAEL, d1102("07:30:00"))
sign(P.p0006, slotP("ver"), PAULO, d1102("07:50:00"))
emission(P.p0006, MARINA, d1102("07:55:00"))
sign(P.p0006, slotP("emi"), MARINA, d1102("08:00:00"))
fieldStart(P.p0006, PAULO, d1102("08:15:00"))
sign(P.p0006, slotP("campo"), PAULO, d1102("08:20:00"))
sign(P.p0006, slotP("ent"), PAULO, d1102("16:40:00"))
sign(P.p0006, slotP("area"), MARINA, d1102("17:00:00"))

// 0004 expirada: issued, never accepted; the server expired it at the end of the window.
create(d1029("08:00:00"), RAFAEL, { id: P.p0004, ...vapor, authorId: RAFAEL, locationId: ID.loc(16), assetIds: [ID.asset(15)], team: crewVapor, scope: "Soldar flange da válvula XV-410", start: d1104("08:00:00"), end: d1104("16:00:00") })
sign(P.p0004, slotV("sol"), RAFAEL, d1029("09:00:00"))
sign(P.p0004, slotV("iso"), RAFAEL, d1103("09:30:00"))
sign(P.p0004, slotV("emi"), JOANA, d1103("10:00:00"))
act(d1104("16:00:00"), null, { kind: "expire", permitId: P.p0004 })

// 0007 entregue: the Aceite da área is missing.
create(d1104("08:00:00"), RAFAEL, { id: P.p0007, ...vapor, authorId: RAFAEL, locationId: ID.loc(16), assetIds: [ID.asset(14)], team: crewVapor, scope: "Soldar suporte da tubulação do trecho A", start: d1105("08:00:00"), end: d1105("16:00:00") })
texts(P.p0007, RAFAEL, d1104("14:50:00"), { "Método de soldagem": "TIG", "Controle de faíscas": "Manta e vigia" })
sign(P.p0007, slotV("sol"), RAFAEL, d1104("15:00:00"))
sign(P.p0007, slotV("iso"), RAFAEL, d1105("07:30:00"))
sign(P.p0007, slotV("emi"), JOANA, d1105("08:00:00"))
sign(P.p0007, slotV("campo"), BEA, d1105("08:20:00"))
sign(P.p0007, slotV("ent"), BEA, d1105("15:50:00"))

// 0011 devolvida: Marina returned it before issuing (the circuit limit was incomplete).
create(d1105("08:00:00"), RAFAEL, { id: P.p0011, ...painel, authorId: RAFAEL, locationId: ID.loc(3), assetIds: [ID.asset(13)], team: crewPainel, scope: "Ampliar o barramento do quadro de iluminação", start: at("2026-11-08", "08:00:00"), end: at("2026-11-08", "17:00:00") })
texts(P.p0011, RAFAEL, d1105("14:50:00"), { "Ordem de serviço": "OS-4405" })
sign(P.p0011, slotP("sol"), RAFAEL, d1105("15:00:00"))
sign(P.p0011, slotP("iso"), RAFAEL, d1105("15:30:00"))
sign(P.p0011, slotP("ver"), PAULO, d1105("15:45:00"))
act(d1105("16:00:00"), MARINA, { kind: "refuse", permitId: P.p0011, personId: MARINA, reason: "Limite do circuito incompleto" })

// 0010 ativa, revisão 2: returned for the window, resent (the r1 signatures are voided), signed again.
create(d1105("08:00:00"), RAFAEL, { id: P.p0010, ...painel, authorId: RAFAEL, locationId: ID.loc(4), assetIds: [ID.asset(2)], team: crewPainel, scope: "Trocar a partida do motor M-201", start: d1106("08:00:00"), end: d1106("17:00:00") })
texts(P.p0010, RAFAEL, d1105("13:50:00"), { "Ordem de serviço": "OS-4398", "Limite do circuito": "Gaveta C03" })
sign(P.p0010, slotP("sol"), RAFAEL, d1105("14:00:00"))
sign(P.p0010, slotP("iso"), RAFAEL, d1106("07:30:00"))
sign(P.p0010, slotP("ver"), PAULO, d1106("07:45:00"))
act(d1106("07:55:00"), MARINA, { kind: "refuse", permitId: P.p0010, personId: MARINA, reason: "A troca não cabe até as 16:00: estenda a janela até as 17:00" })
texts(P.p0010, RAFAEL, d1106("10:50:00"), { "Limite do circuito": "Gaveta C03 do CCM-L2-01" })
sign(P.p0010, slotP("sol"), RAFAEL, d1106("10:55:00"))
sign(P.p0010, slotP("iso"), RAFAEL, d1106("11:10:00"))
sign(P.p0010, slotP("ver"), PAULO, d1106("11:20:00"))
emission(P.p0010, MARINA, d1106("11:25:00"))
sign(P.p0010, slotP("emi"), MARINA, d1106("11:30:00"))
fieldStart(P.p0010, PAULO, d1106("11:40:00"))
sign(P.p0010, slotP("campo"), PAULO, d1106("11:45:00"))
// The swap took longer: Marina (who issues it) extended the window to 19:00, within the model's 12 hours.
act(d1106("13:30:00"), MARINA, { kind: "extend", permitId: P.p0010, personId: MARINA, newEnd: d1106("19:00:00"), reason: "Troca da partida atrasou: falta testar o motor" })

// 0008 emitida: waits for the window (07/11 07:00) to be accepted in the field.
create(d1105("08:00:00"), RAFAEL, { id: P.p0008, ...painel, authorId: RAFAEL, locationId: ID.loc(13), assetIds: [ID.asset(9)], team: crewPainel, scope: "Substituir o disjuntor da partida da bomba P-202", start: at("2026-11-07", "07:00:00"), end: at("2026-11-07", "17:00:00") })
texts(P.p0008, RAFAEL, d1105("12:50:00"), { "Ordem de serviço": "OS-4430", "Limite do circuito": "Gaveta K01 do CCM-L2-02" })
sign(P.p0008, slotP("sol"), RAFAEL, d1105("13:00:00"))
sign(P.p0008, slotP("iso"), RAFAEL, d1106("09:00:00"))
sign(P.p0008, slotP("ver"), PAULO, d1106("09:20:00"))
emission(P.p0008, MARINA, d1106("09:55:00"))
sign(P.p0008, slotP("emi"), MARINA, d1106("10:00:00"))

// 0009 suspensa: Beatriz stopped the work (leak); it waits for a Retomada.
create(d1105("08:00:00"), RAFAEL, { id: P.p0009, ...vapor, authorId: RAFAEL, locationId: ID.loc(9), assetIds: [ID.asset(5)], team: crewVapor, scope: "Soldar junta do trecho B", start: d1106("08:00:00"), end: d1106("16:00:00") })
sign(P.p0009, slotV("sol"), RAFAEL, d1105("13:30:00"))
sign(P.p0009, slotV("iso"), RAFAEL, d1106("07:30:00"))
sign(P.p0009, slotV("emi"), JOANA, d1106("07:50:00"))
sign(P.p0009, slotV("campo"), BEA, d1106("08:10:00"))
act(d1106("13:15:00"), BEA, { kind: "stop", permitId: P.p0009, personId: BEA, reason: "Vazamento ou falha" })

// 0012 and 0013 em análise: prepared, waiting for the Emissão.
create(d1106("08:00:00"), RAFAEL, { id: P.p0012, ...painel, authorId: RAFAEL, locationId: ID.loc(14), assetIds: [ID.asset(10)], team: crewPainel, scope: "Limpeza interna da gaveta do exaustor", start: at("2026-11-07", "07:00:00"), end: at("2026-11-07", "17:00:00") })
texts(P.p0012, RAFAEL, d1106("08:20:00"), { "Ordem de serviço": "OS-4440", "Limite do circuito": "Gaveta K02 do CCM-L2-02" })
sign(P.p0012, slotP("sol"), RAFAEL, d1106("08:30:00"))
sign(P.p0012, slotP("iso"), RAFAEL, d1106("09:00:00"))
sign(P.p0012, slotP("ver"), PAULO, d1106("09:30:00"))
create(d1106("08:00:00"), RAFAEL, { id: P.p0013, ...painel, authorId: RAFAEL, locationId: ID.loc(15), assetIds: [ID.asset(12)], team: crewPainel, scope: "Medir isolação do alimentador do quadro do envase", start: d1106("14:00:00"), end: d1106("17:00:00") })
sign(P.p0013, slotP("sol"), RAFAEL, d1106("12:00:00"))
sign(P.p0013, slotP("iso"), RAFAEL, d1106("12:30:00"))
sign(P.p0013, slotP("ver"), PAULO, d1106("13:00:00"))

// The draft: Rafael tried to send it, refused (the CCM is held by the PT-…0010); the refusal stays.
create(d1106("08:00:00"), RAFAEL, { id: P.draft, ...painel, authorId: RAFAEL, locationId: ID.loc(3), assetIds: [ID.asset(1)], team: crewPainel, scope: "Reaperto do barramento principal do CCM", start: at("2026-11-07", "08:00:00"), end: at("2026-11-07", "17:00:00") })
texts(P.draft, RAFAEL, d1106("13:35:00"), { "Ordem de serviço": "OS-4421" })
sign(P.draft, slotP("sol"), RAFAEL, d1106("13:40:12"))

/* ---------- replay ---------- */
// The unit's counter for 2026 stood at 3 when this sample starts (earlier permits are not shown), so
// the sample's numbers run PT-UN01-2026-00004 … 00013, in the order they were first sent.

const DENIED_ON_PURPOSE = new Set([`${P.draft}@${d1106("13:40:12")}`])

let sigN = 0
const replay = () => replayPermits(steps, { registry, newId: () => seedUuid(0x0102, ++sigN), counterStart: 3, deniedOnPurpose: DENIED_ON_PURPOSE })

const built = replay()

export const permitSeed: PermitData = built.data
/** The sample permits' history, ready to enter the audit chain (D appends it after the registry's). */
export const permitSeedEvents: AuditDraft[] = built.events

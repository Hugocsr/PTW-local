/**
 * One prototype permit per model and per "track" (the state it ends in), told through the store's own
 * acts (`replayPermits`): every signature, answer, stop and expiry passes the real rules. The load
 * generator then copies these (new ids, people, equipment, place and times shifted together), so each
 * of the 100 000 permits has the answers and signatures a real one in that state would have, without
 * replaying 100 000 histories.
 */
import type { ItemAnswer } from "@/core/form"
import { instant } from "@/core/time"
import type { PermitAction } from "@/permit/reducer"
import { replayPermits, type ReplayStep } from "@/permit/replay"
import type { Permit, PermitData, SignatureRec } from "@/permit/types"
import type { RegistryState } from "@/registry/types"
import { C, MODELS, type ModelKey } from "../celulose/ids"
import { listItemId } from "../celulose/lists"
import { EPI_BASICO } from "../celulose/modelos"
import { G } from "./ids"

export const TRACKS = ["rascunho", "analise", "analise_emi", "devolvida", "emitida", "ativa", "suspensa", "retomada", "entregue", "expirada", "encerrada", "cancelada"] as const
export type Track = (typeof TRACKS)[number]

/** The prototype cast (named people of the pulp mill); the generator maps each to someone of the place. */
export type CastKey = "A" | "L" | "S" | "E" | "X" | "F" | "V"
const P = C.person
export const PROTO_CAST = (m: ModelKey): Record<CastKey, string> =>
  ({ A: m === "eletrica" ? P.juliana : P.lucas, L: P.patricia, S: P.eduardo, E: P.aline, X: P.sandro, F: P.ricardo, V: P.jose })

/** Prototype window: D = 04/11/2026, 07:00 → 15:00 (PT geral: 24 h). Acts before it happen on D-1. */
const at = (day: number, time: string) => instant(`2026-11-${String(day).padStart(2, "0")}T${time}:00`)
export const PROTO_START = at(4, "07:00")
export const windowHours = (m: ModelKey) => (m === "geral" ? 24 : 8)

/** Celulose assets with no "parte de" relation: one per track, so the prototypes never collide. */
const FREE_ASSETS = [3, 7, 8, 9, 10, 11, 12, 13, 16, 25, 26, 27, 30, 31, 32, 33, 34, 35, 36]

export interface Prototype { permit: Permit; signatures: SignatureRec[] }
export type Prototypes = Record<ModelKey, Record<Track, Prototype>>

const text = (v: string): ItemAnswer => ({ t: "texto", v })
const lines = (ids: string[], a: string): ItemAnswer => ({ t: "verificacao", lines: Object.fromEntries(ids.map((id) => [id, { a }])) })

export function buildPrototypes(registry: RegistryState): { protos: Prototypes; formSnapshots: PermitData["formSnapshots"] } {
  const protos = {} as Prototypes
  let formSnapshots: PermitData["formSnapshots"] = {}
  let sigN = 0, permitN = 0
  for (const m of MODELS) {
    const cast = PROTO_CAST(m)
    const { A, L, S, E, X, F, V } = cast
    const steps: ReplayStep[] = []
    const ids = {} as Record<Track, string>
    const slot = (k: Parameters<typeof C.slot>[1]) => C.slot(m, k)
    TRACKS.forEach((track, i) => {
      const pid = G.protoPermit(++permitN)
      ids[track] = pid
      const act = (t: string, who: string | null, a: PermitAction) => steps.push({ t, who, act: a })
      const answer = (who: string, t: string, itemId: string, value: ItemAnswer) => act(t, who, { kind: "answer", permitId: pid, personId: who, itemId, value })
      const sign = (k: Parameters<typeof C.slot>[1], who: string, t: string) => act(t, who, { kind: "sign", permitId: pid, slotId: slot(k), personId: who })
      const end = instant(new Date(Date.parse(PROTO_START) + windowHours(m) * 3600_000).toISOString())
      const team: Permit["team"] = { [C.role.lider]: [X], ...(m === "confinado" ? { [C.role.vigia]: [V] } : {}) }
      steps.push({ t: at(3, "13:00"), who: A, create: { id: pid, templateId: C.template[m], versionId: C.version[m], authorId: A, locationId: C.loc(13), assetIds: [C.asset(FREE_ASSETS[i])], team, scope: "Protótipo", start: PROTO_START, end } })
      // Solicitação
      const t0 = at(3, "13:20")
      answer(A, t0, "fi_os", { t: "documento", code: "OS-100000", files: [] })
      answer(A, t0, "fi_desc", text("Serviço conforme a ordem de serviço."))
      if (track === "rascunho") return
      answer(A, t0, "fi_empresa", text("Celulose Demo · manutenção"))
      const perigos: Record<ModelKey, string[]> = {
        geral: ["Partes móveis"], quente: ["Incêndio ou explosão", "Partes móveis"], confinado: ["Deficiência de oxigênio", "Gases tóxicos (H₂S, ClO₂, CO)"],
        altura: ["Queda de altura"], eletrica: ["Choque elétrico", "Arco elétrico"],
      }
      answer(A, t0, "fi_perigos", { t: "marcacao", ids: perigos[m].map((l) => listItemId("perigos", l)) })
      const extra: Record<ModelKey, [string, ItemAnswer]> = {
        geral: ["fi_trab", { t: "marcacao", ids: [listItemId("trabalho", "Içamento de carga")] }],
        quente: ["fi_q_tipo", { t: "marcacao", ids: ["fo_q_solda", "fo_q_esmeril"] }],
        confinado: ["fi_ec_espaco", text("Boca de visita principal")],
        altura: ["fi_alt_h", { t: "numero", v: 12 }],
        eletrica: ["fi_el_tensao", { t: "marcacao", ids: ["fo_el_bt"] }],
      }
      answer(A, t0, extra[m][0], extra[m][1])
      sign("sol", A, t0)
      if (track === "analise") return
      if (track === "cancelada") { steps.push({ t: at(3, "18:00"), who: A, cancel: { permitId: pid, note: "Retirada pelo solicitante: serviço reprogramado" } }); return }
      if (track === "devolvida") { const by = m === "altura" ? S : L; act(at(3, "15:00"), by, { kind: "refuse", permitId: pid, personId: by, reason: "Detalhe melhor o isolamento antes de liberar." }); return }
      // Preparation stages
      const t1 = at(3, "16:00"), t2 = at(3, "16:30")
      const OK = (ids: string[]) => lines(ids, "sim")
      if (m === "geral") {
        answer(L, t1, "fi_lib", OK(["fl_lib_bloq", "fl_lib_dren", "fl_lib_sinal", "fl_lib_ext"]))
        answer(L, t1, "fi_lib_cad", text("Cadeado no ponto de bloqueio"))
        sign("lib", L, t1)
      } else if (m === "quente") {
        answer(S, t1, "fi_q_prec", OK(["fl_q_comb", "fl_q_ralo", "fl_q_linha", "fl_q_ext"]))
        answer(S, t1, "fi_q_lie", { t: "numero", v: 0 })
        answer(S, t1, "fi_q_obs", { t: "pessoa", ids: [V] })
        sign("lib", L, t1)
        sign("prep", S, t2)
      } else if (m === "confinado") {
        answer(L, t1, "fi_ec_isol", OK(["fl_ec_raq", "fl_ec_agit", "fl_ec_lav", "fl_ec_vent"]))
        sign("lib", L, t1)
        answer(S, t2, "fi_ec_det", { t: "documento", code: "DG-0457", files: [], validUntil: "2027-12-31" })
        answer(S, t2, "fi_ec_gas", { t: "grupo", rows: [["Boca de visita", "16:20", 20.9, 0, 0, 2], ["Fundo", "16:25", 20.7, 0, 1, 3]].map(([p, h, o2, lie, h2s, co], k) => ({ id: `med${k + 1}`, answers: { fi_ec_ponto: text(p as string), fi_ec_hora: { t: "horario", v: h as string }, fi_ec_o2: { t: "numero", v: o2 as number }, fi_ec_lie: { t: "numero", v: lie as number }, fi_ec_h2s: { t: "numero", v: h2s as number }, fi_ec_co: { t: "numero", v: co as number } } })) })
        answer(S, t2, "fi_ec_vigia", { t: "pessoa", ids: [V] })
        answer(S, t2, "fi_ec_resg", lines(["fl_ec_tripe", "fl_ec_radio"], "sim"))
        sign("prep", S, t2)
      } else if (m === "altura") {
        answer(S, t1, "fi_alt_chk", OK(["fl_alt_anc", "fl_alt_cinto", "fl_alt_abaixo", "fl_alt_andaime"]))
        answer(S, t1, "fi_alt_vento", { t: "numero", v: 12 })
        answer(S, t1, "fi_alt_resg", { t: "documento", code: "PR-0112", files: [] })
        sign("lib", S, t1)
      } else {
        answer(A, t1, "fi_el_iso", { t: "isolamento", rows: [{ id: "iso1", point: "Gaveta extraída e travada", energy: "eletrica", method: "Extração e cadeado", lock: "C-1000", zero: "sim", by: A }] })
        answer(A, t1, "fi_el_chk", OK(["fl_el_secc", "fl_el_aus", "fl_el_terra"]))
        answer(A, t1, "fi_el_v", { t: "numero", v: 0 })
        sign("lib", A, t1)
        sign("prep", L, t2)
      }
      if (track === "analise_emi") return
      sign("emi", E, at(3, "17:00"))
      if (track === "emitida") return
      // Field
      const tc = at(4, "07:30")
      answer(X, tc, "fi_campo", OK(["fl_dds", "fl_trein", "fl_epi"]))
      answer(X, tc, "fi_epi", { t: "marcacao", ids: EPI_BASICO })
      sign("campo", X, tc)
      if (track === "ativa") return
      if (track === "expirada") { act(end, null, { kind: "expire", permitId: pid }); return }
      if (track === "suspensa" || track === "retomada") {
        act(at(4, "09:00"), X, { kind: "stop", permitId: pid, personId: X, reason: "Condição insegura na área: trabalho parado até nova avaliação" })
        if (track === "retomada") act(at(4, "09:30"), E, { kind: "resume", permitId: pid, personId: E, reason: "Condição corrigida e conferida no local" })
        return
      }
      const te = at(4, "14:30")
      answer(X, te, "fi_ent", lines(["fl_ent_pessoas", "fl_ent_prot", "fl_ent_limpa"], "confirmo"))
      sign("ent", X, te)
      if (track === "entregue") return
      const ta = at(4, "14:50")
      answer(F, ta, "fi_area", lines(["fl_area_oper"], "sim"))
      sign("area", F, ta)
    })
    const out = replayPermits(steps, { registry, newId: () => G.protoSignature(++sigN), counterStart: 0, label: `Carga, protótipo ${m}` })
    formSnapshots = { ...formSnapshots, ...out.data.formSnapshots }
    protos[m] = Object.fromEntries(TRACKS.map((t) => [t, {
      permit: out.data.permits.find((p) => p.id === ids[t])!,
      signatures: out.data.signatures.filter((g) => g.permitId === ids[t]),
    }])) as Record<Track, Prototype>
  }
  return { protos, formSnapshots }
}

/**
 * The pulp mill's permits: a week of work told through the store's own acts (replayed by
 * `replayPermits`), so the equipment lock, eligibility, windows, extensions and the audit chain all
 * hold. The interlock-disabling permits (the client's own form) are the centre of the story.
 *
 * "Now" is Tuesday 10/11/2026, 10:00. Key people: Ricardo (supervisor de turno), Fernanda (gerente da
 * área), Lucas (técnico de manutenção mecânica).
 */
import type { ItemAnswer, IsolationRow } from "@/core/form"
import { instant } from "@/core/time"
import type { PermitAction } from "@/permit/reducer"
import { replayPermits, type ReplayBase, type ReplayStep } from "@/permit/replay"
import type { RegistryState } from "@/registry/types"
import { C, type ModelKey } from "./ids"
import type { InterlockModel } from "./intertravamento"
import { listItemId } from "./lists"
import { EPI_BASICO } from "./modelos"

const TZ = "America/Sao_Paulo"
/** The simulated clock starts here. */
export const CELULOSE_START = instant("2026-11-10T10:00:00", TZ)
const at = (day: number, time: string) => instant(`2026-11-${String(day).padStart(2, "0")}T${time}:00`, TZ)

/** Permits of the story (numbers follow the order they were first sent). */
export const CEL = {
  i1: C.permit(1), i2: C.permit(2), i3: C.permit(3), i4: C.permit(4), i5: C.permit(5), i6: C.permit(6), i7: C.permit(7),
  quente: C.permit(11), confinado: C.permit(12), altura: C.permit(13), eletrica: C.permit(14), devolvida: C.permit(15),
  expirada: C.permit(16), bloqueada: C.permit(17), pet: C.permit(18), alturaFim: C.permit(19), cancelada: C.permit(20), subestacao: C.permit(21),
  /** Maintenance PT on the TQ-LP, alongside the open interlock PT i2 there (that model does not hold equipment). */
  junto: C.permit(22),
} as const

const { ricardo, aline, fernanda, lucas, juliana, andre, patricia, gustavo, marcos, camila, thiago, eduardo, jose, sandro } = C.person
const R = C.role
const asset = C.asset, loc = C.loc

export function celulosePermits(registry: RegistryState, it: InterlockModel) {
  const steps: ReplayStep[] = []
  const denied = new Set<string>()
  const create = (t: string, who: string, b: ReplayBase) => steps.push({ t, who, create: b })
  const act = (t: string, who: string | null, a: PermitAction) => steps.push({ t, who, act: a })
  const sign = (permitId: string, slotId: string, who: string, t: string) => act(t, who, { kind: "sign", permitId, slotId, personId: who })
  const answer = (permitId: string, who: string, t: string, itemId: string, value: ItemAnswer) => act(t, who, { kind: "answer", permitId, personId: who, itemId, value })
  const text = (v: string): ItemAnswer => ({ t: "texto", v })
  const lines = (ids: string[], a: string): ItemAnswer => ({ t: "verificacao", lines: Object.fromEntries(ids.map((id) => [id, { a }])) })
  const model = (m: ModelKey) => ({ templateId: C.template[m], versionId: C.version[m] })
  const slot = (m: ModelKey, k: Parameters<typeof C.slot>[1]) => C.slot(m, k)

  /* ---------- the plant's models: one helper per stage form ---------- */
  const EXTRA: Record<ModelKey, (pid: string, who: string, t: string, x: string) => void> = {
    geral: (pid, who, t) => answer(pid, who, t, "fi_trab", { t: "marcacao", ids: [listItemId("trabalho", "Içamento de carga")] }),
    quente: (pid, who, t) => answer(pid, who, t, "fi_q_tipo", { t: "marcacao", ids: ["fo_q_solda", "fo_q_esmeril"] }),
    confinado: (pid, who, t, x) => answer(pid, who, t, "fi_ec_espaco", text(x)),
    altura: (pid, who, t, x) => answer(pid, who, t, "fi_alt_h", { t: "numero", v: Number(x) }),
    eletrica: (pid, who, t, x) => answer(pid, who, t, "fi_el_tensao", { t: "marcacao", ids: [x] }),
  }
  function request(m: ModelKey, pid: string, who: string, t: string, o: { os: string; desc: string; empresa: string; perigos: string[]; extra?: string; sendAt?: string }) {
    answer(pid, who, t, "fi_os", { t: "documento", code: o.os, files: [] })
    answer(pid, who, t, "fi_desc", text(o.desc))
    answer(pid, who, t, "fi_empresa", text(o.empresa))
    answer(pid, who, t, "fi_perigos", { t: "marcacao", ids: o.perigos.map((l) => listItemId("perigos", l)) })
    EXTRA[m](pid, who, t, o.extra ?? "")
    sign(pid, slot(m, "sol"), who, o.sendAt ?? t)
  }
  const OK3 = (ids: string[]) => lines(ids, "sim")
  function field(m: ModelKey, pid: string, who: string, t: string) {
    answer(pid, who, t, "fi_campo", OK3(["fl_dds", "fl_trein", "fl_epi"]))
    answer(pid, who, t, "fi_epi", { t: "marcacao", ids: m === "quente" ? [...EPI_BASICO, listItemId("epi", "Avental de raspa"), listItemId("epi", "Protetor facial")] : m === "altura" ? [...EPI_BASICO, listItemId("epi", "Cinto paraquedista")] : EPI_BASICO })
    sign(pid, slot(m, "campo"), who, t)
  }
  function handBack(m: ModelKey, pid: string, who: string, t: string, obs?: string) {
    answer(pid, who, t, "fi_ent", lines(["fl_ent_pessoas", "fl_ent_prot", "fl_ent_limpa"], "confirmo"))
    if (obs) answer(pid, who, t, "fi_ent_obs", text(obs))
    sign(pid, slot(m, "ent"), who, t)
  }
  function close(m: ModelKey, pid: string, who: string, t: string) {
    answer(pid, who, t, "fi_area", lines(["fl_area_oper"], "sim"))
    sign(pid, slot(m, "area"), who, t)
  }
  type Reading = [ponto: string, hora: string, o2: number, lie: number, h2s: number, co: number]
  const readings = (rows: Reading[]): ItemAnswer => ({
    t: "grupo",
    rows: rows.map(([p, h, o2, lie, h2s, co], i) => ({ id: `med${i + 1}`, answers: { fi_ec_ponto: text(p), fi_ec_hora: { t: "horario", v: h }, fi_ec_o2: { t: "numero", v: o2 }, fi_ec_lie: { t: "numero", v: lie }, fi_ec_h2s: { t: "numero", v: h2s }, fi_ec_co: { t: "numero", v: co } } })),
  })
  function isolate(pid: string, who: string, t: string, rows: Omit<IsolationRow, "zero" | "by">[]) {
    answer(pid, who, t, "fi_el_iso", { t: "isolamento", rows: rows.map((r) => ({ ...r, zero: "sim", by: who })) })
    answer(pid, who, t, "fi_el_chk", OK3(["fl_el_secc", "fl_el_aus", "fl_el_terra"]))
    answer(pid, who, t, "fi_el_v", { t: "numero", v: 0 })
    sign(pid, slot("eletrica", "lib"), who, t)
  }

  /* ---------- the interlock model (imported) ---------- */
  type Classe = 1 | 2 | 3 | 4 | 5
  function interlockRequest(pid: string, who: string, t: string, o: { classe: Classe; tag: string; funcao: string; motivo: string; medidas: string; emOperacao: boolean; eletrica: boolean; sendAt?: string }) {
    answer(pid, who, t, it.item.tipo, { t: "marcacao", ids: [it.option("tipo", "Intertravamento lógico")] })
    answer(pid, who, t, it.item.classe, { t: "marcacao", ids: [it.option("classe", `Classe ${o.classe}`)] })
    answer(pid, who, t, it.item.tag, { t: "marcacao", ids: [it.interlock(o.tag)] })
    answer(pid, who, t, it.item.funcao, text(o.funcao))
    answer(pid, who, t, it.item.motivo, text(o.motivo))
    const [v1, v2, v3, v4] = it.verifLines
    const { sim: S, na: N } = it.simNa
    answer(pid, who, t, it.item.verif, { t: "verificacao", lines: { [v1]: { a: o.emOperacao ? S : N }, [v2]: { a: S }, [v3]: { a: S }, [v4]: { a: o.eletrica ? S : N } } })
    answer(pid, who, t, it.item.medidas, text(o.medidas))
    sign(pid, it.slot.sol, who, o.sendAt ?? t)
  }
  const interlock = { templateId: it.templateId, versionId: it.versionId }
  const reabilita = (pid: string, who: string, t: string) => {
    answer(pid, who, t, it.item.reab, { t: "verificacao", lines: Object.fromEntries(it.reabLines.map((l) => [l, { a: it.simNa.sim }])) })
    sign(pid, it.slot.area, who, t)
  }
  const crewIns = { [R.tecIns]: [andre] }

  /* ====================== the week, in order ====================== */

  // 03–04/11 · Trabalho em altura encerrado: lança do soprador de fuligem da caldeira de recuperação.
  create(at(3, "13:40"), lucas, { id: CEL.alturaFim, ...model("altura"), authorId: lucas, locationId: loc(6), assetIds: [asset(19)], team: { [R.lider]: [sandro] }, scope: "Troca da lança do soprador de fuligem SF-14 (elevação 32 m)", start: at(4, "07:00"), end: at(4, "17:00") })
  request("altura", CEL.alturaFim, lucas, at(3, "14:00"), { os: "OS-118734", desc: "Troca da lança do soprador SF-14 com talha manual; acesso por andaime fachadeiro.", empresa: "Montagens Serra (contratada)", perigos: ["Queda de altura", "Vapor e superfícies quentes"], extra: "32" })
  answer(CEL.alturaFim, eduardo, at(4, "06:50"), "fi_alt_chk", OK3(["fl_alt_anc", "fl_alt_cinto", "fl_alt_abaixo", "fl_alt_andaime"]))
  answer(CEL.alturaFim, eduardo, at(4, "06:50"), "fi_alt_vento", { t: "numero", v: 12 })
  answer(CEL.alturaFim, eduardo, at(4, "06:50"), "fi_alt_resg", { t: "documento", code: "PR-0112", files: [] })
  sign(CEL.alturaFim, slot("altura", "lib"), eduardo, at(4, "06:50"))
  sign(CEL.alturaFim, slot("altura", "emi"), aline, at(4, "07:00"))
  field("altura", CEL.alturaFim, sandro, at(4, "07:40"))
  handBack("altura", CEL.alturaFim, sandro, at(4, "15:30"))
  close("altura", CEL.alturaFim, gustavo, at(4, "15:50"))

  // 04–05/11 · PET encerrada: inspeção interna do tanque de aeração, medições dentro dos limites.
  create(at(4, "15:40"), lucas, { id: CEL.pet, ...model("confinado"), authorId: lucas, locationId: loc(25), assetIds: [asset(32)], team: { [R.tecMec]: [lucas], [R.vigia]: [jose] }, scope: "Inspeção interna e troca de difusores do tanque de aeração 1", start: at(5, "08:00"), end: at(5, "16:00") })
  request("confinado", CEL.pet, lucas, at(4, "16:00"), { os: "OS-118802", desc: "Inspeção interna e troca de 12 difusores de ar do tanque de aeração 1, drenado.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Deficiência de oxigênio", "Gases tóxicos (H₂S, ClO₂, CO)"], extra: "TQ-AER-01 · boca de visita norte" })
  answer(CEL.pet, ricardo, at(5, "07:30"), "fi_ec_isol", OK3(["fl_ec_raq", "fl_ec_agit", "fl_ec_lav", "fl_ec_vent"]))
  sign(CEL.pet, slot("confinado", "lib"), ricardo, at(5, "07:30"))
  answer(CEL.pet, eduardo, at(5, "07:45"), "fi_ec_det", { t: "documento", code: "DG-0457", files: [], validUntil: "2027-02-15" })
  answer(CEL.pet, eduardo, at(5, "07:45"), "fi_ec_gas", readings([["Boca de visita", "07:40", 20.9, 0, 0, 2], ["Fundo do tanque", "07:43", 20.7, 0, 1, 3]]))
  answer(CEL.pet, eduardo, at(5, "07:45"), "fi_ec_vigia", { t: "pessoa", ids: [jose] })
  answer(CEL.pet, eduardo, at(5, "07:45"), "fi_ec_resg", OK3(["fl_ec_tripe", "fl_ec_radio"]))
  sign(CEL.pet, slot("confinado", "prep"), eduardo, at(5, "07:45"))
  sign(CEL.pet, slot("confinado", "emi"), aline, at(5, "07:55"))
  field("confinado", CEL.pet, lucas, at(5, "08:10"))
  handBack("confinado", CEL.pet, lucas, at(5, "15:20"), "Doze difusores trocados; dois suportes com corrosão, OS de acompanhamento aberta.")
  close("confinado", CEL.pet, ricardo, at(5, "15:40"))

  // 05/11 · PT geral cancelada: a bomba reserva assumiu e o serviço foi reprogramado.
  create(at(5, "10:00"), lucas, { id: CEL.cancelada, ...model("geral"), authorId: lucas, locationId: loc(10), assetIds: [asset(36)], team: { [R.tecMec]: [lucas] }, scope: "Troca do selo mecânico da bomba de captação B-ETA-01", start: at(7, "07:00"), end: at(7, "17:00") })
  request("geral", CEL.cancelada, lucas, at(5, "10:10"), { os: "OS-118815", desc: "Troca do selo mecânico com içamento do motor por talha.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Partes móveis", "Choque elétrico"] })
  steps.push({ t: at(6, "08:00"), who: lucas, cancel: { permitId: CEL.cancelada, note: "Retirada pelo solicitante: bomba reserva assumiu; serviço reprogramado para a parada geral" } })

  // 05–06/11 · Intertravamento classe 1 encerrado (reabilitado): sobrecarga do transportador de cavacos.
  create(at(5, "08:20"), ricardo, { id: CEL.i7, ...interlock, authorId: ricardo, locationId: loc(1), assetIds: [asset(3)], team: crewIns, scope: "Desabilitar IT-MAD-02 para ajuste do relé de sobrecarga do TC-101", start: at(5, "09:00"), end: at(6, "18:00") })
  interlockRequest(CEL.i7, ricardo, at(5, "08:30"), { classe: 1, tag: "IT-MAD-02", funcao: "Desliga o transportador TC-101 por sobrecarga do motor", motivo: "Ajuste e teste do relé de sobrecarga após troca do redutor; o intertravamento desarma na partida com carga.", medidas: "Operador dedicado acompanhando a corrente do motor no SDCD; parada manual pela botoeira local.", emOperacao: true, eletrica: true })
  sign(CEL.i7, it.slot.classe[1], thiago, at(5, "08:50"))
  sign(CEL.i7, it.slot.campo, andre, at(5, "09:10"))
  sign(CEL.i7, it.slot.ent, andre, at(6, "16:00"))
  reabilita(CEL.i7, ricardo, at(6, "17:00"))

  // 06/11 · Intertravamento classe 2, aprovado pelo coordenador de manutenção e prorrogado pela gerente.
  create(at(6, "07:30"), aline, { id: CEL.i5, ...interlock, authorId: aline, locationId: loc(24), assetIds: [asset(31)], team: crewIns, scope: "Desabilitar IT-UTL-05 durante a troca do secador de ar do CP-02", start: at(6, "08:00"), end: at(11, "08:00") })
  interlockRequest(CEL.i5, aline, at(6, "07:50"), { classe: 2, tag: "IT-UTL-05", funcao: "Parte o compressor reserva e alarma com pressão do ar de instrumentos abaixo de 5,5 bar", motivo: "Troca do secador de ar do compressor CP-02: o transmissor PT-UTL-05 fica isolado e daria falso desarme.", medidas: "CP-01 em carga contínua alimentando o anel; ronda de 2 em 2 horas no manômetro local.", emOperacao: true, eletrica: false })
  sign(CEL.i5, it.slot.classe[2], marcos, at(6, "08:10"))
  sign(CEL.i5, it.slot.campo, andre, at(6, "08:30"))
  act(at(9, "16:00"), fernanda, { kind: "extend", permitId: CEL.i5, personId: fernanda, newEnd: at(13, "08:00"), reason: "O secador de reposição chega em 12/11. Proteção alternativa mantida: CP-01 em carga contínua e ronda de 2 em 2 horas." })

  // 07/11 · Intertravamento classe 2, intervenção concluída: espera a reabilitação.
  create(at(7, "07:40"), ricardo, { id: CEL.i6, ...interlock, authorId: ricardo, locationId: loc(26), assetIds: [asset(33)], team: crewIns, scope: "Desabilitar IT-ETE-02 para calibrar o analisador de pH AT-ETE-02", start: at(7, "09:00"), end: at(10, "18:00") })
  interlockRequest(CEL.i6, ricardo, at(7, "08:00"), { classe: 2, tag: "IT-ETE-02", funcao: "Desvia o efluente para a lagoa de emergência com pH fora de 6 a 9", motivo: "Calibração e troca do eletrodo do analisador AT-ETE-02.", medidas: "Coleta manual de pH de hora em hora pelo laboratório; desvio manual da comporta se fora da faixa.", emOperacao: true, eletrica: false })
  sign(CEL.i6, it.slot.classe[2], marcos, at(7, "08:40"))
  sign(CEL.i6, it.slot.campo, andre, at(7, "09:05"))
  sign(CEL.i6, it.slot.ent, andre, at(10, "08:30"))

  // 09/11 · Intertravamento classe 1, aprovado pelo especialista de operação: em vigor.
  create(at(9, "06:40"), aline, { id: CEL.i1, ...interlock, authorId: aline, locationId: loc(23), assetIds: [asset(29)], team: crewIns, scope: "Desabilitar IT-MS-04 para ajuste dos sensores de quebra de folha", start: at(9, "08:00"), end: at(12, "08:00") })
  interlockRequest(CEL.i1, aline, at(9, "07:00"), { classe: 1, tag: "IT-MS-04", funcao: "Para o secador e o enfardamento quando o sensor detecta quebra de folha", motivo: "Ajuste e alinhamento dos sensores ópticos de quebra de folha após troca da tela.", medidas: "Operador na passarela do secador com rádio; parada manual pela sala de controle.", emOperacao: true, eletrica: false })
  sign(CEL.i1, it.slot.classe[1], thiago, at(9, "07:30"))
  sign(CEL.i1, it.slot.campo, andre, at(9, "08:10"))

  // 09/11 · Trabalho a quente expirado: o trabalho passou da janela; falta a entrega da área.
  create(at(9, "06:10"), lucas, { id: CEL.expirada, ...model("quente"), authorId: lucas, locationId: loc(13), assetIds: [asset(1)], team: { [R.tecMec]: [lucas] }, scope: "Recuperação por solda das facas e da calha do picador PC-01", start: at(9, "07:00"), end: at(9, "18:00") })
  request("quente", CEL.expirada, lucas, at(9, "06:30"), { os: "OS-118901", desc: "Recuperação por solda da calha de alimentação e esmerilhamento do porta-facas do picador.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Incêndio ou explosão", "Partes móveis", "Ruído"] })
  answer(CEL.expirada, eduardo, at(9, "06:45"), "fi_q_prec", OK3(["fl_q_comb", "fl_q_ralo", "fl_q_linha", "fl_q_ext"]))
  answer(CEL.expirada, eduardo, at(9, "06:45"), "fi_q_lie", { t: "numero", v: 0 })
  answer(CEL.expirada, eduardo, at(9, "06:45"), "fi_q_obs", { t: "pessoa", ids: [jose] })
  sign(CEL.expirada, slot("quente", "lib"), patricia, at(9, "06:48"))
  sign(CEL.expirada, slot("quente", "prep"), eduardo, at(9, "06:50"))
  sign(CEL.expirada, slot("quente", "emi"), aline, at(9, "07:00"))
  field("quente", CEL.expirada, lucas, at(9, "07:40"))
  act(at(9, "18:00"), null, { kind: "expire", permitId: CEL.expirada })

  // 09–10/11 · PT geral devolvida (faltava a APR da contratada), reenviada e emitida.
  create(at(9, "08:00"), lucas, { id: CEL.devolvida, ...model("geral"), authorId: lucas, locationId: loc(8), assetIds: [asset(26)], team: { [R.tecMec]: [lucas], [R.lider]: [sandro] }, scope: "Troca de rolamentos da bomba de lama de cal B-CAU-07", start: at(10, "13:00"), end: at(10, "17:00") })
  request("geral", CEL.devolvida, lucas, at(9, "09:00"), { os: "OS-118915", desc: "Troca dos rolamentos do lado acoplado e alinhamento a laser.", empresa: "Montagens Serra (contratada)", perigos: ["Partes móveis", "Contato com produto químico (licor, soda, ClO₂)"] })
  answer(CEL.devolvida, gustavo, at(9, "10:00"), "fi_lib", OK3(["fl_lib_bloq", "fl_lib_dren", "fl_lib_sinal", "fl_lib_ext"]))
  answer(CEL.devolvida, gustavo, at(9, "10:00"), "fi_lib_cad", text("Cadeado 0412 na gaveta da B-CAU-07"))
  sign(CEL.devolvida, slot("geral", "lib"), gustavo, at(9, "10:00"))
  act(at(9, "10:30"), ricardo, { kind: "refuse", permitId: CEL.devolvida, personId: ricardo, reason: "Falta a APR da contratada para o içamento do motor. Anexe o número da APR na descrição." })
  answer(CEL.devolvida, lucas, at(9, "13:50"), "fi_desc", text("Troca dos rolamentos do lado acoplado e alinhamento a laser. Içamento do motor conforme APR-2026-0871 da Montagens Serra."))
  sign(CEL.devolvida, slot("geral", "sol"), lucas, at(9, "14:00"))
  sign(CEL.devolvida, slot("geral", "lib"), gustavo, at(9, "14:30"))
  sign(CEL.devolvida, slot("geral", "emi"), ricardo, at(10, "08:00"))

  // 09/11 · Intertravamento classe 3, aprovado pela coordenadora da área: em vigor.
  create(at(9, "13:40"), ricardo, { id: CEL.i2, ...interlock, authorId: ricardo, locationId: loc(5), assetIds: [asset(13)], team: crewIns, scope: "Desabilitar IT-EV-03 para troca do transmissor de nível do TQ-LP", start: at(9, "15:00"), end: at(11, "15:00") })
  interlockRequest(CEL.i2, ricardo, at(9, "14:00"), { classe: 3, tag: "IT-EV-03", funcao: "Para a alimentação de licor preto forte com nível acima de 92% no TQ-LP", motivo: "Troca do transmissor de nível LT-EV-03 com defeito intermitente.", medidas: "Nível acompanhado pelo radar redundante LT-EV-03B; operador com limite de 85% para parar a bomba manualmente.", emOperacao: true, eletrica: true })
  sign(CEL.i2, it.slot.classe[3], camila, at(9, "14:40"))
  sign(CEL.i2, it.slot.campo, andre, at(9, "15:10"))

  // 09–10/11 · Elétrica na subestação: emitida, espera a janela da tarde.
  create(at(9, "14:40"), juliana, { id: CEL.subestacao, ...model("eletrica"), authorId: juliana, locationId: loc(28), assetIds: [asset(35)], team: { [R.tecEle]: [juliana] }, scope: "Manutenção preventiva do disjuntor 52-3 do painel de 13,8 kV", start: at(10, "13:00"), end: at(10, "17:00") })
  request("eletrica", CEL.subestacao, juliana, at(9, "15:00"), { os: "OS-118940", desc: "Inspeção, lubrificação e ensaio de resistência de contato do disjuntor 52-3.", empresa: "Celulose Demo · manutenção elétrica", perigos: ["Choque elétrico", "Arco elétrico"], extra: "fo_el_mt" })
  isolate(CEL.subestacao, juliana, at(10, "07:30"), [
    { id: "iso1", point: "Disjuntor 52-3 extraído e travado", assetId: asset(35), energy: "eletrica", method: "Extração e cadeado", lock: "C-1388" },
    { id: "iso2", point: "Chave de aterramento do cubículo 3", energy: "eletrica", method: "Aterramento", lock: "C-1389" },
  ])
  sign(CEL.subestacao, slot("eletrica", "prep"), ricardo, at(10, "07:50"))
  sign(CEL.subestacao, slot("eletrica", "emi"), aline, at(10, "08:10"))

  // 09–10/11 · Trabalho a quente em execução na área do digestor.
  create(at(9, "16:40"), lucas, { id: CEL.quente, ...model("quente"), authorId: lucas, locationId: loc(29), assetIds: [asset(7)], team: { [R.lider]: [sandro], [R.tecMec]: [lucas] }, scope: "Solda de reparo em suporte e trecho da linha de licor branco LB-204", start: at(10, "07:00"), end: at(10, "17:00") })
  request("quente", CEL.quente, lucas, at(9, "17:00"), { os: "OS-118951", desc: "Substituição de 1,5 m da linha LB-204 (6\") com corrosão e solda de dois suportes; linha drenada, lavada e raqueteada.", empresa: "Montagens Serra (contratada)", perigos: ["Incêndio ou explosão", "Contato com produto químico (licor, soda, ClO₂)", "Queda de altura"] })
  answer(CEL.quente, eduardo, at(10, "06:45"), "fi_q_prec", OK3(["fl_q_comb", "fl_q_ralo", "fl_q_linha", "fl_q_ext"]))
  answer(CEL.quente, eduardo, at(10, "06:45"), "fi_q_lie", { t: "numero", v: 0 })
  answer(CEL.quente, eduardo, at(10, "06:45"), "fi_q_obs", { t: "pessoa", ids: [jose] })
  sign(CEL.quente, slot("quente", "lib"), patricia, at(10, "06:48"))
  sign(CEL.quente, slot("quente", "prep"), eduardo, at(10, "06:50"))
  sign(CEL.quente, slot("quente", "emi"), ricardo, at(10, "07:00"))
  field("quente", CEL.quente, sandro, at(10, "07:15"))

  // 09–10/11 · Trabalho em altura parado pelo vento e retomado: espera o novo Aceite no campo.
  create(at(9, "15:40"), lucas, { id: CEL.altura, ...model("altura"), authorId: lucas, locationId: loc(21), assetIds: [asset(24)], team: { [R.tecMec]: [lucas], [R.lider]: [sandro] }, scope: "Inspeção e reparo de chapas do duto do ventilador de tiragem induzida", start: at(10, "07:00"), end: at(10, "17:00") })
  request("altura", CEL.altura, lucas, at(9, "16:00"), { os: "OS-118948", desc: "Inspeção por ultrassom e reparo de chapas desgastadas do duto, com andaime e linha de vida.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Queda de altura", "Vapor e superfícies quentes"], extra: "18" })
  answer(CEL.altura, eduardo, at(10, "06:40"), "fi_alt_chk", OK3(["fl_alt_anc", "fl_alt_cinto", "fl_alt_abaixo", "fl_alt_andaime"]))
  answer(CEL.altura, eduardo, at(10, "06:40"), "fi_alt_vento", { t: "numero", v: 18 })
  answer(CEL.altura, eduardo, at(10, "06:40"), "fi_alt_resg", { t: "documento", code: "PR-0127", files: [] })
  sign(CEL.altura, slot("altura", "lib"), eduardo, at(10, "06:45"))
  sign(CEL.altura, slot("altura", "emi"), ricardo, at(10, "07:05"))
  field("altura", CEL.altura, lucas, at(10, "07:30"))
  act(at(10, "08:40"), sandro, { kind: "stop", permitId: CEL.altura, personId: sandro, reason: "Rajadas de vento acima de 40 km/h na elevação 18 m" })
  act(at(10, "09:30"), ricardo, { kind: "resume", permitId: CEL.altura, personId: ricardo, reason: "Vento medido em 22 km/h há 30 minutos; condição dentro do limite" })

  // 10/11 · PET em análise: a medição no fundo do tanque deu H₂S acima do limite e trava a etapa.
  create(at(10, "06:40"), lucas, { id: CEL.confinado, ...model("confinado"), authorId: lucas, locationId: loc(16), assetIds: [asset(8)], team: { [R.tecMec]: [lucas], [R.vigia]: [jose] }, scope: "Limpeza e inspeção interna do tanque de filtrado TQ-312", start: at(10, "09:00"), end: at(10, "17:00") })
  request("confinado", CEL.confinado, lucas, at(10, "07:00"), { os: "OS-118960", desc: "Remoção de incrustação e inspeção visual do costado e do fundo do tanque de filtrado.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Deficiência de oxigênio", "Gases tóxicos (H₂S, ClO₂, CO)", "Contato com produto químico (licor, soda, ClO₂)"], extra: "TQ-312 · boca de visita lateral" })
  answer(CEL.confinado, patricia, at(10, "08:30"), "fi_ec_isol", OK3(["fl_ec_raq", "fl_ec_agit", "fl_ec_lav", "fl_ec_vent"]))
  sign(CEL.confinado, slot("confinado", "lib"), patricia, at(10, "08:30"))
  answer(CEL.confinado, eduardo, at(10, "09:20"), "fi_ec_det", { t: "documento", code: "DG-0457", files: [], validUntil: "2027-02-15" })
  answer(CEL.confinado, eduardo, at(10, "09:20"), "fi_ec_gas", readings([["Boca de visita", "09:12", 20.9, 0, 2, 4], ["Fundo do tanque", "09:16", 20.4, 3, 14, 6]]))
  answer(CEL.confinado, eduardo, at(10, "09:20"), "fi_ec_vigia", { t: "pessoa", ids: [jose] })
  answer(CEL.confinado, eduardo, at(10, "09:20"), "fi_ec_resg", OK3(["fl_ec_tripe", "fl_ec_radio"]))

  // 10/11 · Elétrica em análise: bloqueio registrado e verificado; espera a Emissão.
  create(at(10, "07:30"), juliana, { id: CEL.eletrica, ...model("eletrica"), authorId: juliana, locationId: loc(18), assetIds: [asset(15)], team: { [R.tecEle]: [juliana] }, scope: "Troca do contator e do relé térmico da partida da B-EV-05", start: at(10, "10:30"), end: at(10, "16:30") })
  request("eletrica", CEL.eletrica, juliana, at(10, "07:45"), { os: "OS-118966", desc: "Troca do contator K1 e do relé térmico F2 da gaveta G05; teste de partida com a operação.", empresa: "Celulose Demo · manutenção elétrica", perigos: ["Choque elétrico", "Arco elétrico"], extra: "fo_el_bt" })
  isolate(CEL.eletrica, juliana, at(10, "08:30"), [
    { id: "iso1", point: "Gaveta G05 do CCM-EVP-01 extraída", assetId: asset(15), energy: "eletrica", method: "Extração e cadeado", lock: "C-2051" },
    { id: "iso2", point: "Válvula de sucção da B-EV-05 fechada", energy: "hidraulica", method: "Fechamento e cadeado", lock: "C-2052" },
  ])
  sign(CEL.eletrica, slot("eletrica", "prep"), gustavo, at(10, "09:00"))

  // 10/11 · Intertravamento classe 4: espera a aprovação de um gerente.
  create(at(10, "08:10"), ricardo, { id: CEL.i3, ...interlock, authorId: ricardo, locationId: loc(19), assetIds: [asset(18)], team: crewIns, scope: "Desabilitar IT-CR-07 para calibrar o transmissor de nível LT-CR-07A", start: at(10, "13:00"), end: at(11, "07:00") })
  interlockRequest(CEL.i3, ricardo, at(10, "08:30"), { classe: 4, tag: "IT-CR-07", funcao: "Desarma a caldeira de recuperação com nível baixo do tubulão (2 de 3 transmissores)", motivo: "Calibração do transmissor LT-CR-07A com a caldeira em operação; a lógica fica 1 de 2 com os transmissores B e C.", medidas: "Operador dedicado no painel do tubulão; visor de nível local acompanhado de 15 em 15 minutos; carga da caldeira reduzida a 80%.", emOperacao: true, eletrica: true })

  // 10/11 · Rascunho de intertravamento classe 5: o modelo impede (não forçável) e o envio é recusado.
  create(at(10, "09:00"), ricardo, { id: CEL.i4, ...interlock, authorId: ricardo, locationId: loc(17), assetIds: [asset(10)], team: crewIns, scope: "Desabilitar IT-BRQ-02 para troca do sensor do detector de ClO₂", start: at(10, "13:00"), end: at(10, "17:00") })
  interlockRequest(CEL.i4, ricardo, at(10, "09:35"), { sendAt: at(10, "09:40"), classe: 5, tag: "IT-BRQ-02", funcao: "Para o gerador de ClO₂ e aciona o lavador de gases com vazamento detectado", motivo: "Troca do sensor eletroquímico do detector de ClO₂ vencido.", medidas: "Detector portátil no local.", emOperacao: true, eletrica: true })
  denied.add(`${CEL.i4}@${at(10, "09:40")}`)

  // 10/11 · Rascunho bloqueado pela trava de equipamento: o CCM tem a gaveta G05 em PT aberta.
  create(at(10, "09:10"), juliana, { id: CEL.bloqueada, ...model("eletrica"), authorId: juliana, locationId: loc(18), assetIds: [asset(14)], team: { [R.tecEle]: [juliana] }, scope: "Termografia e reaperto do barramento do CCM-EVP-01", start: at(11, "08:00"), end: at(11, "12:00") })
  request("eletrica", CEL.bloqueada, juliana, at(10, "09:42"), { sendAt: at(10, "09:45"), os: "OS-118972", desc: "Termografia com o CCM em carga e reaperto do barramento horizontal.", empresa: "Celulose Demo · manutenção elétrica", perigos: ["Choque elétrico", "Arco elétrico"], extra: "fo_el_bt" })
  denied.add(`${CEL.bloqueada}@${at(10, "09:45")}`)

  // 10/11 · Manutenção no TQ-LP junto com a desabilitação do IT-EV-03 (i2, ativa no mesmo tanque): o
  // modelo de intertravamento não prende o equipamento, então as duas PTs convivem.
  create(at(10, "09:48"), lucas, { id: CEL.junto, ...model("geral"), authorId: lucas, locationId: loc(5), assetIds: [asset(13)], team: { [R.tecMec]: [lucas] }, scope: "Içamento e troca do transmissor de nível LT-EV-03 no TQ-LP", start: at(10, "13:00"), end: at(10, "17:00") })
  request("geral", CEL.junto, lucas, at(10, "09:50"), { os: "OS-118975", desc: "Retirada do transmissor LT-EV-03 com talha e instalação do novo no bocal do tanque.", empresa: "Celulose Demo · manutenção mecânica", perigos: ["Contato com produto químico (licor, soda, ClO₂)"] })

  let n = 0
  return replayPermits(steps, { registry, newId: () => C.signature(++n), counterStart: 412, deniedOnPurpose: denied, label: "Cenário celulose" })
}

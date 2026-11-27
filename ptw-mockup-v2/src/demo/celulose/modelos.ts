/**
 * The pulp mill's own permit models (one active version each), written as the plant's safety team
 * would configure them, with content inspired by public Brazilian permit forms (NR-10, NR-33, NR-35,
 * hot work). The interlock model is not here: it arrives through the import (`intertravamento.ts`).
 */
import type { FormItem, FormSection, PermitTemplate, SignSlot, Stage, TemplateVersion } from "@/registry/types"
import { normalizeSeparation } from "@/core/templateVersions"
import { C, type ModelKey } from "./ids"
import { LIST, listItemId, workTypeId } from "./lists"

const R = C.role
const at = (day: string, time = "09:00:00") => `${day}T${time}-03:00`
type SlotKey = Parameters<typeof C.slot>[1]
type StageKey = Parameters<typeof C.stage>[1]

const slot = (m: ModelKey, k: SlotKey, meaning: string, roleIds: string[]): SignSlot =>
  ({ id: C.slot(m, k), meaning, kind: "cargo", roleIds, personId: null, min: 1, required: true })

/** Who requests, issues, accepts in the field and closes, the same in every model. */
const SOLICITA = [R.tecMec, R.tecEle, R.tecIns, R.coordMan]
const EMITE = [R.supTurno, R.coordArea]
const EXECUTA = [R.lider, R.tecMec, R.tecEle, R.tecIns]
const ENCERRA = [R.supTurno, R.operador]

function stages(m: ModelKey, free: Stage[]): Stage[] {
  return [
    { id: C.stage(m, "sol"), name: "Solicitação", kind: "solicitacao", slots: [slot(m, "sol", "Solicita a PT", SOLICITA)] },
    ...free,
    { id: C.stage(m, "emi"), name: "Emissão", kind: "emissao", locked: true, slots: [slot(m, "emi", "Emite a PT", EMITE)] },
    { id: C.stage(m, "campo"), name: "Aceite no campo", kind: "aceite_campo", locked: true, slots: [slot(m, "campo", "Aceita no campo e orienta a equipe", EXECUTA)] },
    { id: C.stage(m, "ent"), name: "Entrega", kind: "entrega", locked: true, slots: [slot(m, "ent", "Entrega a área", EXECUTA)] },
    { id: C.stage(m, "area"), name: "Aceite da área", kind: "aceite_area", locked: true, slots: [slot(m, "area", "Recebe a área e encerra a PT", ENCERRA)] },
  ]
}
const stage = (m: ModelKey, k: StageKey, name: string, slots: SignSlot[]): Stage => ({ id: C.stage(m, k), name, slots })

const sim = (id: string, label: string) => ({ id, label, blockOn: ["nao"], noteOn: ["na"] })
const confirmo = (id: string, label: string) => ({ id, label, blockOn: [], noteOn: [] })

/** Solicitação: the work order and what will be done (every model). */
const solicitacao = (m: ModelKey, extra: FormItem[] = []): FormSection => ({
  id: "fs_sol", title: "Dados do serviço", stageId: C.stage(m, "sol"), items: [
    { id: "fi_os", kind: "documento", label: "Ordem de serviço", required: true, pattern: "OS-######", attach: false, validity: false },
    { id: "fi_desc", kind: "texto", label: "Descrição do serviço", required: true, long: true },
    { id: "fi_empresa", kind: "texto", label: "Empresa executante", required: true, long: false },
    { id: "fi_perigos", kind: "marcacao", label: "Perigos identificados na APR", required: true, multiple: true, other: true, options: [], listId: LIST.perigos },
    ...extra,
  ],
})

/** Aceite no campo, Entrega and Aceite da área: the same three checks in every model. */
const fieldSections = (m: ModelKey): FormSection[] => [
  { id: "fs_campo", title: "Antes de começar", stageId: C.stage(m, "campo"), items: [
    { id: "fi_campo", kind: "verificacao", label: "Equipe e área", required: true, answers: "sim_nao_na", lines: [
      sim("fl_dds", "DDS feito com toda a equipe sobre os riscos desta PT"),
      sim("fl_trein", "Executantes com treinamento e ASO válidos"),
      sim("fl_epi", "EPI conferido em toda a equipe"),
    ] },
    { id: "fi_epi", kind: "marcacao", label: "EPI exigido", required: true, multiple: true, other: true, options: [], listId: LIST.epi },
  ] },
  { id: "fs_ent", title: "Área devolvida", stageId: C.stage(m, "ent"), items: [
    { id: "fi_ent", kind: "verificacao", label: "Antes de entregar", required: true, answers: "confirmo", lines: [
      confirmo("fl_ent_pessoas", "Pessoas, ferramentas e materiais retirados"),
      confirmo("fl_ent_prot", "Proteções, tampas e guarda-corpos recolocados"),
      confirmo("fl_ent_limpa", "Área limpa e sem resíduos"),
    ] },
    { id: "fi_ent_obs", kind: "texto", label: "Observações da entrega", required: false, long: true },
  ] },
  { id: "fs_area", title: "Encerramento", stageId: C.stage(m, "area"), items: [
    { id: "fi_area", kind: "verificacao", label: "Condição do equipamento", required: true, answers: "sim_nao", lines: [
      { id: "fl_area_oper", label: "Equipamento pode voltar à operação", blockOn: [], noteOn: ["nao"] },
    ] },
    { id: "fi_area_aviso", kind: "aviso", label: "Aviso", required: false, text: "Encerrar a PT não remove bloqueios: a remoção segue o procedimento de bloqueio da área." },
  ] },
]

const emissao = (m: ModelKey, text: string): FormSection => ({
  id: "fs_emi", title: "Emissão", stageId: C.stage(m, "emi"), items: [
    { id: "fi_emi", kind: "aviso", label: "Aviso", required: false, text },
  ],
})

/** Tipos de trabalho (catálogo) de cada modelo da planta. */
const WORK_TYPES: Record<ModelKey, Parameters<typeof workTypeId>[0][]> = {
  geral: ["Içamento de carga", "Escavação"], quente: ["Trabalho a quente"], confinado: ["Espaço confinado"], altura: ["Em altura"], eletrica: ["Elétrico"],
}

/** The register's facts of a version (all active since October). */
function version(m: ModelKey, maxWindowHours: number, locationTypeIds: string[], assetTypeIds: string[], st: Stage[], sections: FormSection[], note: string, extraSep: [SlotKey, SlotKey][] = []): TemplateVersion {
  return {
    id: C.version[m], number: 1, status: "ativa", createdAt: at("2026-10-01"), activatedAt: at("2026-10-05"), note,
    origin: "manual", sourceSha256: null, maxWindowHours, holdsEquipment: true, locationTypeIds, assetTypeIds, workTypeIds: WORK_TYPES[m].map(workTypeId), stages: st,
    separation: [
      normalizeSeparation(C.slot(m, "emi"), C.slot(m, "campo"), true),
      normalizeSeparation(C.slot(m, "ent"), C.slot(m, "area"), true),
      ...extraSep.map(([a, b]) => normalizeSeparation(C.slot(m, a), C.slot(m, b))),
    ],
    form: { sections },
  }
}

const LT = C.locationType
const AT = C.assetType
const ALL_PLACES = [LT.area, LT.sala, LT.ponto, LT.patio]
const ALL_ASSETS = Object.values(AT)
const PROCESS_ASSETS = [AT.vaso, AT.tanque, AT.bomba, AT.motor, AT.cald, AT.vent, AT.soprador, AT.comp, AT.tubo, AT.forno, AT.maq, AT.transp, AT.evap, AT.precip]

const tpl = (m: ModelKey, name: string, retentionClass: PermitTemplate["retentionClass"], v: TemplateVersion): PermitTemplate =>
  ({ id: C.template[m], name, retentionClass, revision: 1, updatedAt: at("2026-10-05"), versions: [v] })

const lib = (m: ModelKey, name: string, meaning: string, roles: string[], k: StageKey = "lib", s: SlotKey = "lib") => stage(m, k, name, [slot(m, s, meaning, roles)])

export const celuloseTemplates: PermitTemplate[] = [
  tpl("geral", "PT geral", "pt", version("geral", 72, ALL_PLACES, ALL_ASSETS,
    stages("geral", [lib("geral", "Liberação da área", "Libera a área e o equipamento", [R.operador, R.supTurno])]),
    [
      solicitacao("geral", [{ id: "fi_trab", kind: "marcacao", label: "Tipos de trabalho envolvidos", required: true, multiple: true, other: true, options: [], listId: LIST.trabalho }]),
      { id: "fs_lib", title: "Liberação da área", stageId: C.stage("geral", "lib"), items: [
        { id: "fi_lib", kind: "verificacao", label: "Condição do equipamento", required: true, answers: "sim_nao_na", lines: [
          sim("fl_lib_bloq", "Equipamento bloqueado e etiquetado (cadeado e cartão no ponto de bloqueio)"),
          sim("fl_lib_dren", "Linhas drenadas, despressurizadas e lavadas"),
          sim("fl_lib_sinal", "Área isolada e sinalizada"),
          sim("fl_lib_ext", "Extintor disponível no local"),
        ] },
        { id: "fi_lib_cad", kind: "texto", label: "Nº do cadeado de bloqueio", required: true, long: false },
      ] },
      emissao("geral", "As medidas de controle acima são adequadas a esta tarefa. A PT vale só para o serviço e a janela descritos."),
      ...fieldSections("geral"),
    ], "Revisão de outubro: inclui tipos de trabalho")),

  tpl("quente", "Trabalho a quente", "pt", version("quente", 12, ALL_PLACES, PROCESS_ASSETS,
    stages("quente", [stage("quente", "lib", "Preparação", [
      slot("quente", "lib", "Libera a área e o equipamento", [R.operador, R.supTurno]),
      slot("quente", "prep", "Confere a prevenção de incêndio", [R.tecSeg]),
    ])]),
    [
      solicitacao("quente", [{ id: "fi_q_tipo", kind: "marcacao", label: "Atividade", required: true, multiple: true, other: true, options: [
        { id: "fo_q_solda", label: "Solda elétrica" }, { id: "fo_q_oxi", label: "Oxicorte" }, { id: "fo_q_esmeril", label: "Esmerilhamento" }, { id: "fo_q_macarico", label: "Maçarico" },
      ] }]),
      { id: "fs_q_prep", title: "Prevenção de incêndio", stageId: C.stage("quente", "lib"), items: [
        { id: "fi_q_prec", kind: "verificacao", label: "Antes de liberar", required: true, answers: "sim_nao_na", lines: [
          sim("fl_q_comb", "Materiais combustíveis (cavaco, pó, óleo) removidos num raio de 11 m"),
          sim("fl_q_ralo", "Ralos, canaletas e aberturas protegidos com manta antichama"),
          sim("fl_q_linha", "Linha drenada, lavada e raqueteada"),
          sim("fl_q_ext", "Extintor e mangueira de incêndio no local"),
        ] },
        { id: "fi_q_lie", kind: "numero", label: "Explosividade no ponto de trabalho", required: true, unit: "% LIE", decimals: 0, negative: false, min: 0, max: 0 },
        { id: "fi_q_obs", kind: "pessoa", label: "Observador de incêndio", required: true, multiple: false, roleId: R.vigia, mustBeEligible: true },
      ] },
      emissao("quente", "A explosividade deve ser medida de novo a cada 2 horas e após qualquer parada. O observador fica no local até 30 minutos depois do fim do trabalho."),
      ...fieldSections("quente"),
    ], "Inclui observador de incêndio e explosividade zero")),

  tpl("confinado", "Entrada em espaço confinado (PET)", "pet", version("confinado", 8, ALL_PLACES, [AT.vaso, AT.tanque, AT.cald, AT.forno, AT.evap, AT.precip],
    stages("confinado", [
      lib("confinado", "Liberação do espaço", "Libera e isola o espaço confinado", [R.operador, R.supTurno]),
      lib("confinado", "Teste de atmosfera", "Mede a atmosfera e confere o resgate", [R.tecSeg], "prep", "prep"),
    ]),
    [
      solicitacao("confinado", [{ id: "fi_ec_espaco", kind: "texto", label: "Identificação do espaço confinado", required: true, long: false }]),
      { id: "fs_ec_lib", title: "Isolamento do espaço", stageId: C.stage("confinado", "lib"), items: [
        { id: "fi_ec_isol", kind: "verificacao", label: "Antes da entrada", required: true, answers: "sim_nao_na", lines: [
          sim("fl_ec_raq", "Entradas de produto raqueteadas ou com duplo bloqueio e dreno"),
          sim("fl_ec_agit", "Agitador e bombas bloqueados e etiquetados"),
          sim("fl_ec_lav", "Espaço drenado, lavado e ventilado"),
          sim("fl_ec_vent", "Ventilação ou exaustão mecânica em funcionamento"),
        ] },
      ] },
      { id: "fs_ec_atm", title: "Atmosfera e resgate", stageId: C.stage("confinado", "prep"), items: [
        { id: "fi_ec_det", kind: "documento", label: "Detector de gases (nº e calibração)", required: true, attach: false, validity: true },
        { id: "fi_ec_gas", kind: "grupo", label: "Medições da atmosfera", required: true, minRows: 2, columns: [
          { id: "fi_ec_ponto", kind: "texto", label: "Ponto de medição", required: true, long: false },
          { id: "fi_ec_hora", kind: "horario", label: "Hora", required: true, seconds: false },
          { id: "fi_ec_o2", kind: "numero", label: "O₂", required: true, unit: "%", decimals: 1, negative: false, min: 19.5, max: 23 },
          { id: "fi_ec_lie", kind: "numero", label: "Inflamáveis", required: true, unit: "% LIE", decimals: 0, negative: false, min: 0, max: 10 },
          { id: "fi_ec_h2s", kind: "numero", label: "H₂S", required: true, unit: "ppm", decimals: 0, negative: false, min: 0, max: 8 },
          { id: "fi_ec_co", kind: "numero", label: "CO", required: true, unit: "ppm", decimals: 0, negative: false, min: 0, max: 39 },
        ] },
        { id: "fi_ec_vigia", kind: "pessoa", label: "Vigia", required: true, multiple: false, roleId: R.vigia, mustBeEligible: true },
        { id: "fi_ec_resg", kind: "verificacao", label: "Resgate", required: true, answers: "sim_nao", lines: [
          { id: "fl_ec_tripe", label: "Tripé, guincho e cinto com ponto de içamento no local", blockOn: ["nao"], noteOn: [] },
          { id: "fl_ec_radio", label: "Comunicação por rádio testada com a sala de controle", blockOn: ["nao"], noteOn: [] },
        ] },
      ] },
      emissao("confinado", "Espaço confinado: entrada só com o vigia no local e a atmosfera dentro dos limites (NR-33). Qualquer alarme do detector: saia e pare a PT."),
      ...fieldSections("confinado"),
    ], "Permissão de Entrada e Trabalho (NR-33)")),

  tpl("altura", "Trabalho em altura", "pt", version("altura", 12, ALL_PLACES, PROCESS_ASSETS,
    stages("altura", [lib("altura", "Preparação", "Confere ancoragem, resgate e vento", [R.tecSeg])]),
    [
      solicitacao("altura", [{ id: "fi_alt_h", kind: "numero", label: "Altura de trabalho", required: true, unit: "m", decimals: 1, negative: false, min: 2 }]),
      { id: "fs_alt", title: "Condições para o trabalho em altura", stageId: C.stage("altura", "lib"), items: [
        { id: "fi_alt_chk", kind: "verificacao", label: "Antes de liberar", required: true, answers: "sim_nao_na", lines: [
          sim("fl_alt_anc", "Ponto de ancoragem inspecionado"),
          sim("fl_alt_cinto", "Cinto paraquedista e talabarte duplo inspecionados"),
          sim("fl_alt_abaixo", "Área abaixo isolada"),
          sim("fl_alt_andaime", "Andaime liberado com cartão verde"),
        ] },
        { id: "fi_alt_vento", kind: "numero", label: "Velocidade do vento", required: true, unit: "km/h", decimals: 0, negative: false, min: 0, max: 40 },
        { id: "fi_alt_resg", kind: "documento", label: "Plano de resgate", required: true, pattern: "PR-####", attach: false, validity: false },
      ] },
      emissao("altura", "Trabalho em altura (NR-35): vento acima de 40 km/h, chuva forte ou descarga atmosférica param o trabalho."),
      ...fieldSections("altura"),
    ], "Inclui limite de vento e plano de resgate")),

  tpl("eletrica", "Intervenção elétrica (NR-10)", "pt", version("eletrica", 12, ALL_PLACES, [AT.painel, AT.gaveta, AT.trafo, AT.motor],
    stages("eletrica", [stage("eletrica", "lib", "Bloqueio", [
      slot("eletrica", "lib", "Registra o bloqueio", [R.tecEle]),
      slot("eletrica", "prep", "Verifica o bloqueio", [R.operador, R.supTurno]),
    ])]),
    [
      solicitacao("eletrica", [{ id: "fi_el_tensao", kind: "marcacao", label: "Nível de tensão", required: true, multiple: false, other: false, options: [
        { id: "fo_el_bt", label: "Baixa tensão (até 1 kV)" }, { id: "fo_el_mt", label: "Média tensão (13,8 kV)" }, { id: "fo_el_at", label: "Alta tensão (138 kV)" },
      ] }]),
      { id: "fs_el_bloq", title: "Desenergização", stageId: C.stage("eletrica", "lib"), items: [
        { id: "fi_el_iso", kind: "isolamento", label: "Pontos de isolamento", required: true, minRows: 1 },
        { id: "fi_el_chk", kind: "verificacao", label: "Sequência de desenergização", required: true, answers: "sim_nao_na", lines: [
          sim("fl_el_secc", "Seccionamento e impedimento de reenergização"),
          sim("fl_el_aus", "Ausência de tensão constatada"),
          sim("fl_el_terra", "Aterramento temporário instalado"),
        ] },
        { id: "fi_el_v", kind: "numero", label: "Tensão medida após o bloqueio", required: true, unit: "V", decimals: 1, negative: false, min: 0, max: 0 },
      ] },
      emissao("eletrica", "Só profissionais autorizados (NR-10) intervêm. A reenergização segue o procedimento inverso, com a PT encerrada."),
      ...fieldSections("eletrica"),
    ], "Bloqueio com pontos de isolamento", [["lib", "prep"]])),
]

/** EPI and checks every sample permit answers in the field (helpers for the story). */
export const EPI_BASICO = ["Capacete", "Óculos de segurança", "Protetor auricular", "Luvas", "Calçado de segurança"].map((l) => listItemId("epi", l))

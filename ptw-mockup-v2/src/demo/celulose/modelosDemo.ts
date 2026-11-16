/**
 * Three showcase models of rising complexity (simples · média · complexa), to present the product:
 * the same skeleton (Solicitação → Emissão → Aceite no campo → Entrega → Aceite da área) carrying
 * more stages, item kinds, conditional signatures and separation rules as the work gets riskier.
 * Own id families (0x0a42…, 0x0a8x), so the other models and the load scenario are untouched.
 */
import type { FormItem, FormSection, PermitTemplate, SignSlot, Stage, TemplateVersion } from "@/registry/types"
import { seedUuid } from "@/registry/seedIds"
import { normalizeSeparation } from "@/core/templateVersions"
import { C } from "./ids"
import { LIST } from "./lists"

const DEMO = ["simples", "media", "complexa"] as const
type DemoKey = (typeof DEMO)[number]
const STAGE_KEYS = ["sol", "plan", "lib", "atm", "emi", "campo", "ent", "area"] as const
const SLOT_KEYS = ["sol", "plan", "planSeg", "lib", "libVer", "atm", "quente", "emi", "emi2", "campo", "ent", "area"] as const
type StageKey = (typeof STAGE_KEYS)[number]
type SlotKey = (typeof SLOT_KEYS)[number]

const idx = (m: DemoKey) => DEMO.indexOf(m)
const ID = {
  template: (m: DemoKey) => seedUuid(0x0a42, idx(m) + 1),
  version: (m: DemoKey) => seedUuid(0x0a43, idx(m) + 1),
  stage: (m: DemoKey, k: StageKey) => seedUuid(0x0a80 + idx(m), STAGE_KEYS.indexOf(k) + 1),
  slot: (m: DemoKey, k: SlotKey) => seedUuid(0x0a88 + idx(m), SLOT_KEYS.indexOf(k) + 1),
}

/** What a registry must supply: its cargos (by the role the demo needs), lists and scope. */
type RoleKey = "tecMec" | "tecEle" | "tecIns" | "coordMan" | "supTurno" | "coordArea" | "lider" | "operador" | "gerMan" | "tecSeg" | "gerArea" | "gerInd" | "vigia"
export interface DemoCfg { roles: Record<RoleKey, string>; perigosListId: string; locationTypeIds: string[]; assetTypeIds: string[] }
let R: DemoCfg["roles"] = C.role
let CFG: DemoCfg
const at = (day: string, time = "09:00:00") => `${day}T${time}-03:00`

const slot = (m: DemoKey, k: SlotKey, meaning: string, roleIds: string[], extra: Partial<SignSlot> = {}): SignSlot =>
  ({ id: ID.slot(m, k), meaning, kind: "cargo", roleIds: [...new Set(roleIds)], personId: null, min: 1, required: true, ...extra })
const stage = (m: DemoKey, k: StageKey, name: string, slots: SignSlot[], kind?: Stage["kind"]): Stage =>
  kind ? { id: ID.stage(m, k), name, kind, locked: true, slots } : { id: ID.stage(m, k), name, slots }

const SOLICITA = () => [R.tecMec, R.tecEle, R.tecIns, R.coordMan]
const EMITE = () => [R.supTurno, R.coordArea]
const EXECUTA = () => [R.lider, R.tecMec, R.tecEle, R.tecIns]
const ENCERRA = () => [R.supTurno, R.operador]

/** The fixed skeleton around the model's own stages. */
const skeleton = (m: DemoKey, free: Stage[], emissao: SignSlot[] = [slot(m, "emi", "Emite a PT", EMITE())]): Stage[] => [
  stage(m, "sol", "Solicitação", [slot(m, "sol", "Solicita a PT", SOLICITA())], "solicitacao"),
  ...free,
  stage(m, "emi", "Emissão", emissao, "emissao"),
  stage(m, "campo", "Aceite no campo", [slot(m, "campo", "Aceita no campo e orienta a equipe", EXECUTA())], "aceite_campo"),
  stage(m, "ent", "Entrega", [slot(m, "ent", "Entrega a área", EXECUTA())], "entrega"),
  stage(m, "area", "Aceite da área", [slot(m, "area", "Recebe a área e encerra a PT", ENCERRA())], "aceite_area"),
]

const sim = (id: string, label: string) => ({ id, label, blockOn: ["nao"], noteOn: ["na"] })
const confirmo = (id: string, label: string) => ({ id, label, blockOn: [], noteOn: [] })

const servico = (m: DemoKey, extra: FormItem[] = []): FormSection => ({
  id: `fs_${m}_sol`, title: "Dados do serviço", stageId: ID.stage(m, "sol"), items: [
    { id: `fi_${m}_os`, kind: "documento", label: "Ordem de serviço", required: true, pattern: "OS-######", attach: false, validity: false },
    { id: `fi_${m}_desc`, kind: "texto", label: "Descrição do serviço", required: true, long: true },
    ...extra,
  ],
})
const emissao = (m: DemoKey, text: string): FormSection => ({
  id: `fs_${m}_emi`, title: "Emissão", stageId: ID.stage(m, "emi"), items: [{ id: `fi_${m}_emi`, kind: "aviso", label: "Aviso", required: false, text }],
})
const campo = (m: DemoKey): FormSection => ({
  id: `fs_${m}_campo`, title: "Antes de começar", stageId: ID.stage(m, "campo"), items: [
    { id: `fi_${m}_campo`, kind: "verificacao", label: "Equipe e área", required: true, answers: "sim_nao_na", lines: [
      sim(`fl_${m}_dds`, "DDS feito com toda a equipe sobre os riscos desta PT"),
      sim(`fl_${m}_epi`, "EPI conferido em toda a equipe"),
    ] },
  ],
})
const entrega = (m: DemoKey): FormSection => ({
  id: `fs_${m}_ent`, title: "Área devolvida", stageId: ID.stage(m, "ent"), items: [
    { id: `fi_${m}_ent`, kind: "verificacao", label: "Antes de entregar", required: true, answers: "confirmo", lines: [
      confirmo(`fl_${m}_ent_pes`, "Pessoas, ferramentas e materiais retirados"),
      confirmo(`fl_${m}_ent_prot`, "Proteções e tampas recolocadas"),
    ] },
  ],
})

function version(m: DemoKey, maxWindowHours: number, st: Stage[], sections: FormSection[], note: string, separation: [SlotKey, SlotKey, boolean?][]): TemplateVersion {
  return {
    id: ID.version(m), number: 1, status: "ativa", createdAt: at("2026-10-20"), activatedAt: at("2026-10-22"), note,
    origin: "manual", sourceSha256: null, maxWindowHours, holdsEquipment: true,
    locationTypeIds: CFG.locationTypeIds, assetTypeIds: CFG.assetTypeIds, stages: st,
    separation: separation.map(([a, b, fixed]) => normalizeSeparation(ID.slot(m, a), ID.slot(m, b), fixed ?? false)),
    form: { sections },
  }
}
const tpl = (m: DemoKey, name: string, v: TemplateVersion): PermitTemplate =>
  ({ id: ID.template(m), name, retentionClass: "pt", revision: 1, updatedAt: at("2026-10-22"), versions: [v] })

/** The three models for a registry (the pulp mill or the original sample). */
export function buildDemoTemplates(cfg: DemoCfg): PermitTemplate[] {
  R = cfg.roles
  CFG = cfg
  /* ---------- 1. Simples: rotina sem energia perigosa ---------- */
  // Só o essencial: o que vai ser feito, uma conferência antes de começar e a área devolvida.
  const simples = tpl("simples", "Demo 1 · PT simples (serviço de rotina)", version("simples", 8,
    skeleton("simples", []),
    [
      { id: "fs_simples_sol", title: "Serviço", stageId: ID.stage("simples", "sol"), items: [
        { id: "fi_simples_desc", kind: "texto", label: "O que vai ser feito", required: true, long: true },
      ] },
      { id: "fs_simples_campo", title: "Antes de começar", stageId: ID.stage("simples", "campo"), items: [
        { id: "fi_simples_campo", kind: "verificacao", label: "Antes de começar", required: true, answers: "confirmo", lines: [
          confirmo("fl_simples_dds", "Equipe orientada sobre os riscos e com EPI"),
        ] },
      ] },
    ],
    "Só o esqueleto: solicitar, emitir, executar e devolver a área",
    [["emi", "campo", true], ["ent", "area", true]],
  ))

  /* ---------- 2. Média: manutenção com bloqueio de energia ---------- */
  // O simples + uma etapa de bloqueio: onde está bloqueado e a confirmação de energia zero.
  const media = tpl("media", "Demo 2 · PT média (manutenção com bloqueio)", version("media", 12,
    skeleton("media", [stage("media", "lib", "Bloqueio", [
      slot("media", "lib", "Aplica e confere o bloqueio", [R.tecMec, R.tecEle]),
    ])]),
    [
      { id: "fs_media_sol", title: "Serviço", stageId: ID.stage("media", "sol"), items: [
        { id: "fi_media_os", kind: "documento", label: "Ordem de serviço", required: true, pattern: "OS-######", attach: false, validity: false },
        { id: "fi_media_desc", kind: "texto", label: "O que vai ser feito", required: true, long: true },
      ] },
      { id: "fs_media_lib", title: "Bloqueio de energia", stageId: ID.stage("media", "lib"), items: [
        { id: "fi_media_iso", kind: "isolamento", label: "Pontos de bloqueio", required: true, minRows: 1 },
        { id: "fi_media_chk", kind: "verificacao", label: "Energia zero", required: true, answers: "sim_nao", lines: [
          { id: "fl_media_partida", label: "Tentativa de partida feita e sem movimento", blockOn: ["nao"], noteOn: [] },
        ] },
      ] },
      { id: "fs_media_campo", title: "Antes de começar", stageId: ID.stage("media", "campo"), items: [
        { id: "fi_media_campo", kind: "verificacao", label: "Antes de começar", required: true, answers: "confirmo", lines: [
          confirmo("fl_media_dds", "Equipe orientada sobre os riscos e com EPI"),
        ] },
      ] },
    ],
    "O simples com uma etapa de bloqueio",
    [["emi", "campo", true], ["ent", "area", true]],
  ))

  /* ---------- 3. Complexa: parada com trabalhos simultâneos ---------- */
  const TRABALHO_QUENTE = "fo_complexa_quente"
  const ESPACO = "fo_complexa_confinado"
  const complexa = tpl("complexa", "Demo 3 · PT complexa (parada com trabalhos simultâneos)", version("complexa", 72,
    skeleton("complexa", [
      stage("complexa", "plan", "Planejamento", [
        slot("complexa", "plan", "Aprova o planejamento", [R.coordMan, R.gerMan]),
        slot("complexa", "planSeg", "Avalia os riscos (segurança)", [R.tecSeg]),
      ]),
      stage("complexa", "lib", "Bloqueio", [
        slot("complexa", "lib", "Aplica o bloqueio", [R.tecMec, R.tecEle]),
        slot("complexa", "libVer", "Verifica o bloqueio", [R.operador, R.supTurno]),
      ]),
      stage("complexa", "atm", "Liberações especiais", [
        slot("complexa", "atm", "Mede a atmosfera e confere o resgate", [R.tecSeg], { requiredWhen: { itemId: "fi_complexa_trab", anyOf: [ESPACO] } }),
        slot("complexa", "quente", "Libera o trabalho a quente", [R.tecSeg, R.supTurno], { requiredWhen: { itemId: "fi_complexa_trab", anyOf: [TRABALHO_QUENTE] } }),
      ]),
    ], [
      slot("complexa", "emi", "Emite a PT", EMITE()),
      slot("complexa", "emi2", "Autoriza a parada (gerência)", [R.gerArea, R.gerInd]),
    ]),
    [
      servico("complexa", [
        { id: "fi_complexa_trab", kind: "marcacao", label: "Tipos de trabalho envolvidos", required: true, multiple: true, other: false, options: [
          { id: TRABALHO_QUENTE, label: "Trabalho a quente" }, { id: ESPACO, label: "Espaço confinado" }, { id: "fo_complexa_altura", label: "Em altura" }, { id: "fo_complexa_eletrico", label: "Elétrico" },
        ] },
        { id: "fi_complexa_perigos", kind: "marcacao", label: "Perigos identificados", required: true, multiple: true, other: true, options: [], listId: CFG.perigosListId },
        { id: "fi_complexa_equipes", kind: "numero", label: "Equipes trabalhando ao mesmo tempo", required: true, unit: "equipes", decimals: 0, negative: false, min: 1, max: 6 },
      ]),
      { id: "fs_complexa_plan", title: "Planejamento da parada", stageId: ID.stage("complexa", "plan"), items: [
        { id: "fi_complexa_apr", kind: "documento", label: "Análise preliminar de risco (APR)", required: true, pattern: "APR-####", attach: true, validity: true },
        { id: "fi_complexa_inicio", kind: "data", label: "Início da parada", required: true, notBeforeToday: true },
        { id: "fi_complexa_resp", kind: "pessoa", label: "Responsável pela coordenação em campo", required: true, multiple: false, roleId: R.lider, mustBeEligible: true },
        { id: "fi_complexa_exec", kind: "pessoa", label: "Executantes", required: true, multiple: true, mustBeEligible: true },
        { id: "fi_complexa_simops", kind: "verificacao", label: "Trabalhos simultâneos", required: true, answers: "sim_nao_na", lines: [
          sim("fl_complexa_seq", "Sequência das equipes combinada e registrada"),
          sim("fl_complexa_com", "Comunicação por rádio entre equipes e sala de controle"),
          sim("fl_complexa_rota", "Rota de fuga desobstruída e sinalizada"),
        ] },
      ] },
      { id: "fs_complexa_lib", title: "Bloqueio de energia", stageId: ID.stage("complexa", "lib"), items: [
        { id: "fi_complexa_iso", kind: "isolamento", label: "Pontos de bloqueio", required: true, minRows: 2 },
        { id: "fi_complexa_v", kind: "numero", label: "Tensão medida após o bloqueio", required: true, unit: "V", decimals: 1, negative: false, min: 0, max: 0 },
      ] },
      { id: "fs_complexa_atm", title: "Atmosfera (espaço confinado)", stageId: ID.stage("complexa", "atm"), items: [
        { id: "fi_complexa_gas", kind: "grupo", label: "Medições da atmosfera", required: true, minRows: 1, showWhen: { itemId: "fi_complexa_trab", anyOf: [ESPACO] }, columns: [
          { id: "fi_complexa_hora", kind: "horario", label: "Hora", required: true, seconds: false },
          { id: "fi_complexa_o2", kind: "numero", label: "O₂", required: true, unit: "%", decimals: 1, negative: false, min: 19.5, max: 23 },
          { id: "fi_complexa_lie", kind: "numero", label: "Inflamáveis", required: true, unit: "% LIE", decimals: 0, negative: false, min: 0, max: 10 },
          { id: "fi_complexa_h2s", kind: "numero", label: "H₂S", required: true, unit: "ppm", decimals: 0, negative: false, min: 0, max: 8 },
        ] },
        { id: "fi_complexa_vigia", kind: "pessoa", label: "Vigia", required: true, multiple: false, roleId: R.vigia, mustBeEligible: true, showWhen: { itemId: "fi_complexa_trab", anyOf: [ESPACO] } },
        { id: "fi_complexa_lie0", kind: "numero", label: "Explosividade no ponto do trabalho a quente", required: true, unit: "% LIE", decimals: 0, negative: false, min: 0, max: 0, showWhen: { itemId: "fi_complexa_trab", anyOf: [TRABALHO_QUENTE] } },
        { id: "fi_complexa_aviso", kind: "aviso", label: "Aviso", required: false, text: "Itens desta etapa aparecem conforme os tipos de trabalho marcados na solicitação." },
      ] },
      emissao("complexa", "Parada com várias equipes: a PT só é emitida com a autorização da gerência. Qualquer alarme ou mudança de condição para todas as equipes."),
      campo("complexa"),
      entrega("complexa"),
    ],
    "Planejamento, bloqueio, liberações condicionais e dupla assinatura na emissão",
    [["plan", "planSeg"], ["lib", "libVer"], ["emi", "emi2"], ["emi", "campo", true], ["ent", "area", true]],
  ))

  return [simples, media, complexa]
}

/** The pulp mill's version. */
export const demoTemplates: PermitTemplate[] = buildDemoTemplates({
  roles: C.role, perigosListId: LIST.perigos,
  locationTypeIds: [C.locationType.area, C.locationType.sala, C.locationType.ponto, C.locationType.patio],
  assetTypeIds: Object.values(C.assetType),
})

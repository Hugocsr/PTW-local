/**
 * The sample permit templates (three models, five versions), shaped like the database: uuids from
 * seedIds.ts (stage and slot ids unique in the unit, one set per version), instants with offset,
 * separations with slotA < slotB. Item ids are text (FORM_ID_RE) and stay the same across versions.
 */
import type { FormSpec, PermitTemplate, Stage, TemplateVersion } from "./modelTypes.ts"
import { ID } from "./seedIds.ts"
import { normalizeSeparation } from "../core/templateVersions.ts"

type V = keyof typeof ID.version

/** Stable item id from a label (≤ 64 characters, FORM_ID_RE), so the same field keeps its id across versions. */
export const itemId = (label: string) =>
  ("fi_" + label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_")).slice(0, 64)

const at = (day: string, time = "09:00:00") => `${day}T${time}-03:00`

/** A Solicitação section of plain text items (what the old models called "campos livres"). */
const dados = (v: V, labels: string[]): FormSpec => ({
  sections: [{ id: "fs_dados", title: "Dados do serviço", stageId: ID.stage(v, "sol"), items: labels.map((l) => ({ id: itemId(l), kind: "texto" as const, label: l, required: true, long: false })) }],
})

/** Painel v2/v3: each person's part of the form, in the stage where they sign it. */
const painelTurns = (v: V): FormSpec["sections"] => [
  { id: "fs_emi_local", title: "Conferência no local", stageId: ID.stage(v, "emi"), items: [
    { id: "fi_emi_conf", kind: "verificacao", label: "Antes de emitir", required: true, answers: "confirmo", lines: [
      { id: "fl_emi_etiq", label: "Cadeado e etiqueta conferidos no ponto de bloqueio", blockOn: [], noteOn: [] },
      { id: "fl_emi_tensao", label: "Ausência de tensão testada no ponto de trabalho", blockOn: [], noteOn: [] },
    ] },
    { id: "fi_emi_tensao_v", kind: "numero", label: "Tensão medida após o bloqueio", required: true, unit: "V", decimals: 1, negative: false, min: 0, max: 0 },
    { id: "fi_emi_hora", kind: "horario", label: "Hora do bloqueio", required: false, seconds: true },
    { id: "fi_emi_foto", kind: "anexo", label: "Foto do ponto de bloqueio", required: true, accept: ["foto"], min: 1, hint: "Mostre o cadeado e a etiqueta no disjuntor." },
  ] },
  { id: "fs_campo_inicio", title: "Antes de começar", stageId: ID.stage(v, "campo"), items: [
    { id: "fi_campo_check", kind: "verificacao", label: "Equipe e área", required: true, answers: "sim_nao_na", lines: [
      { id: "fl_campo_dds", label: "Equipe orientada sobre os riscos desta PT", blockOn: ["nao"], noteOn: ["na"] },
      { id: "fl_campo_epi", label: "EPI conferido em toda a equipe", blockOn: ["nao"], noteOn: ["na"] },
      { id: "fl_campo_isol", label: "Área isolada e sinalizada", blockOn: ["nao"], noteOn: ["na"] },
    ] },
    { id: "fi_campo_foto", kind: "anexo", label: "Foto da área de trabalho", required: true, accept: ["foto"], min: 1, hint: "A área isolada, antes de iniciar." },
  ] },
  { id: "fs_ent_area", title: "Área devolvida", stageId: ID.stage(v, "ent"), items: [
    { id: "fi_ent_conf", kind: "verificacao", label: "Antes de entregar", required: true, answers: "confirmo", lines: [
      { id: "fl_ent_pessoas", label: "Pessoas e ferramentas retiradas", blockOn: [], noteOn: [] },
      { id: "fl_ent_prot", label: "Proteções e tampas recolocadas", blockOn: [], noteOn: [] },
    ] },
    { id: "fi_ent_foto", kind: "anexo", label: "Foto ou vídeo da área limpa", required: true, accept: ["foto", "video"], min: 1, hint: "" },
    { id: "fi_ent_obs", kind: "texto", label: "Observações da entrega", required: false, long: true },
  ] },
]

const slot = (v: V, k: Parameters<typeof ID.slot>[1], meaning: string, roleIds: string | string[], required = true) =>
  ({ id: ID.slot(v, k), meaning, kind: "cargo" as const, roleIds: typeof roleIds === "string" ? [roleIds] : roleIds, personId: null, min: 1, required })
const R = ID.role

/** The four fixed stages after the free ones (Emissão → Aceite no campo → Entrega → Aceite da área). */
const tail = (v: V): Stage[] => [
  { id: ID.stage(v, "emi"), name: "Emissão", kind: "emissao", locked: true, slots: [slot(v, "emi", "Emite a PT", R.sup)] },
  { id: ID.stage(v, "campo"), name: "Aceite no campo", kind: "aceite_campo", locked: true, slots: [slot(v, "campo", "Aceita no campo", R.lider)] },
  { id: ID.stage(v, "ent"), name: "Entrega", kind: "entrega", locked: true, slots: [slot(v, "ent", "Entrega a área", R.lider)] },
  { id: ID.stage(v, "area"), name: "Aceite da área", kind: "aceite_area", locked: true, slots: [slot(v, "area", "Encerra a PT", R.sup)] },
]
const sol = (v: V): Stage => ({ id: ID.stage(v, "sol"), name: "Solicitação", kind: "solicitacao", slots: [slot(v, "sol", "Solicita a PT", R.tec)] })

const painelStages = (v: V): Stage[] => [
  sol(v),
  { id: ID.stage(v, "prep"), name: "Preparação", slots: [slot(v, "iso", "Registra o isolamento", R.tec), slot(v, "ver", "Verifica o isolamento", R.lider)] },
  ...tail(v),
]
const painelSeparation = (v: V) => [
  normalizeSeparation(ID.slot(v, "emi"), ID.slot(v, "campo"), true),
  normalizeSeparation(ID.slot(v, "iso"), ID.slot(v, "ver")),
]

const LT = ID.locationType
const AT = ID.assetType
const manual = { origin: "manual" as const, sourceSha256: null, holdsEquipment: true }

const painel = (v: V, number: number, status: TemplateVersion["status"], createdAt: string, activatedAt: string | null, note: string, form: FormSpec): TemplateVersion => ({
  id: ID.version[v], number, status, createdAt, activatedAt, note, ...manual,
  // From v2 on, a Painel permit's window is at most 12 hours (one long shift).
  maxWindowHours: v === "painel1" ? null : 12,
  locationTypeIds: [LT.sala, LT.ponto], assetTypeIds: [AT.painel, AT.modulo], workTypeIds: [ID.workType("Elétrico")],
  form, stages: painelStages(v), separation: painelSeparation(v),
})

const trab = (label: string) => ID.listItem("trabalho", label)

export const seedTemplates: PermitTemplate[] = [
  {
    id: ID.template.painel,
    name: "Intervenção desenergizada em painel",
    retentionClass: "pt", revision: 1, updatedAt: at("2026-11-05"),
    versions: [
      painel("painel1", 1, "arquivada", at("2026-03-04"), at("2026-03-10"), "Primeira versão em uso", dados("painel1", ["Ordem de serviço"])),
      painel("painel2", 2, "ativa", at("2026-08-20"), at("2026-09-01"), "Inclui limite do circuito e janela de trabalho",
        { sections: [...dados("painel2", ["Ordem de serviço", "Limite do circuito"]).sections, ...painelTurns("painel2")] }),
      // The draft adds one field to v2; it keeps v2's field checks (Emissão, Aceite no campo, Entrega).
      painel("painel3", 3, "rascunho", at("2026-11-05"), null, "Acrescenta o ponto de aterramento",
        { sections: [...dados("painel3", ["Ordem de serviço", "Limite do circuito", "Ponto de aterramento"]).sections, ...painelTurns("painel3")] }),
    ],
  },
  {
    id: ID.template.vapor,
    name: "Soldagem em tubulação de vapor",
    retentionClass: "pt", revision: 1, updatedAt: at("2026-09-20"),
    versions: [
      {
        id: ID.version.vapor1, number: 1, status: "ativa", createdAt: at("2026-09-15"), activatedAt: at("2026-09-20"), note: "Primeira versão em uso", ...manual, maxWindowHours: null,
        locationTypeIds: [LT.ponto],
        assetTypeIds: [AT.tubo, AT.valv],
        workTypeIds: [ID.workType("Trabalho a quente")],
        form: dados("vapor1", ["Método de soldagem", "Controle de faíscas", "Observações do trecho"]),
        stages: [
          sol("vapor1"),
          { id: ID.stage("vapor1", "prep"), name: "Preparação", slots: [
            slot("vapor1", "iso", "Confirma bloqueio e despressurização", R.tec),
            slot("vapor1", "inc", "Confere controles de incêndio", R.sup, false),
          ] },
          ...tail("vapor1"),
        ],
        separation: [
          normalizeSeparation(ID.slot("vapor1", "emi"), ID.slot("vapor1", "campo"), true),
          normalizeSeparation(ID.slot("vapor1", "iso"), ID.slot("vapor1", "inc")),
        ],
      },
    ],
  },
  {
    // The paper "Permit to Work" (A4, 6 sections) rebuilt on the common skeleton, no code of its own.
    id: ID.template.geral,
    name: "PT geral",
    retentionClass: "pt", revision: 1, updatedAt: at("2026-11-06"),
    versions: [
      {
        id: ID.version.geral1, number: 1, status: "rascunho", createdAt: at("2026-11-06"), activatedAt: null, note: "Formulário em papel convertido", ...manual,
        // The paper says a general permit lasts at most 3 days.
        maxWindowHours: 72,
        locationTypeIds: [LT.sala, LT.ponto],
        assetTypeIds: [AT.painel, AT.modulo, AT.tubo, AT.valv],
        workTypeIds: [ID.workType("Elétrico"), ID.workType("Em altura"), ID.workType("Espaço confinado"), ID.workType("Trabalho a quente"), ID.workType("Material perigoso")],
        stages: [
          sol("geral1"),
          // Either the technician or the team leader confirms the precautions (any of the two cargos).
          { id: ID.stage("geral1", "prep"), name: "Preparação", slots: [slot("geral1", "prep", "Confirma as precauções", [R.tec, R.lider])] },
          ...tail("geral1"),
        ],
        separation: [
          normalizeSeparation(ID.slot("geral1", "emi"), ID.slot("geral1", "campo"), true),
          normalizeSeparation(ID.slot("geral1", "ent"), ID.slot("geral1", "area"), true),
        ],
        form: {
          sections: [
            { id: "fs_ident", title: "Identificação da tarefa", stageId: ID.stage("geral1", "sol"), items: [
              { id: "fi_empresa", kind: "texto", label: "Empresa contratada", required: true, long: false },
              { id: "fi_trab", kind: "marcacao", label: "Tipos de trabalho", required: true, multiple: true, other: true, options: [], listId: ID.list.trabalho },
              // "Ventos fortes" stops the request, like a "Não" on a checklist line.
              { id: "fi_clima", kind: "marcacao", label: "Condição do tempo", required: true, multiple: false, other: false, options: [
                { id: "fo_clima_bom", label: "Bom" }, { id: "fo_clima_chuva", label: "Chuva fraca" }, { id: "fo_clima_vento", label: "Ventos fortes", blocks: true },
              ] },
            ] },
            { id: "fs_prec", title: "Avaliação de perigos e preparação", stageId: ID.stage("geral1", "prep"), items: [
              { id: "fi_prec", kind: "verificacao", label: "Precauções", required: true, answers: "sim_nao_na", lines: [
                { id: "fl_bloq", label: "Disjuntor ou seccionadora bloqueados, fusíveis retirados ou chave Castell removida", blockOn: ["nao"], noteOn: ["na"] },
                { id: "fl_teste", label: "Circuito testado e comprovado desenergizado", blockOn: ["nao"], noteOn: ["na"] },
                { id: "fl_mec", label: "Isolamento mecânico e energia armazenada dissipada", blockOn: ["nao"], noteOn: ["na"] },
                { id: "fl_tubo", label: "Tubulações drenadas, purgadas ou desconectadas", blockOn: ["nao"], noteOn: ["na"] },
                { id: "fl_ext", label: "Extintor disponível no local", blockOn: ["nao"], noteOn: ["na"] },
                { id: "fl_barr", label: "Sinalização e barreiras instaladas", blockOn: ["nao"], noteOn: ["na"] },
              ] },
              { id: "fi_docs", kind: "marcacao", label: "Outros documentos emitidos com a PT", required: false, multiple: true, other: true, options: [], listId: ID.list.docs },
              // The paper only has the columns SIM and N.A.: the answers come from the list "SIM / N.A.".
              { id: "fi_area", kind: "verificacao", label: "Área de trabalho", required: true, answers: "lista", answerListId: ID.list.simna, lines: [
                { id: "fl_area_lib", label: "Área liberada pela operação", blockOn: [], noteOn: [ID.listItem("simna", "N.A.")] },
                { id: "fl_area_ilum", label: "Iluminação adequada", blockOn: [], noteOn: [] },
              ] },
              { id: "fi_resid", kind: "texto", label: "Riscos residuais", required: true, long: true },
              { id: "fi_quente_pt", kind: "texto", label: "Nº da PT de trabalho a quente", required: true, long: false, showWhen: { itemId: "fi_trab", anyOf: [trab("Trabalho a quente")] } },
              { id: "fi_altura_resgate", kind: "anexo", label: "Plano de resgate em altura", required: true, accept: ["arquivo", "foto"], min: 1, hint: "O plano assinado pela área.", showWhen: { itemId: "fi_trab", anyOf: [trab("Em altura")] } },
              { id: "fi_o2", kind: "numero", label: "Oxigênio no ar (teste de gás)", required: true, unit: "%", decimals: 1, negative: false, min: 19.5, max: 23.5 },
              { id: "fi_prep_foto", kind: "anexo", label: "Foto do isolamento aplicado", required: true, accept: ["foto"], min: 1, hint: "Um registro por ponto de bloqueio." },
              { id: "fi_epi", kind: "marcacao", label: "EPI mínimo durante todo o trabalho", required: true, multiple: true, other: true, options: [], listId: ID.list.epi },
            ] },
            { id: "fs_emi", title: "Emissão", stageId: ID.stage("geral1", "emi"), items: [
              { id: "fi_emi_decl", kind: "aviso", label: "Aviso", required: false, text: "As precauções e os documentos acima são adequados para um sistema seguro de trabalho nesta tarefa." },
              { id: "fi_emi_transf", kind: "aviso", label: "Aviso", required: false, text: "Esta PT só é transferida sob supervisão pessoal de uma pessoa autorizada." },
            ] },
            { id: "fs_receb", title: "Recebimento", stageId: ID.stage("geral1", "campo"), items: [
              { id: "fi_receb", kind: "aviso", label: "Aviso", required: false, text: "Li, entendi e aceito minhas responsabilidades nesta PT." },
            ] },
            { id: "fs_entrega", title: "Entrega da área", stageId: ID.stage("geral1", "ent"), items: [
              { id: "fi_entrega", kind: "verificacao", label: "Antes de entregar", required: true, answers: "confirmo", lines: [
                { id: "fl_pessoas", label: "Todas as pessoas foram retiradas da área e do equipamento", blockOn: [], noteOn: [] },
                { id: "fl_ferr", label: "Ferramentas e resíduos removidos", blockOn: [], noteOn: [] },
                { id: "fl_prot", label: "Proteções e portas de acesso recolocadas", blockOn: [], noteOn: [] },
              ] },
              { id: "fi_ent_evid", kind: "anexo", label: "Foto, vídeo ou arquivo da área entregue", required: false, accept: ["foto", "video", "arquivo"], min: 1, hint: "" },
            ] },
            { id: "fs_cond", title: "Condição da área", stageId: ID.stage("geral1", "area"), items: [
              { id: "fi_cond", kind: "verificacao", label: "Encerramento", required: true, answers: "sim_nao", lines: [
                { id: "fl_oper", label: "A área e o equipamento podem voltar à operação", blockOn: [], noteOn: ["nao"] },
              ] },
              { id: "fi_cond_aviso", kind: "aviso", label: "Aviso", required: false, text: "Encerrar a PT não restaura o isolamento." },
            ] },
          ],
        },
      },
    ],
  },
]

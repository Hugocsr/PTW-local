// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templatePackage/types.ts; não edite (node scripts/sync-shared.mjs)
/**
 * The package `ptw.modelo/1` as TypeScript, and what an import returns.
 */
import type { AttachKind, FormItemKind, Location, OptionList, Person, PermitTemplate, StageKind, TemplateVersion, TypeDef } from "@/registry/types"

export const FORMATO = "ptw.modelo/1"

/* ====================================================================== */
/*  The package, as TypeScript (the JSON Schema below is the contract)     */
/* ====================================================================== */

export type Confianca = "alta" | "media" | "baixa"
/** Where a node came from in the source document. `trecho` is the literal text read there. */
export interface OrigemTrecho { arquivo?: string; pagina: number; trecho: string; bbox?: [number, number, number, number] }
interface Nota { origem?: OrigemTrecho; confianca?: Confianca; observacao?: string }

/** Show the item when the source item holds one of `valores`: option labels (marcação) or answers sim/nao/na/confirmo (a line of a verificação). */
export interface CondicaoPacote { item: string; linha?: string; valores: string[] }
/**
 * Labels are in the package's label language (`idioma.rotulos`, default pt-BR). When the document is in
 * another language, every translated text keeps the source wording in `*_original`, and the
 * provenance check compares that original (not the translation) with `origem.trecho`.
 */
/** `impede`: choosing this option stops the stage (e.g. "Classe 5", não forçável). */
export interface OpcaoPacote { rotulo: string; rotulo_original?: string; impede?: boolean; origem?: OrigemTrecho }
/**
 * `impede` / `justificar`: answers sim/nao/na/confirmo, or, with `respostas: "lista"`, the labels of
 * items of the answer list (`lista_respostas`).
 */
export interface LinhaPacote { ref?: string; rotulo: string; rotulo_original?: string; impede: string[]; justificar: string[]; origem?: OrigemTrecho; confianca?: Confianca; observacao?: string }

interface ItemBasePacote extends Nota { ref: string; rotulo: string; rotulo_original?: string; obrigatorio: boolean; mostrar_quando?: CondicaoPacote }
export type ItemPacote =
  | (ItemBasePacote & { tipo: "texto"; longo: boolean })
  | (ItemBasePacote & { tipo: "marcacao"; opcoes?: OpcaoPacote[]; lista?: string; multipla: boolean; outro: boolean })
  /** `respostas: "lista"`: each line answers one item of the list `lista_respostas` (declared in `listas`, e.g. "SIM / N.A."). */
  | (ItemBasePacote & { tipo: "verificacao"; respostas: "sim_nao_na" | "sim_nao" | "confirmo" | "lista"; lista_respostas?: string; linhas: LinhaPacote[] })
  | (Omit<ItemBasePacote, "rotulo" | "obrigatorio"> & { tipo: "aviso"; rotulo?: string; obrigatorio?: boolean; texto: string; texto_original?: string })
  | (ItemBasePacote & { tipo: "anexo"; aceita: AttachKind[]; minimo: number; dica: string })
  | (ItemBasePacote & { tipo: "numero"; unidade: string; unidade_original?: string; casas_decimais: number; negativo: boolean; minimo?: number; maximo?: number })
  | (ItemBasePacote & { tipo: "horario"; segundos: boolean })
  /** Nº da APR, ART, OS, procedimento: `formato` (# algarismo, A letra), documento anexado, validade. */
  | (ItemBasePacote & { tipo: "documento"; formato?: string; anexo: boolean; validade: boolean })
  /** Data dd/mm/aaaa; `minimo`/`maximo` em AAAA-MM-DD. */
  | (ItemBasePacote & { tipo: "data"; nao_antes_de_hoje: boolean; minimo?: string; maximo?: string })
  /** Pessoa(s) do cadastro (vigia, observador, executantes); `cargo` pelo nome. */
  | (ItemBasePacote & { tipo: "pessoa"; multipla: boolean; cargo?: string; deve_ser_elegivel: boolean })
  /** Pontos de isolamento (bloqueio/LOTO): ponto, energia, método, cadeado, energia zero, quem aplicou. */
  | (ItemBasePacote & { tipo: "isolamento"; minimo_linhas: number })
  /** Grupo repetível (tabela de medições): linhas com as mesmas colunas. */
  | (ItemBasePacote & { tipo: "grupo"; minimo_linhas: number; colunas: ColunaPacote[] })
/** A column of a group: texto, número, horário, marcação or verificação, without condition. */
export type ColunaPacote = Extract<ItemPacote, { tipo: "texto" | "numero" | "horario" | "marcacao" | "verificacao" }>

export interface SecaoPacote { ref?: string; titulo: string; titulo_original?: string; itens: ItemPacote[]; origem?: OrigemTrecho }
/**
 * `cargo`: one name, a list of names (any of them signs: "Gerente industrial, Gerente de manutenção ou
 * Gerente da área") or null = the paper does not say who signs (a pendência for the reviewer, never a
 * guess). `cargos` (a list) is accepted in its place; the importer normalizes both to a list.
 */
export interface AssinaturaPacote extends Nota { ref: string; significado: string; significado_original?: string; cargo?: string | string[] | null; cargos?: string[]; minimo: number; obrigatoria: boolean; /** Exigida só quando o item tem um destes valores. */ obrigatoria_quando?: CondicaoPacote }
export interface EtapaPacote { ref: string; nome: string; nome_original?: string; tipo?: StageKind; assinaturas: AssinaturaPacote[]; secoes: SecaoPacote[]; origem?: OrigemTrecho }
export interface SeparacaoPacote { a: string; b: string; travada?: boolean; origem?: OrigemTrecho }
export interface ListaPacote { nome: string; nome_original?: string; itens: string[]; /** Same order as `itens`, in the document's language. */ itens_originais?: string[]; origem?: OrigemTrecho }
export type CampoDoSistema = "numero_pt" | "local" | "ativos" | "data" | "janela" | "equipe" | "empresa" | "lider" | "escopo"
export interface CampoSistemaPacote { rotulo: string; rotulo_original?: string; corresponde_a: CampoDoSistema; origem: OrigemTrecho }
export type MotivoPendencia = "sem_tipo" | "ilegivel" | "fora_do_produto" | "duvida" | "sem_fonte"
export interface PendenciaPacote { descricao: string; trecho_original?: string; motivo: MotivoPendencia; sugestao?: string; onde?: string; origem?: OrigemTrecho }

export interface PacoteModelo {
  formato: typeof FORMATO
  origem: {
    /** documento = read from a plant's form (every node cites its source); exportacao = copied from another plant's app. */
    tipo: "documento" | "exportacao"
    arquivos: { arquivo: string; sha256: string; paginas: number }[]
    gerado_por: { ferramenta: string; modelo?: string; versao?: string }
    gerado_em: string
  }
  /** documento = language of the source (BCP 47, e.g. "en"); rotulos = language of the labels (default "pt-BR"). */
  idioma?: { documento: string; rotulos: string }
  /**
   * `prazo_maximo_horas`: longest work window of a permit of this model (absent = no limit).
   * `prende_equipamento`: the model's PTs take part in the equipment lock (absent = true); false for a
   * permit that coexists with another open PT on the same equipment (e.g. disabling an interlock).
   */
  modelo: { nome: string; nome_original?: string; descricao?: string; prazo_maximo_horas?: number; prende_equipamento?: boolean; escopo: { tipos_de_local: string[]; tipos_de_ativo: string[] } }
  listas: ListaPacote[]
  etapas: EtapaPacote[]
  separacoes: SeparacaoPacote[]
  campos_do_sistema: CampoSistemaPacote[]
  pendencias: PendenciaPacote[]
}

/** What the importer needs from the plant's registry. */
export interface Cadastro {
  roleTypes: TypeDef[]
  locationTypes: TypeDef[]
  assetTypes: TypeDef[]
  optionLists: OptionList[]
  templates: PermitTemplate[]
  /** With people (and locations), the import also warns about signatures nobody can give today. */
  people?: Person[]
  locations?: Location[]
}

/** `alvo` = id of the built element it concerns (stage, slot, section, item, list), so a screen can point at it. */
export interface Problema { nivel: "erro" | "aviso"; onde: string; mensagem: string; alvo?: string }
export interface Pendencia { descricao: string; motivo: MotivoPendencia | "etapa_ausente" | "sem_cargo"; onde?: string; sugestao?: string; origem?: OrigemTrecho; alvo?: string }

/** encontrado = exists in the plant · criar = the import will create it (types, lists and cargos) · sem_par = no match · nao_conferido = validated without a registry. */
export type Situacao = "encontrado" | "criar" | "sem_par" | "nao_conferido"
export interface Casamento { nome: string; situacao: Situacao; id?: string; nomeNaPlanta?: string }
export interface Resolucao {
  modelo: { nome: string; situacao: "novo" | "nova_versao"; id: string; versao: number } | null
  cargos: Casamento[]
  tiposDeLocal: Casamento[]
  tiposDeAtivo: Casamento[]
  listas: Casamento[]
}

/** What the app creates when the person confirms the import. The version is always a draft. */
export interface Rascunho {
  modeloId: string
  modeloNome: string
  /** true = a new draft version of a model the plant already has (same name). */
  modeloExistente: boolean
  versao: TemplateVersion
  listasNovas: OptionList[]
  tiposDeLocalNovos: TypeDef[]
  tiposDeAtivoNovos: TypeDef[]
  /** Cargos the plant does not have yet: created with nobody holding them. */
  cargosNovos: TypeDef[]
  /** Slot id → the cargo names the package asked for (a slot without one keeps roleIds empty). */
  cargoPedido: Record<string, string[]>
}

export interface Resumo {
  etapas: number
  assinaturas: number
  secoes: number
  itens: Record<FormItemKind, number>
  linhas: number
  separacoes: number
  camposDoSistema: number
  pendencias: number
  /** The model's two rules, as the draft will have them. */
  prendeEquipamento: boolean
  prazoMaximoHoras: number | null
}

export interface ResultadoImportacao {
  /** null when any problem is an error: nothing is created from a broken package. */
  rascunho: Rascunho | null
  /** What would be created, also when there are errors (null only when the schema fails): the review screen lists it. */
  previa: Rascunho | null
  problemas: Problema[]
  pendencias: Pendencia[]
  resolucao: Resolucao
  resumo: Resumo | null
}

export interface OpcoesImportacao {
  /** ISO date-time of the import (createdAt of the draft). */
  agora: string
  /** Id generator (tests pass a deterministic one); the default is uuidv7, as the database makes them. */
  novoId?: (prefixo: string) => string
  /** false = no registry to check against (CLI without --cadastro): cargos are not an error. */
  conferirCargos?: boolean
  /** The package file as the app read it (name, SHA-256 of its text); kept on the version. Default: "" and the SHA-256 of the package as JSON. */
  pacote?: { arquivo: string; sha256: string }
}

export interface OpcoesExportacao { agora: string; versaoId?: string; ferramenta?: string; versaoApp?: string }

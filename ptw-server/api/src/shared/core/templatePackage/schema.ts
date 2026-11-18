// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templatePackage/schema.ts; não edite (node scripts/sync-shared.mjs)
/**
 * JSON Schema (draft 2020-12) of the package, its validator and the JSON reader. The skill folder keeps a copy
 * of the schema on disk (`ptw-modelo.schema.json`); a test keeps the two identical.
 */
import type { AttachKind, FormItemKind, StageKind } from "@/registry/types"
import { MAX_DECIMALS } from "../form.ts"
import type { CampoDoSistema, MotivoPendencia } from "./types.ts"
import { FORMATO } from "./types.ts"

const STAGE_KINDS: StageKind[] = ["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"]
const ATTACH: AttachKind[] = ["foto", "video", "arquivo"]
const IDIOMA = "^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$"
const CAMPOS: CampoDoSistema[] = ["numero_pt", "local", "ativos", "data", "janela", "equipe", "empresa", "lider", "escopo"]
const MOTIVOS: MotivoPendencia[] = ["sem_tipo", "ilegivel", "fora_do_produto", "duvida", "sem_fonte"]

type Esquema = { [k: string]: unknown }
const texto = (max?: number): Esquema => (max ? { type: "string", minLength: 1, maxLength: max } : { type: "string", minLength: 1 })
const ref = (nome: string): Esquema => ({ $ref: `#/$defs/${nome}` })
const lista = (items: Esquema, minItems?: number): Esquema => (minItems ? { type: "array", items, minItems } : { type: "array", items })
const objeto = (required: string[], properties: Esquema, description?: string): Esquema => ({
  ...(description ? { description } : {}), type: "object", additionalProperties: false, required, properties,
})
const NOTA: Esquema = { origem: ref("origem_trecho"), confianca: { enum: ["alta", "media", "baixa"] }, observacao: { type: "string" } }
const ORIG: Esquema = { type: "string", minLength: 1 }
const COMUM: Esquema = { ref: texto(), rotulo: texto(200), rotulo_original: ORIG, obrigatorio: { type: "boolean" }, mostrar_quando: ref("condicao"), ...NOTA }
const item = (tipo: FormItemKind, props: Esquema, required: string[], description: string): Esquema =>
  objeto(["ref", "tipo", "rotulo", "obrigatorio", ...required], { tipo: { const: tipo }, ...COMUM, ...props }, description)

const DATA: Esquema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }
const OPCAO = (): Esquema => objeto(["rotulo"], { rotulo: texto(200), rotulo_original: ORIG, impede: { type: "boolean" }, origem: ref("origem_trecho") })
const VERIFICACAO = (): Esquema => ({ respostas: { enum: ["sim_nao_na", "sim_nao", "confirmo", "lista"] }, lista_respostas: texto(120), linhas: lista(ref("linha"), 1) })
/** The kinds a group column may have (same shape as the items). */
const COLUNAS = (): Esquema[] => [
  item("texto", { longo: { type: "boolean" } }, ["longo"], "Coluna de texto."),
  item("marcacao", { opcoes: lista(OPCAO()), lista: texto(120), multipla: { type: "boolean" }, outro: { type: "boolean" } }, ["multipla", "outro"], "Coluna de marcação."),
  item("verificacao", VERIFICACAO(), ["respostas", "linhas"], "Coluna de verificação."),
  item("numero", {
    unidade: { type: "string" }, unidade_original: { type: "string" },
    casas_decimais: { type: "integer", minimum: 0, maximum: MAX_DECIMALS }, negativo: { type: "boolean" },
    minimo: { type: "number" }, maximo: { type: "number" },
  }, ["unidade", "casas_decimais", "negativo"], "Coluna de número (faixa impede a etapa)."),
  item("horario", { segundos: { type: "boolean" } }, ["segundos"], "Coluna de horário."),
]

export const ESQUEMA_PTW_MODELO: Esquema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "ptw.modelo/1",
  title: "Pacote de modelo de PT (ptw.modelo/1)",
  description: "Modelo de Permissão de Trabalho portátil: lido de um formulário da planta ou exportado de outra planta. Referências por nome. O app importa como rascunho; uma pessoa revisa e ativa.",
  ...objeto(["formato", "origem", "modelo", "listas", "etapas", "separacoes", "campos_do_sistema", "pendencias"], {
    formato: { const: FORMATO },
    origem: objeto(["tipo", "arquivos", "gerado_por", "gerado_em"], {
      tipo: { enum: ["documento", "exportacao"] },
      arquivos: lista(objeto(["arquivo", "sha256", "paginas"], { arquivo: texto(), sha256: { type: "string", pattern: "^[0-9a-f]{64}$" }, paginas: { type: "integer", minimum: 1 } })),
      gerado_por: objeto(["ferramenta"], { ferramenta: texto(200), modelo: texto(200), versao: { type: "string" } }),
      gerado_em: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?)?$" },
    }),
    idioma: objeto(["documento", "rotulos"], { documento: { type: "string", maxLength: 35, pattern: IDIOMA }, rotulos: { type: "string", maxLength: 35, pattern: IDIOMA } }, "Idioma do documento e dos rótulos (padrão pt-BR). Rótulos traduzidos guardam o texto original em *_original."),
    modelo: objeto(["nome", "escopo"], {
      nome: texto(120),
      politica_eletrica: objeto(["standard", "procedure", "riskAssessment", "authorizations", "workKind", "isolation", "restoration"], {
        standard: { enum: ["vigente2019", "preparacao2027"] }, procedure: texto(64), riskAssessment: texto(64), authorizations: texto(64), workKind: texto(64),
        isolation: lista(texto(64), 1), restoration: lista(texto(64), 1),
        shift: objeto(["startDate", "startTime", "endDate", "endTime"], { startDate: texto(64), startTime: texto(64), endDate: texto(64), endTime: texto(64) }),
      }, "Controles elétricos versionados; referências aos itens do pacote, preservadas na importação."),
      nome_original: ORIG,
      descricao: { type: "string" },
      prazo_maximo_horas: { type: "number", minimum: 1, maximum: 8784 },
      prende_equipamento: { type: "boolean", description: "Falso: a PT deste modelo pode existir junto com outra PT aberta no mesmo equipamento (ex.: desabilitação de intertravamento). Ausente = verdadeiro." },
      escopo: objeto(["tipos_de_local", "tipos_de_ativo"], { tipos_de_local: lista(texto(80)), tipos_de_ativo: lista(texto(80)) }, "Tipos de local e de ativo aceitos, pelo nome."),
    }),
    listas: lista(objeto(["nome", "itens"], { nome: texto(120), nome_original: ORIG, itens: lista(texto(200)), itens_originais: lista(texto()), origem: ref("origem_trecho") }, "Listas de opções (EPI, perigos…) usadas por itens de marcação e respostas de verificação. Sem itens: a planta inclui antes de ativar.")),
    etapas: lista(ref("etapa"), 1),
    separacoes: lista(objeto(["a", "b"], { a: texto(), b: texto(), travada: { type: "boolean" }, origem: ref("origem_trecho") }, "Duas assinaturas (refs) que precisam ser de pessoas diferentes.")),
    campos_do_sistema: lista(objeto(["rotulo", "corresponde_a", "origem"], { rotulo: texto(), rotulo_original: ORIG, corresponde_a: { enum: CAMPOS }, origem: ref("origem_trecho") }, "O que o papel pede e o sistema já guarda (nº da PT, local, data…): não vira item.")),
    pendencias: lista(ref("pendencia")),
  }),
  $defs: {
    origem_trecho: objeto(["pagina", "trecho"], {
      arquivo: texto(),
      pagina: { type: "integer", minimum: 1 },
      trecho: texto(),
      bbox: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
    }, "Página e texto literal de onde o nó veio."),
    condicao: objeto(["item", "valores"], { item: texto(), linha: texto(), valores: lista(texto(), 1) }, "Mostrar quando o item (ou a linha) tem um destes valores."),
    pendencia: objeto(["descricao", "motivo"], { descricao: texto(), trecho_original: ORIG, motivo: { enum: MOTIVOS }, sugestao: { type: "string" }, onde: { type: "string" }, origem: ref("origem_trecho") }),
    assinatura: objeto(["ref", "significado", "minimo", "obrigatoria"], {
      ref: texto(), significado: texto(120), significado_original: ORIG,
      cargo: { type: ["string", "array", "null"], minLength: 1, maxLength: 80, items: texto(80), minItems: 1, maxItems: 20 },
      cargos: { type: "array", items: texto(80), minItems: 1, maxItems: 20 },
      minimo: { type: "integer", minimum: 1, maximum: 20 }, obrigatoria: { type: "boolean" }, obrigatoria_quando: ref("condicao"), ...NOTA,
    }),
    etapa: objeto(["ref", "nome", "assinaturas", "secoes"], {
      ref: texto(), nome: texto(80), nome_original: ORIG, tipo: { enum: STAGE_KINDS },
      assinaturas: lista(ref("assinatura")), secoes: lista(ref("secao")), origem: ref("origem_trecho"),
    }),
    secao: objeto(["titulo", "itens"], { ref: texto(), titulo: texto(120), titulo_original: ORIG, itens: lista(ref("item")), origem: ref("origem_trecho") }),
    linha: objeto(["rotulo", "impede", "justificar"], {
      ref: texto(), rotulo: texto(300), rotulo_original: ORIG, impede: lista(texto(200)), justificar: lista(texto(200)), ...NOTA,
    }),
    coluna: { anyOf: COLUNAS() },
    item: {
      anyOf: [
        item("texto", { longo: { type: "boolean" } }, ["longo"], "Texto livre (curto ou longo)."),
        item("marcacao", { opcoes: lista(OPCAO()), lista: texto(120), multipla: { type: "boolean" }, outro: { type: "boolean" } }, ["multipla", "outro"], "Marcar opções próprias (opcoes; impede = a opção barra a etapa) ou de uma lista (lista = nome)."),
        item("verificacao", VERIFICACAO(), ["respostas", "linhas"], "Checklist: cada linha responde Sim/Não/N/A, Confirmo, ou os itens de uma lista (respostas = lista, lista_respostas = nome)."),
        objeto(["ref", "tipo", "texto"], { tipo: { const: "aviso" }, ...COMUM, texto: texto(500), texto_original: ORIG }, "Texto impresso sem resposta (declaração, nota)."),
        item("anexo", { aceita: lista({ enum: ATTACH }, 1), minimo: { type: "integer", minimum: 1 }, dica: { type: "string" } }, ["aceita", "minimo", "dica"], "Foto, vídeo ou arquivo pedido no local."),
        item("numero", {
          unidade: { type: "string" }, unidade_original: { type: "string" },
          casas_decimais: { type: "integer", minimum: 0, maximum: MAX_DECIMALS }, negativo: { type: "boolean" },
          minimo: { type: "number" }, maximo: { type: "number" },
        }, ["unidade", "casas_decimais", "negativo"], "Valor medido com unidade; fora da faixa impede a etapa."),
        item("horario", { segundos: { type: "boolean" } }, ["segundos"], "Hora do dia (hh:mm ou hh:mm:ss)."),
        item("documento", { formato: { type: "string", minLength: 1, maxLength: 30, pattern: "\\S" }, anexo: { type: "boolean" }, validade: { type: "boolean" } }, ["anexo", "validade"], "Documento externo (Nº da APR, ART, OS, procedimento): número ou código, opcionalmente no formato (# algarismo, A letra), anexo e validade."),
        item("data", { nao_antes_de_hoje: { type: "boolean" }, minimo: DATA, maximo: DATA }, ["nao_antes_de_hoje"], "Data (dd/mm/aaaa); fora da regra impede a etapa."),
        item("pessoa", { multipla: { type: "boolean" }, cargo: texto(80), deve_ser_elegivel: { type: "boolean" } }, ["multipla", "deve_ser_elegivel"], "Pessoa(s) do cadastro (vigia, observador de incêndio, executantes), opcionalmente de um cargo."),
        item("isolamento", { minimo_linhas: { type: "integer", minimum: 0, maximum: 50 } }, ["minimo_linhas"], "Pontos de isolamento (bloqueio/LOTO): ponto ou tag, tipo de energia, método, nº do cadeado/etiqueta, energia zero verificada, aplicado por."),
        item("grupo", { minimo_linhas: { type: "integer", minimum: 0, maximum: 50 }, colunas: lista(ref("coluna"), 1) }, ["minimo_linhas", "colunas"], "Grupo repetível (tabela de medições): cada linha responde as mesmas colunas (texto, número, horário, marcação, verificação)."),
      ],
    },
  },
}

/** The schema as the file on disk holds it. */
export const esquemaJson = () => JSON.stringify(ESQUEMA_PTW_MODELO, null, 2) + "\n"

/* ---------- a small validator for exactly the keywords the schema uses ---------- */

const TYPE_WORD: Record<string, string> = { string: "texto", integer: "número inteiro", number: "número", boolean: "verdadeiro ou falso", object: "objeto", array: "lista", null: "null" }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const hasType = (v: unknown, t: string) =>
  t === "null" ? v === null : t === "array" ? Array.isArray(v) : t === "object" ? isObj(v) : t === "integer" ? Number.isInteger(v) : t === "number" ? typeof v === "number" && Number.isFinite(v) : typeof v === t

function checkSchema(v: unknown, s: Esquema, path: string, out: string[]): void {
  if (typeof s.$ref === "string") s = (ESQUEMA_PTW_MODELO.$defs as Record<string, Esquema>)[s.$ref.replace("#/$defs/", "")]
  if (Array.isArray(s.anyOf)) {
    const branches = s.anyOf as Esquema[]
    const tipos: unknown[] = branches.map((b) => ((b.properties as Esquema | undefined)?.tipo as Esquema | undefined)?.const)
    if (!tipos.includes(undefined) && isObj(v)) {
      const i = tipos.indexOf(v.tipo)
      if (i === -1) out.push(`${path}.tipo: tipo de item desconhecido ${JSON.stringify(v.tipo)} (use: ${tipos.join(", ")})`)
      else checkSchema(v, branches[i], path, out)
      return
    }
    const tries = branches.map((b) => { const e: string[] = []; checkSchema(v, b, path, e); return e })
    if (!tries.some((e) => e.length === 0)) out.push(...tries.reduce((a, b) => (a.length <= b.length ? a : b)))
    return
  }
  if ("const" in s && v !== s.const) { out.push(`${path}: deve ser ${JSON.stringify(s.const)}`); return }
  if (Array.isArray(s.enum) && !s.enum.includes(v)) { out.push(`${path}: valor ${JSON.stringify(v)} não permitido (use: ${s.enum.join(", ")})`); return }
  if (s.type) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string]
    if (!types.some((t) => hasType(v, t))) { out.push(`${path}: deve ser ${types.map((t) => TYPE_WORD[t]).join(" ou ")}`); return }
  }
  if (typeof v === "string") {
    if (typeof s.minLength === "number" && v.trim().length < s.minLength) out.push(`${path}: vazio`)
    if (typeof s.maxLength === "number" && v.length > s.maxLength) out.push(`${path}: mais de ${s.maxLength} caracteres`)
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) out.push(`${path}: formato inválido`)
  }
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) out.push(`${path}: mínimo ${s.minimum}`)
    if (typeof s.maximum === "number" && v > s.maximum) out.push(`${path}: máximo ${s.maximum}`)
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === "number" && v.length < s.minItems) out.push(`${path}: precisa de pelo menos ${s.minItems}`)
    if (typeof s.maxItems === "number" && v.length > s.maxItems) out.push(`${path}: no máximo ${s.maxItems}`)
    if (s.items) v.forEach((x, i) => checkSchema(x, s.items as Esquema, `${path}[${i}]`, out))
  }
  if (isObj(v) && s.properties) {
    const props = s.properties as Record<string, Esquema>
    for (const k of (s.required as string[] | undefined) ?? []) if (!(k in v)) out.push(`${path}.${k}: obrigatório`)
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (props[k]) checkSchema(x, props[k], `${path}.${k}`, out)
      else if (s.additionalProperties === false) out.push(`${path}.${k}: campo desconhecido`)
    }
  }
}

/** Schema errors in Portuguese, with the JSON path of each (empty = valid). */
export function errosDeEsquema(v: unknown): string[] {
  const out: string[] = []
  checkSchema(v, ESQUEMA_PTW_MODELO, "pacote", out)
  return out
}

/** JSON.parse with a message a person can act on. */
export function lerPacote(textoJson: string): { pacote: unknown; erro: string | null } {
  try { return { pacote: JSON.parse(textoJson.charCodeAt(0) === 0xfeff ? textoJson.slice(1) : textoJson), erro: null } } catch (e) { return { pacote: null, erro: `O arquivo não é JSON válido: ${(e as Error).message}` } }
}

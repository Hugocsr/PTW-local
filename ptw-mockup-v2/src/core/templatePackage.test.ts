import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import { isUuid } from "@/lib/id"
import { sha256Hex } from "./audit"
import type { FormItem, OptionList, PermitTemplate, TemplateVersion } from "@/registry/types"
import { optionsOf } from "./form"
import { esquemaJson, errosDeEsquema, exportarModelo, importarModelo, relatorio, rotuloNoTrecho, validarPacote, type ItemPacote, type PacoteModelo } from "./templatePackage"
import schemaOnDisk from "../../../.claude/skills/ptw-modelo-de-formulario/ptw-modelo.schema.json?raw"
import exampleOnDisk from "../../../.claude/skills/ptw-modelo-de-formulario/exemplos/intervencao-desenergizada-em-painel.ptw-modelo.json?raw"

const AGORA = "2026-11-08T10:00:00-03:00"
const tpl = (id: string) => seed.templates.find((t) => t.id === id)!
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
/** Every slot's role exists, the plant is the seed: a second plant identical to the first. */
const otherPlant = { ...seed, templates: [] as PermitTemplate[] }

/** A version with every id replaced by what it means (labels, names), so two plants compare equal. */
function structure(v: TemplateVersion, lists: OptionList[]) {
  const slotName = new Map(v.stages.flatMap((s) => s.slots.map((sl) => [sl.id, sl.meaning])))
  const stageName = new Map(v.stages.map((s) => [s.id, s.name]))
  const items = (v.form?.sections ?? []).flatMap((s) => s.items)
  const itemLabel = (id: string) => items.find((i) => i.id === id)
  const item = (i: FormItem) => {
    const { id: _id, showWhen, ...rest } = i
    void _id
    const out: Record<string, unknown> = { ...rest }
    if (i.kind === "verificacao") out.lines = i.lines.map(({ id: _l, ...l }) => (void _l, l))
    if (i.kind === "marcacao") out.options = i.options.map((o) => o.label)
    if (showWhen) {
      const src = itemLabel(showWhen.itemId)!
      const vals = src.kind === "marcacao" ? showWhen.anyOf.map((a) => optionsOf(src, lists, true).find((o) => o.id === a)?.label) : showWhen.anyOf
      out.showWhen = { item: src.label, line: src.kind === "verificacao" ? src.lines.find((l) => l.id === showWhen.lineId)?.label : undefined, vals }
    }
    return out
  }
  return {
    scope: [[...v.locationTypeIds].sort(), [...v.assetTypeIds].sort()],
    stages: v.stages.map((s) => ({ name: s.name, kind: s.kind, locked: !!s.locked, slots: s.slots.map(({ id: _s, ...sl }) => (void _s, sl)) })),
    separation: v.separation.map((r) => [slotName.get(r.slotA), slotName.get(r.slotB)].sort().concat(String(!!r.locked))).sort(),
    form: (v.form?.sections ?? []).map((s) => ({ title: s.title, stage: s.stageId && stageName.get(s.stageId), items: s.items.map(item) })),
  }
}

/** A minimal package read from a document, with provenance on every node. */
function docPackage(items: ItemPacote[], extra: Partial<PacoteModelo> = {}): PacoteModelo {
  const o = (trecho: string) => ({ pagina: 1, trecho })
  return {
    formato: "ptw.modelo/1",
    origem: { tipo: "documento", arquivos: [{ arquivo: "pt.pdf", sha256: "a".repeat(64), paginas: 2 }], gerado_por: { ferramenta: "teste" }, gerado_em: AGORA },
    modelo: { nome: "PT de teste", escopo: { tipos_de_local: ["Sala"], tipos_de_ativo: ["Painel / CCM"] } },
    listas: [],
    etapas: [
      { ref: "sol", nome: "Solicitação", tipo: "solicitacao", assinaturas: [{ ref: "a_sol", significado: "Solicita a PT", cargo: "Técnico de manutenção", minimo: 1, obrigatoria: true, origem: o("Solicitante") }], secoes: [{ titulo: "Dados", itens: items }] },
      { ref: "emi", nome: "Emissão", tipo: "emissao", assinaturas: [{ ref: "a_emi", significado: "Emite a PT", cargo: "Supervisora de área", minimo: 1, obrigatoria: true, origem: o("Emitente") }], secoes: [] },
      { ref: "campo", nome: "Aceite no campo", tipo: "aceite_campo", assinaturas: [{ ref: "a_campo", significado: "Aceita no campo", cargo: "Líder de equipe", minimo: 1, obrigatoria: true, origem: o("Executante") }], secoes: [] },
      { ref: "ent", nome: "Entrega", tipo: "entrega", assinaturas: [{ ref: "a_ent", significado: "Entrega a área", cargo: "Líder de equipe", minimo: 1, obrigatoria: true, origem: o("Entrega") }], secoes: [] },
      { ref: "area", nome: "Aceite da área", tipo: "aceite_area", assinaturas: [{ ref: "a_area", significado: "Encerra a PT", cargo: "Supervisora de área", minimo: 1, obrigatoria: true, origem: o("Encerramento") }], secoes: [] },
    ],
    separacoes: [],
    campos_do_sistema: [],
    pendencias: [],
    ...extra,
  }
}
const texto = (ref: string, rotulo: string, trecho = rotulo): ItemPacote => ({ ref, tipo: "texto", rotulo, obrigatorio: true, longo: false, origem: { pagina: 1, trecho } })
const erros = (r: ReturnType<typeof importarModelo>) => r.problemas.filter((p) => p.nivel === "erro").map((p) => `${p.onde}: ${p.mensagem}`)

describe("ptw.modelo/1 · esquema", () => {
  it("the schema file in the skill folder is the one in code", () => {
    expect(schemaOnDisk.replace(/\r\n/g, "\n")).toBe(esquemaJson())
  })

  it("reports schema errors with their path, in Portuguese", () => {
    const bad = clone(docPackage([texto("t1", "Ordem de serviço")])) as unknown as Record<string, unknown>
    bad.formato = "ptw.modelo/2"
    delete (bad.modelo as Record<string, unknown>).escopo
    ;(bad.etapas as Record<string, unknown>[])[0].extra = 1
    const e = errosDeEsquema(bad)
    expect(e).toContain('pacote.formato: deve ser "ptw.modelo/1"')
    expect(e).toContain("pacote.modelo.escopo: obrigatório")
    expect(e).toContain("pacote.etapas[0].extra: campo desconhecido")
    const r = importarModelo(bad, seed, { agora: AGORA })
    expect(r.rascunho).toBeNull()
    expect(r.resumo).toBeNull()
  })

  it("names an unknown item kind and checks fields by kind", () => {
    const p = docPackage([{ ...texto("t1", "Ordem"), tipo: "assinatura_digital" } as unknown as ItemPacote, { ref: "n", tipo: "numero", rotulo: "O2", obrigatorio: true, unidade: "%", casas_decimais: 7, negativo: false, origem: { pagina: 1, trecho: "O2" } }])
    const e = errosDeEsquema(p)
    expect(e.some((x) => x.includes("itens[0].tipo: tipo de item desconhecido \"assinatura_digital\""))).toBe(true)
    expect(e).toContain("pacote.etapas[0].secoes[0].itens[1].casas_decimais: máximo 4")
  })
})

describe("ptw.modelo/1 · ida e volta", () => {
  it("Intervenção desenergizada em painel: export → JSON → import equals the structure, as a draft", () => {
    for (const ver of tpl(ID.template.painel).versions) {
      const pkg = JSON.parse(JSON.stringify(exportarModelo(tpl(ID.template.painel), seed, { agora: AGORA, versaoId: ver.id })))
      expect(errosDeEsquema(pkg)).toEqual([])
      const r = importarModelo(pkg, otherPlant, { agora: AGORA })
      expect(erros(r)).toEqual([])
      expect(r.rascunho!.versao.status).toBe("rascunho")
      expect(r.rascunho!.versao.activatedAt).toBeNull()
      expect(r.rascunho!.modeloExistente).toBe(false)
      expect(r.rascunho!.listasNovas).toEqual([])
      expect(structure(r.rascunho!.versao, seed.optionLists)).toEqual(structure(ver, seed.optionLists))
    }
  })

  it("PT geral (lists and conditions) also round-trips", () => {
    const pkg = exportarModelo(tpl(ID.template.geral), seed, { agora: AGORA })
    const r = importarModelo(clone(pkg), otherPlant, { agora: AGORA })
    expect(erros(r)).toEqual([])
    expect(structure(r.rascunho!.versao, seed.optionLists)).toEqual(structure(tpl(ID.template.geral).versions[0], seed.optionLists))
  })

  it("into a plant that already has the model: a new draft version, never active", () => {
    const r = importarModelo(exportarModelo(tpl(ID.template.painel), seed, { agora: AGORA }), seed, { agora: AGORA })
    expect(r.rascunho!.modeloExistente).toBe(true)
    expect(r.rascunho!.modeloId).toBe(ID.template.painel)
    expect(r.rascunho!.versao.number).toBe(4)
    expect(r.rascunho!.versao.status).toBe("rascunho")
  })

  it("into a plant without the lists and types: they are proposed for creation", () => {
    const bare = { ...seed, templates: [], optionLists: [], locationTypes: [], assetTypes: [] }
    const r = importarModelo(exportarModelo(tpl(ID.template.geral), seed, { agora: AGORA }), bare, { agora: AGORA })
    expect(erros(r)).toEqual([])
    expect(r.rascunho!.listasNovas.map((l) => l.name).sort()).toEqual(["Documentos com a PT", "EPI", "SIM / N.A.", "Tipos de trabalho"])
    expect(r.resolucao.tiposDeLocal.every((c) => c.situacao === "criar")).toBe(true)
    // the condition now points at the new list's item
    const quente = r.rascunho!.versao.form!.sections.flatMap((s) => s.items).find((i) => i.label === "Nº da PT de trabalho a quente")!
    const trab = r.rascunho!.listasNovas.find((l) => l.name === "Tipos de trabalho")!
    expect(quente.showWhen!.anyOf).toEqual([trab.items.find((x) => x.label === "Trabalho a quente")!.id])
  })
})

describe("ptw.modelo/1 · checagens", () => {
  it("a clean document package passes", () => {
    const r = importarModelo(docPackage([texto("t1", "Ordem de serviço", "Ordem de Serviço nº ______")]), seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    // product rule added: Emissão ≠ Aceite no campo, locked
    expect(r.rascunho!.versao.separation).toHaveLength(1)
    expect(r.rascunho!.versao.separation[0].locked).toBe(true)
  })

  it("a form that disables a protection must say whether it holds the equipment; the summary carries the model's rules", () => {
    const warns = (p: ReturnType<typeof docPackage>) => importarModelo(p, seed, { agora: AGORA }).problemas.filter((x) => x.alvo === "modelo.prende_equipamento")
    const p = docPackage([texto("t1", "Ordem de serviço")])
    expect(warns(p)).toEqual([])
    p.modelo.nome = "Desabilitação de intertravamento / By-pass"
    expect(warns(p).map((x) => x.nivel)).toEqual(["aviso"])
    p.modelo.prende_equipamento = false
    p.modelo.prazo_maximo_horas = 72
    const r = importarModelo(p, seed, { agora: AGORA })
    expect(warns(p)).toEqual([])
    expect(r.resumo).toMatchObject({ prendeEquipamento: false, prazoMaximoHoras: 72 })
    expect(r.rascunho!.versao.holdsEquipment).toBe(false)
    expect(relatorio(r)).toContain("não prende o equipamento")
    p.modelo.prende_equipamento = true
    expect(warns(p)).toEqual([])
  })

  it("an unknown cargo is created (with a warning); a cargo the paper does not name is a pendência", () => {
    const p = docPackage([texto("t1", "Ordem de serviço")])
    p.etapas[1].assinaturas[0].cargo = "Engenheiro de turno"
    p.etapas[2].assinaturas[0].cargo = null
    const r = importarModelo(p, seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    expect(r.rascunho!.cargosNovos.map((c) => c.label)).toEqual(["Engenheiro de turno"])
    const slot = r.rascunho!.versao.stages[1].slots[0]
    expect(slot.roleIds).toEqual([r.rascunho!.cargosNovos[0].id])
    expect(r.problemas.some((x) => x.nivel === "aviso" && x.onde === "Cargo “Engenheiro de turno”" && x.alvo === slot.id)).toBe(true)
    expect(r.resolucao.cargos.find((c) => c.nome === "Engenheiro de turno")!.situacao).toBe("criar")
    expect(r.pendencias.some((x) => x.motivo === "sem_cargo")).toBe(true)
    // without a registry (the skill's CLI) cargos are not checked
    expect(erros(validarPacote(p))).toEqual([])
  })

  it("flags an invented item: the label is not in the quoted excerpt", () => {
    const r = importarModelo(docPackage([texto("t1", "Teste de ausência de tensão", "Ordem de serviço nº")]), seed, { agora: AGORA })
    expect(r.rascunho).toBeNull()
    expect(erros(r)[0]).toMatch(/não aparece no trecho citado/)
    expect(rotuloNoTrecho("Cadeado e etiqueta conferidos", "( ) CADEADO E ETIQUETA CONFERIDO NO PONTO")).toBe(true)
    expect(rotuloNoTrecho("Extintor disponível", "Sinalização instalada")).toBe(false)
  })

  it("a document package without provenance is an error; an exported one needs none", () => {
    const { origem: _o, ...noOrigin } = texto("t1", "Ordem") as Extract<ItemPacote, { tipo: "texto" }>
    void _o
    const p = docPackage([noOrigin as ItemPacote])
    expect(erros(importarModelo(p, seed, { agora: AGORA }))).toContain("Etapa “Solicitação” › Seção “Dados” › “Ordem”: Sem origem (página e trecho do documento)")
    const page = docPackage([{ ...texto("t1", "Ordem"), origem: { pagina: 5, trecho: "Ordem" } }])
    expect(erros(importarModelo(page, seed, { agora: AGORA }))[0]).toMatch(/Página 5 não existe/)
  })

  it("número: decimals of the range, negatives, min ≤ max, unit outside the table", () => {
    const n = (extra: object): ItemPacote => ({ ref: "o2", tipo: "numero", rotulo: "Oxigênio", obrigatorio: true, unidade: "%", casas_decimais: 1, negativo: false, origem: { pagina: 1, trecho: "Oxigênio (O2) 19,5 a 23,5 %" }, ...extra }) as ItemPacote
    expect(erros(importarModelo(docPackage([n({ minimo: 19.5, maximo: 23.5 })]), seed, { agora: AGORA }))).toEqual([])
    expect(erros(importarModelo(docPackage([n({ minimo: 19.55 })]), seed, { agora: AGORA }))[0]).toMatch(/mínimo 19.55 tem mais casas decimais que 1/)
    expect(erros(importarModelo(docPackage([n({ minimo: -1 })]), seed, { agora: AGORA }))[0]).toMatch(/negativo/)
    expect(erros(importarModelo(docPackage([n({ minimo: 23.5, maximo: 19.5 })]), seed, { agora: AGORA }))).toContain("Formulário: Oxigênio: mínimo maior que o máximo")
    const unit = importarModelo(docPackage([n({ unidade: "graus" })]), seed, { agora: AGORA })
    expect(unit.problemas.some((p) => p.nivel === "aviso" && p.mensagem.includes("Unidade “graus”"))).toBe(true)
  })

  it("conditions: missing item, unknown option, later item, verificação without line", () => {
    const m: ItemPacote = { ref: "trab", tipo: "marcacao", rotulo: "Tipo de trabalho", obrigatorio: true, multipla: true, outro: false, opcoes: [{ rotulo: "Elétrico" }, { rotulo: "A quente" }], origem: { pagina: 1, trecho: "Tipo de trabalho: ( ) Elétrico ( ) A quente" } }
    const dep = (cond: object): ItemPacote => ({ ...texto("pt_q", "Nº da PT a quente", "Nº da PT a quente"), mostrar_quando: cond } as ItemPacote)
    expect(erros(importarModelo(docPackage([m, dep({ item: "trab", valores: ["A quente"] })]), seed, { agora: AGORA }))).toEqual([])
    expect(erros(importarModelo(docPackage([m, dep({ item: "nada", valores: ["A quente"] })]), seed, { agora: AGORA }))[0]).toMatch(/item “nada”, que não existe/)
    expect(erros(importarModelo(docPackage([m, dep({ item: "trab", valores: ["Altura"] })]), seed, { agora: AGORA }))[0]).toMatch(/“Altura”, que não é opção/)
    expect(erros(importarModelo(docPackage([dep({ item: "trab", valores: ["A quente"] }), m]), seed, { agora: AGORA }))).toContain("Formulário: Nº da PT a quente: condição aponta para item posterior")
    const v: ItemPacote = { ref: "chk", tipo: "verificacao", rotulo: "Precauções", obrigatorio: true, respostas: "sim_nao_na", linhas: [{ ref: "l1", rotulo: "Área isolada", impede: ["nao"], justificar: ["na"], origem: { pagina: 1, trecho: "Área isolada S N NA" } }], origem: { pagina: 1, trecho: "Precauções" } }
    expect(erros(importarModelo(docPackage([v, dep({ item: "chk", valores: ["sim"] })]), seed, { agora: AGORA }))[0]).toMatch(/precisa da linha/)
    expect(erros(importarModelo(docPackage([v, dep({ item: "chk", linha: "l1", valores: ["nao"] })]), seed, { agora: AGORA }))).toEqual([])
  })

  it("stages: missing anchors are added as pendências; a free stage after Emissão is an error", () => {
    const p = docPackage([texto("t1", "Ordem")])
    p.etapas = p.etapas.filter((e) => e.tipo !== "entrega")
    const r = importarModelo(p, seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    expect(r.rascunho!.versao.stages.map((s) => s.kind)).toEqual(["solicitacao", "emissao", "aceite_campo", "entrega", "aceite_area"])
    expect(r.pendencias.some((x) => x.motivo === "etapa_ausente")).toBe(true)
    const q = docPackage([texto("t1", "Ordem")])
    q.etapas.push({ ref: "vigia", nome: "Vigia de incêndio", assinaturas: [{ ref: "a_v", significado: "Vigia", cargo: "Executante", minimo: 1, obrigatoria: true, origem: { pagina: 1, trecho: "Vigia" } }], secoes: [] })
    expect(erros(importarModelo(q, seed, { agora: AGORA }))[0]).toMatch(/Etapa livre depois da Emissão/)
  })

  it("verificação answers must exist in the answer set; separations must name real slots", () => {
    const v: ItemPacote = { ref: "c", tipo: "verificacao", rotulo: "Antes de entregar", obrigatorio: true, respostas: "confirmo", linhas: [{ rotulo: "Ferramentas retiradas", impede: ["nao"], justificar: [], origem: { pagina: 1, trecho: "Ferramentas retiradas" } }], origem: { pagina: 1, trecho: "Antes de entregar" } }
    const r = importarModelo(docPackage([v], { separacoes: [{ a: "a_sol", b: "x" }] }), seed, { agora: AGORA })
    expect(erros(r).some((e) => e.includes("Resposta nao não existe em confirmo"))).toBe(true)
    expect(erros(r).some((e) => e.includes("Assinatura x não existe"))).toBe(true)
  })
})

describe("ptw.modelo/1 · formulário em inglês", () => {
  const en = (items: ItemPacote[], extra: Partial<PacoteModelo> = {}) => docPackage(items, { idioma: { documento: "en", rotulos: "pt-BR" }, ...extra })

  it("a translated label is checked through rotulo_original against the literal English excerpt", () => {
    const v: ItemPacote = {
      ref: "prec", tipo: "verificacao", rotulo: "Precauções", rotulo_original: "Precautions", obrigatorio: true, respostas: "sim_nao_na",
      origem: { pagina: 1, trecho: "SITE SAFETY PRECAUTIONS (Y / N / NA)" },
      linhas: [{ ref: "l1", rotulo: "Circuito testado e comprovado desenergizado", rotulo_original: "Circuit tested and proved dead", impede: ["nao"], justificar: ["na"], origem: { pagina: 1, trecho: "Circuit tested and proved dead  Y  N  NA" } }],
    }
    const m: ItemPacote = {
      ref: "epi", tipo: "marcacao", rotulo: "EPI", rotulo_original: "Protective Equipment", obrigatorio: true, multipla: true, outro: true,
      opcoes: [{ rotulo: "Proteção auditiva", rotulo_original: "Ear defenders" }],
      origem: { pagina: 1, trecho: "Protective Equipment: [ ] Ear defenders [ ] Other" },
    }
    const r = importarModelo(en([v, m], { listas: [{ nome: "Perigos", itens: ["Ruído"], itens_originais: ["Noise"], origem: { pagina: 1, trecho: "Hazards: Noise" } }] }), seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    // the draft carries the Portuguese label; the English stays in the package as provenance
    const item = r.rascunho!.versao.form!.sections[0].items[0]
    expect(item.kind === "verificacao" && item.lines[0].label).toBe("Circuito testado e comprovado desenergizado")
  })

  it("a translated label without the original, or an original not in the excerpt, is an error", () => {
    const missing = importarModelo(en([texto("t1", "Ordem de serviço", "Work order no.")]), seed, { agora: AGORA })
    expect(erros(missing)[0]).toMatch(/Rótulo traduzido de en sem o texto original/)
    const invented = importarModelo(en([{ ...texto("t1", "Ordem de serviço", "Work order no."), rotulo_original: "Method statement" } as ItemPacote]), seed, { agora: AGORA })
    expect(erros(invented)[0]).toMatch(/“Method statement” não aparece no trecho citado/)
    const list = importarModelo(en([texto("t1", "Ordem", "Ordem")].map((x) => ({ ...x, rotulo_original: "Ordem" }) as ItemPacote), { listas: [{ nome: "Perigos", itens: ["Ruído"], origem: { pagina: 1, trecho: "Hazards: Noise" } }] }), seed, { agora: AGORA })
    expect(erros(list)).toContain("Lista “Perigos”: Lista traduzida de en sem itens_originais")
  })
})

describe("ptw.modelo/1 · exemplo da skill", () => {
  it("the worked example validates against the sample plant", () => {
    const r = importarModelo(JSON.parse(exampleOnDisk), seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    expect(r.rascunho!.versao.status).toBe("rascunho")
    expect(r.pendencias.length).toBeGreaterThan(0)
  })
})

describe("ptw.modelo/1 · forma do banco", () => {
  it("ids are uuids, the version is 'sugerida' with the package SHA-256 and its origin, separations slotA < slotB", () => {
    const p = docPackage([texto("t1", "Ordem de serviço")], { separacoes: [{ a: "a_ent", b: "a_sol" }] })
    const r = importarModelo(p, seed, { agora: AGORA, pacote: { arquivo: "pt.json", sha256: "b".repeat(64) } })
    expect(erros(r)).toEqual([])
    const v = r.rascunho!.versao
    expect(isUuid(v.id) && v.stages.every((s) => isUuid(s.id) && s.slots.every((x) => isUuid(x.id)))).toBe(true)
    expect(v.origin).toBe("sugerida")
    expect(v.sourceSha256).toBe("b".repeat(64))
    expect(v.importSource!.pacote).toEqual({ arquivo: "pt.json", sha256: "b".repeat(64) })
    expect(v.separation.every((x) => x.slotA < x.slotB && !("id" in x))).toBe(true)
    expect(v.separation).toHaveLength(2)
    // without the file, the SHA-256 is the package's JSON
    const q = importarModelo(p, seed, { agora: AGORA })
    expect(q.rascunho!.versao.sourceSha256).toBe(sha256Hex(JSON.stringify(p)))
  })

  it("a signature without cargo stays null in the draft (G6); a condition on a line is kept (G5)", () => {
    const v: ItemPacote = { ref: "chk", tipo: "verificacao", rotulo: "Precauções", obrigatorio: true, respostas: "sim_nao", linhas: [{ ref: "l1", rotulo: "Área isolada", impede: [], justificar: [], origem: { pagina: 1, trecho: "Área isolada S N" } }], origem: { pagina: 1, trecho: "Precauções" } }
    const p = docPackage([v])
    p.etapas[0].assinaturas.push({ ref: "a_x", significado: "Confere o isolamento", cargo: null, minimo: 1, obrigatoria: true, obrigatoria_quando: { item: "chk", linha: "l1", valores: ["nao"] }, origem: { pagina: 1, trecho: "Confere o isolamento" } })
    const r = importarModelo(p, seed, { agora: AGORA })
    expect(erros(r)).toEqual([])
    const sl = r.rascunho!.versao.stages[0].slots[1]
    expect(sl.roleIds).toEqual([])
    expect(sl.kind).toBe("cargo")
    expect(sl.requiredWhen?.lineId).toBeDefined()
  })

  it("sizes and values the database refuses: list/item/type/cargo length, blank format, min > max, a date that does not exist", () => {
    const long = (n: number) => "x".repeat(n)
    const p = docPackage([texto("t1", "Ordem")], { listas: [{ nome: long(121), itens: [long(201)] }] })
    p.modelo.escopo.tipos_de_local = [long(81)]
    p.etapas[0].assinaturas[0].cargo = long(81)
    const e = errosDeEsquema(p)
    expect(e).toContain("pacote.listas[0].nome: mais de 120 caracteres")
    expect(e).toContain("pacote.listas[0].itens[0]: mais de 200 caracteres")
    expect(e).toContain("pacote.modelo.escopo.tipos_de_local[0]: mais de 80 caracteres")
    expect(e).toContain("pacote.etapas[0].assinaturas[0].cargo: mais de 80 caracteres")
    const doc: ItemPacote = { ref: "apr", tipo: "documento", rotulo: "Nº da APR", obrigatorio: true, formato: "   ", anexo: false, validade: false, origem: { pagina: 1, trecho: "Nº da APR" } }
    expect(errosDeEsquema(docPackage([doc])).some((x) => x.includes("formato"))).toBe(true)
    const n: ItemPacote = { ref: "o2", tipo: "numero", rotulo: "Oxigênio", obrigatorio: true, unidade: "%", casas_decimais: 1, negativo: false, minimo: 23.5, maximo: 19.5, origem: { pagina: 1, trecho: "Oxigênio" } }
    expect(erros(importarModelo(docPackage([n]), seed, { agora: AGORA }))).toContain("Etapa “Solicitação” › Seção “Dados” › “Oxigênio”: Mínimo maior que o máximo")
    const d: ItemPacote = { ref: "d", tipo: "data", rotulo: "Validade", obrigatorio: true, nao_antes_de_hoje: false, minimo: "2026-02-30", origem: { pagina: 1, trecho: "Validade" } }
    expect(erros(importarModelo(docPackage([d]), seed, { agora: AGORA }))).toContain("Etapa “Solicitação” › Seção “Dados” › “Validade”: Data mínima 2026-02-30 não existe")
  })
})

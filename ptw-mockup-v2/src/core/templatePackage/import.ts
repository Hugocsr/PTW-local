/**
 * Import: package → draft version (`importarModelo`), and validation without a plant (`validarPacote`).
 */
import type { CheckLine, ColumnItem, Condition, FormItem, FormItemKind, FormSection, OptionList, Separation, SignSlot, SourceExcerpt, Stage, StageKind, TemplateVersion, TypeDef } from "@/registry/types"
import { answersOf, lineChoices, optionsOf, validateForm } from "../form.ts"
import { signatureIssues, STRUCTURAL } from "../templateChecks.ts"
import { formProblem, isoDate } from "../formRules.ts"
import { remapElectricalPolicy } from "../electrical.ts"
import { normalizeSeparation, separationKey } from "../templateVersions.ts"
import { sha256Hex } from "../audit.ts"
import { uuidv7 } from "../../lib/id.ts"
import { errosDeEsquema } from "./schema.ts"
import { UNIDADES, decimalsFit, normalizar, rotuloNoTrecho } from "./text.ts"
import type { Cadastro, Casamento, CondicaoPacote, Confianca, EtapaPacote, ItemPacote, OpcoesImportacao, OrigemTrecho, PacoteModelo, Pendencia, Problema, Rascunho, Resolucao, ResultadoImportacao, Resumo } from "./types.ts"

const STAGE_DEFAULT: Record<StageKind, { name: string; meaning: string }> = {
  solicitacao: { name: "Solicitação", meaning: "Solicita a PT" },
  emissao: { name: "Emissão", meaning: "Emite a PT" },
  aceite_campo: { name: "Aceite no campo", meaning: "Aceita no campo" },
  entrega: { name: "Entrega", meaning: "Entrega a área" },
  aceite_area: { name: "Aceite da área", meaning: "Encerra a PT" },
}
const TAIL: StageKind[] = ["emissao", "aceite_campo", "entrega", "aceite_area"]
export const KIND_WORD: Record<FormItemKind, string> = { texto: "texto", marcacao: "marcação", verificacao: "verificação", aviso: "aviso", anexo: "anexo", numero: "número", horario: "horário", data: "data", documento: "documento", pessoa: "pessoa", isolamento: "isolamento", grupo: "grupo" }

/** Model names that say the form disables a protection (interlock, bypass, safety device). Tested on the normalised name. */
const BYPASS_NAME = /intertravamento|bypass|by pass|desabilita|inibic|dispositivo de seguranca|interlock|override/

const emptyResolution = (): Resolucao => ({ modelo: null, cargos: [], tiposDeLocal: [], tiposDeAtivo: [], listas: [] })

function matchByName<T>(name: string, pool: T[], labelOf: (x: T) => string): { hit: T; exact: boolean } | null {
  const exact = pool.find((x) => labelOf(x) === name)
  if (exact) return { hit: exact, exact: true }
  const n = normalizar(name)
  const loose = pool.find((x) => normalizar(labelOf(x)) === n)
  return loose ? { hit: loose, exact: false } : null
}

/**
 * Turns a package into a draft version for this plant. Checks, in order: the schema; references
 * inside the package; provenance (every node cites a page and a literal excerpt that contains its
 * label); numbers (decimals 0–4, range within decimals, min ≤ max); the app's own `validateForm`;
 * the signature checks that do not depend on people (stage without signature, slot without
 * meaning); and name resolution against the registry. Never activates: status is "rascunho".
 */
export function importarModelo(entrada: unknown, cadastro: Cadastro, opcoes: OpcoesImportacao): ResultadoImportacao {
  const problemas: Problema[] = []
  const pendencias: Pendencia[] = []
  const resolucao = emptyResolution()
  const erro = (onde: string, mensagem: string, alvo?: string) => problemas.push({ nivel: "erro", onde, mensagem, ...(alvo ? { alvo } : {}) })
  const aviso = (onde: string, mensagem: string, alvo?: string) => problemas.push({ nivel: "aviso", onde, mensagem, ...(alvo ? { alvo } : {}) })
  /** Element id → where it was read (kept on the version so the Fluxo shows each element's excerpt). */
  const trechos: Record<string, SourceExcerpt> = {}
  const keep = (id: string, o: OrigemTrecho | undefined, extra?: { original?: string; confianca?: Confianca; observacao?: string }) => {
    if (!o) return
    trechos[id] = { pagina: o.pagina, trecho: o.trecho, ...(o.arquivo ? { arquivo: o.arquivo } : {}), ...(extra?.original ? { original: extra.original } : {}), ...(extra?.confianca ? { confianca: extra.confianca } : {}), ...(extra?.observacao ? { observacao: extra.observacao } : {}) }
  }

  const schema = errosDeEsquema(entrada)
  if (schema.length) {
    for (const s of schema) { const i = s.indexOf(": "); erro(s.slice(0, i), s.slice(i + 2)) }
    return { rascunho: null, previa: null, problemas, pendencias, resolucao, resumo: null }
  }
  const pkg = entrada as PacoteModelo
  const novoId = opcoes.novoId ?? (() => uuidv7())
  const conferirCargos = opcoes.conferirCargos ?? true
  const doc = pkg.origem.tipo === "documento"

  /* ---- provenance ---- */
  const files = new Map(pkg.origem.arquivos.map((f) => [f.arquivo, f]))
  if (doc && pkg.origem.arquivos.length === 0) erro("origem.arquivos", "Pacote lido de documento sem o arquivo de origem (nome, sha256, páginas)")
  // Labels in another language than the document: the source wording travels in *_original and is what the excerpt must contain.
  const lang = (x: string) => x.split("-")[0].toLowerCase()
  const traduz = !!pkg.idioma && lang(pkg.idioma.documento) !== lang(pkg.idioma.rotulos)
  const checkOrigin = (o: OrigemTrecho | undefined, onde: string, label: string | null, original?: string, alvo?: string) => {
    if (!doc) return
    const erro = (w: string, m: string) => problemas.push({ nivel: "erro", onde: w, mensagem: m, ...(alvo ? { alvo } : {}) })
    if (!o) { erro(onde, "Sem origem (página e trecho do documento)"); return }
    const file = o.arquivo ? files.get(o.arquivo) : pkg.origem.arquivos.length === 1 ? pkg.origem.arquivos[0] : undefined
    if (o.arquivo && !file) erro(onde, `Origem cita o arquivo "${o.arquivo}", que não está em origem.arquivos`)
    else if (!o.arquivo && pkg.origem.arquivos.length > 1) erro(onde, "Origem sem arquivo: há mais de um arquivo de origem")
    else if (file && o.pagina > file.paginas) erro(onde, `Página ${o.pagina} não existe em ${file.arquivo} (${file.paginas} páginas)`)
    if (label === null) return
    if (traduz && !original?.trim()) { erro(onde, `Rótulo traduzido de ${pkg.idioma!.documento} sem o texto original (rotulo_original)`); return }
    const said = original?.trim() || label
    if (!rotuloNoTrecho(said, o.trecho)) erro(onde, `“${said}” não aparece no trecho citado (“${o.trecho}”): item inventado ou trecho errado`)
  }
  const checkConfidence = (c: Confianca | undefined, obs: string | undefined, onde: string, alvo?: string) => {
    if (c === "baixa") aviso(onde, `Confiança baixa${obs ? `: ${obs}` : ""}`, alvo)
  }

  /* ---- template name ---- */
  const name = pkg.modelo.nome.trim()
  const existing = matchByName(name, cadastro.templates, (t) => t.name)
  const tplId = existing ? existing.hit.id : novoId("tpl")
  const number = existing ? Math.max(0, ...existing.hit.versions.map((v) => v.number)) + 1 : 1
  resolucao.modelo = { nome: name, situacao: existing ? "nova_versao" : "novo", id: tplId, versao: number }

  /* ---- scope types ---- */
  const resolveTypes = (names: string[], pool: TypeDef[], prefix: string, out: Casamento[], created: TypeDef[]) => {
    const ids: string[] = []
    for (const raw of names) {
      const nm = raw.trim()
      if (out.some((c) => normalizar(c.nome) === normalizar(nm))) { aviso(`modelo.escopo`, `Tipo repetido: ${nm}`); continue }
      const m = matchByName(nm, pool, (t) => t.label)
      if (m) { out.push({ nome: nm, situacao: "encontrado", id: m.hit.id, nomeNaPlanta: m.hit.label }); ids.push(m.hit.id) }
      else { const t: TypeDef = { id: novoId(prefix), label: nm, active: true }; created.push(t); out.push({ nome: nm, situacao: "criar", id: t.id }); ids.push(t.id) }
    }
    return ids
  }
  const tiposDeLocalNovos: TypeDef[] = []
  const tiposDeAtivoNovos: TypeDef[] = []
  const locationTypeIds = resolveTypes(pkg.modelo.escopo.tipos_de_local, cadastro.locationTypes, "lt", resolucao.tiposDeLocal, tiposDeLocalNovos)
  const assetTypeIds = resolveTypes(pkg.modelo.escopo.tipos_de_ativo, cadastro.assetTypes, "at", resolucao.tiposDeAtivo, tiposDeAtivoNovos)
  if (locationTypeIds.length === 0 && assetTypeIds.length === 0) aviso("modelo.escopo", "Sem tipo de local nem de ativo: a PT não terá onde se aplicar até alguém escolher")
  // A form that disables a protection lives beside the PT of the work on the same equipment: the package has to say so.
  if (pkg.modelo.prende_equipamento === undefined && BYPASS_NAME.test(normalizar(`${pkg.modelo.nome} ${pkg.modelo.nome_original ?? ""}`))) {
    aviso("modelo.prende_equipamento", "O nome indica desabilitação de uma proteção, mas o pacote não diz se a PT prende o equipamento: como está, ela não poderá ser aberta em equipamento que já tem outra PT. Se ela acompanha a PT do serviço, marque \"Não prende o equipamento\" antes de ativar", "modelo.prende_equipamento")
  }

  /* ---- lists ---- */
  const listasNovas: OptionList[] = []
  const listByName = new Map<string, OptionList>()
  pkg.listas.forEach((l) => {
    const onde = `Lista “${l.nome}”`
    const key = `lista:${normalizar(l.nome)}`
    if (listByName.has(normalizar(l.nome))) { erro(onde, "Lista declarada duas vezes", key); return }
    checkOrigin(l.origem, onde, null, undefined, key)
    if (doc && l.origem) {
      const orig = l.itens_originais
      if (orig && orig.length !== l.itens.length) erro(onde, "itens_originais precisa ter um texto para cada item, na mesma ordem", key)
      else if (traduz && !orig) erro(onde, `Lista traduzida de ${pkg.idioma!.documento} sem itens_originais`, key)
      else l.itens.forEach((it, j) => { const said = orig?.[j] ?? it; if (!rotuloNoTrecho(said, l.origem!.trecho)) erro(`${onde} › ${it}`, `“${said}” não aparece no trecho citado da lista`, key) })
    }
    const dup = l.itens.filter((x, j) => l.itens.findIndex((y) => normalizar(y) === normalizar(x)) !== j)
    if (dup.length) erro(onde, `Itens repetidos: ${dup.join(", ")}`, key)
    if (l.itens.length === 0) aviso(onde, "Lista sem itens: inclua os itens em Configuração › Listas antes de ativar a versão", key)
    const m = matchByName(l.nome, cadastro.optionLists, (x) => x.name)
    if (m) {
      const missing = l.itens.filter((x) => !m.hit.items.some((y) => normalizar(y.label) === normalizar(x)))
      if (missing.length) aviso(onde, `A lista da planta “${m.hit.name}” não tem: ${missing.join(", ")}. Inclua na lista antes de ativar, se for o caso`, key)
      keep(m.hit.id, l.origem)
      listByName.set(normalizar(l.nome), m.hit)
      resolucao.listas.push({ nome: l.nome, situacao: "encontrado", id: m.hit.id, nomeNaPlanta: m.hit.name })
    } else {
      const created: OptionList = { id: novoId("ol"), name: l.nome.trim(), revision: 1, updatedAt: opcoes.agora, items: l.itens.map((label) => ({ id: novoId("li"), label: label.trim(), active: true })) }
      listasNovas.push(created)
      keep(created.id, l.origem)
      listByName.set(normalizar(l.nome), created)
      resolucao.listas.push({ nome: l.nome, situacao: "criar", id: created.id })
    }
  })

  /* ---- stages and signatures ---- */
  const cargoIds = new Map<string, Casamento>()
  const cargosNovos: TypeDef[] = []
  const resolveCargo = (nome: string): string => {
    const key = normalizar(nome)
    const known = cargoIds.get(key)
    if (known) return known.id!
    const m = matchByName(nome, cadastro.roleTypes, (r) => r.label)
    const c: Casamento = m ? { nome, situacao: "encontrado", id: m.hit.id, nomeNaPlanta: m.hit.label }
      : conferirCargos ? (() => { const t: TypeDef = { id: novoId("rt"), label: nome, active: true }; cargosNovos.push(t); return { nome, situacao: "criar" as const, id: t.id } })()
      // Without a registry the name is not checked; it still gets an id so the form is well formed.
      : { nome, situacao: "nao_conferido", id: novoId("rt") }
    cargoIds.set(key, c)
    resolucao.cargos.push(c)
    return c.id!
  }

  const refsUsed = new Set<string>()
  const refAt = new Map<string, { onde: string; alvo?: string }>()
  const uniqueRef = (r: string, onde: string, alvo?: string) => { if (refsUsed.has(r)) erro(onde, `Ref “${r}” repetida no pacote`, alvo); refsUsed.add(r); if (!refAt.has(r)) refAt.set(r, { onde, alvo }) }

  const kinds = new Map<StageKind, EtapaPacote>()
  pkg.etapas.forEach((e) => {
    if (e.tipo) { if (kinds.has(e.tipo)) erro(`Etapa “${e.nome}”`, `Duas etapas do tipo ${e.tipo}`); else kinds.set(e.tipo, e) }
  })
  // The product fixes the order: Solicitação, free stages, then Emissão → Aceite no campo → Entrega → Aceite da área.
  const order = pkg.etapas.map((e) => e.tipo)
  const firstTail = order.findIndex((k) => k !== undefined && TAIL.includes(k))
  pkg.etapas.forEach((e, i) => {
    if (!e.tipo && firstTail !== -1 && i > firstTail) erro(`Etapa “${e.nome}”`, "Etapa livre depois da Emissão: o produto só aceita etapas livres antes da Emissão. Registre como pendência")
    if (e.tipo === "solicitacao" && i !== 0) erro(`Etapa “${e.nome}”`, "A Solicitação é sempre a primeira etapa")
  })
  const tailOrder = order.filter((k): k is StageKind => k !== undefined && TAIL.includes(k))
  if (tailOrder.some((k, i) => i > 0 && TAIL.indexOf(k) < TAIL.indexOf(tailOrder[i - 1]))) erro("etapas", "Etapas fixas fora de ordem: Emissão, Aceite no campo, Entrega, Aceite da área")

  const slotByRef = new Map<string, SignSlot>()
  const cargoSlots = new Map<string, string[]>()
  const cargoPedido: Record<string, string[]> = {}
  const stageOfPkg = new Map<EtapaPacote, Stage>()
  const buildStage = (e: EtapaPacote): Stage => {
    const onde = `Etapa “${e.nome}”`
    const stageId = novoId("st")
    keep(stageId, e.origem, { original: e.nome_original })
    uniqueRef(e.ref, onde, stageId)
    const slots = e.assinaturas.map((a): SignSlot => {
      const os = `${onde} › Assinatura “${a.significado}”`
      const id = novoId("sg")
      keep(id, a.origem, { original: a.significado_original, confianca: a.confianca, observacao: a.observacao })
      uniqueRef(a.ref, os, id)
      checkOrigin(a.origem, os, null, undefined, id)
      checkConfidence(a.confianca, a.observacao, os, id)
      // "cargo" (a name, a list or null) or "cargos" (a list): any of them signs.
      if (!("cargo" in a) && !("cargos" in a)) erro(os, "Assinatura sem cargo: use “cargo” (null quando o papel não diz quem assina) ou “cargos”", id)
      if ("cargo" in a && "cargos" in a) erro(os, "Use “cargo” ou “cargos”, não os dois", id)
      const names = [...new Set((a.cargos ?? (a.cargo == null ? [] : typeof a.cargo === "string" ? [a.cargo] : a.cargo)).map((c) => c.trim()).filter(Boolean))]
      const roleIds: string[] = []
      if (names.length === 0) pendencias.push({ descricao: `Quem assina “${a.significado}” não está no formulário: escolha o cargo`, motivo: "sem_cargo", onde: os, origem: a.origem, alvo: id })
      for (const nm of names) {
        const rid = resolveCargo(nm)
        if (!roleIds.includes(rid)) roleIds.push(rid)
        const k = normalizar(nm)
        cargoSlots.set(k, [...(cargoSlots.get(k) ?? []), id])
      }
      if (names.length) cargoPedido[id] = names
      const slot: SignSlot = { id, meaning: a.significado.trim(), kind: "cargo", roleIds, personId: null, min: a.minimo, required: a.obrigatoria }
      slotByRef.set(a.ref, slot)
      return slot
    })
    const stage: Stage = { id: stageId, name: e.nome.trim(), ...(e.tipo ? { kind: e.tipo } : {}), ...(e.tipo && TAIL.includes(e.tipo) ? { locked: true } : {}), slots }
    stageOfPkg.set(e, stage)
    return stage
  }
  const defaultStage = (k: StageKind): Stage => {
    const d = STAGE_DEFAULT[k]
    const id = novoId("st")
    pendencias.push({ descricao: `O formulário não tem a etapa “${d.name}”; o produto a inclui. Escolha quem assina “${d.meaning}”`, motivo: "etapa_ausente", onde: `Etapa “${d.name}”`, alvo: id })
    return { id, name: d.name, kind: k, ...(TAIL.includes(k) ? { locked: true } : {}), slots: [{ id: novoId("sg"), meaning: d.meaning, kind: "cargo", roleIds: [], personId: null, min: 1, required: true }] }
  }
  const sol = kinds.get("solicitacao")
  const stages: Stage[] = [
    sol ? buildStage(sol) : defaultStage("solicitacao"),
    ...pkg.etapas.filter((e) => !e.tipo).map(buildStage),
    ...TAIL.map((k) => { const e = kinds.get(k); return e ? buildStage(e) : defaultStage(k) }),
  ]
  // A cargo the plant does not have is created with the import; nobody holds it yet, so its slots cannot be signed until someone receives it in Pessoas.
  for (const c of resolucao.cargos) if (c.situacao === "criar") aviso(`Cargo “${c.nome}”`, "Cargo novo: será criado sem ninguém. Ninguém pode assinar estas assinaturas até alguém receber o cargo em Pessoas", cargoSlots.get(normalizar(c.nome))?.[0])

  /* ---- sections and items ---- */
  type Pending = { item: FormItem; cond: CondicaoPacote; onde: string }
  const conds: Pending[] = []
  const itemByRef = new Map<string, { item: FormItem; lineRefs: Map<string, string> }>()
  const sections: FormSection[] = []
  const emptyListItems = new Set<string>()
  const allListsNow = () => [...cadastro.optionLists, ...listasNovas]
  const counts: Record<FormItemKind, number> = { texto: 0, marcacao: 0, verificacao: 0, aviso: 0, anexo: 0, numero: 0, horario: 0, data: 0, documento: 0, pessoa: 0, isolamento: 0, grupo: 0 }
  let lineCount = 0

  const buildItem = (p: ItemPacote, ondeSec: string, coluna = false): FormItem => {
    const label = p.tipo === "aviso" ? (p.rotulo?.trim() || "Aviso") : p.rotulo.trim()
    const onde = `${ondeSec} › ${p.tipo === "aviso" ? `Aviso “${p.texto.slice(0, 40)}${p.texto.length > 40 ? "…" : ""}”` : `“${label}”`}`
    const itemId = novoId("fi")
    const erro = (w: string, m: string) => problemas.push({ nivel: "erro", onde: w, mensagem: m, alvo: itemId })
    const aviso = (w: string, m: string) => problemas.push({ nivel: "aviso", onde: w, mensagem: m, alvo: itemId })
    const original = p.tipo === "aviso" ? p.texto_original : p.rotulo_original
    keep(itemId, p.origem, { original, confianca: p.confianca, observacao: p.observacao })
    uniqueRef(p.ref, onde, itemId)
    checkOrigin(p.origem, onde, p.tipo === "aviso" ? p.texto : label, original, itemId)
    checkConfidence(p.confianca, p.observacao, onde, itemId)
    if (!coluna) counts[p.tipo]++
    const base = { id: itemId, label, required: p.tipo === "aviso" ? (p.obrigatorio ?? false) : p.obrigatorio }
    const lineRefs = new Map<string, string>()
    let item: FormItem
    switch (p.tipo) {
      case "texto": item = { ...base, kind: "texto", long: p.longo }; break
      case "aviso": item = { ...base, kind: "aviso", text: p.texto.trim() }; break
      case "horario": item = { ...base, kind: "horario", seconds: p.segundos }; break
      case "anexo": item = { ...base, kind: "anexo", accept: [...new Set(p.aceita)], min: p.minimo, hint: p.dica }; break
      case "numero": {
        const d = p.casas_decimais
        if (!UNIDADES.includes(p.unidade.trim())) aviso(onde, `Unidade “${p.unidade}” fora da tabela (${UNIDADES.filter(Boolean).slice(0, 8).join(", ")}…); confira`)
        for (const [k, v] of [["mínimo", p.minimo], ["máximo", p.maximo]] as const) {
          if (v === undefined) continue
          if (!decimalsFit(v, d)) erro(onde, `${k} ${v} tem mais casas decimais que ${d}`)
          if (v < 0 && !p.negativo) erro(onde, `${k} ${v} é negativo, mas o item não aceita negativo`)
        }
        if (p.minimo !== undefined && p.maximo !== undefined && p.minimo > p.maximo) erro(onde, "Mínimo maior que o máximo")
        item = { ...base, kind: "numero", unit: p.unidade.trim(), decimals: d, negative: p.negativo, ...(p.minimo !== undefined ? { min: p.minimo } : {}), ...(p.maximo !== undefined ? { max: p.maximo } : {}) }
        break
      }
      case "marcacao": {
        if (p.lista && p.opcoes?.length) erro(onde, "Marcação com lista e opções próprias ao mesmo tempo: escolha uma")
        let listId: string | undefined
        if (p.lista) {
          const l = listByName.get(normalizar(p.lista)) ?? matchByName(p.lista, cadastro.optionLists, (x) => x.name)?.hit
          if (!l) erro(onde, `Lista “${p.lista}” não declarada em listas nem existente na planta`)
          else {
            listId = l.id
            if (!resolucao.listas.some((c) => c.id === l.id)) resolucao.listas.push({ nome: p.lista, situacao: "encontrado", id: l.id, nomeNaPlanta: l.name })
          }
        }
        const opts = (p.opcoes ?? []).map((o) => {
          checkOrigin(o.origem ?? p.origem, `${onde} › ${o.rotulo}`, o.rotulo, o.rotulo_original, itemId)
          const id = novoId("fo")
          keep(id, o.origem, { original: o.rotulo_original })
          return { id, label: o.rotulo.trim(), ...(o.impede ? { blocks: true } : {}) }
        })
        // A list that still has no items (the plant sends it later): the item waits for it, the version does not activate.
        if (listId && !p.outro && !(allListsNow().find((x) => x.id === listId)?.items.length)) emptyListItems.add(itemId)
        const dup = opts.filter((o, i) => opts.findIndex((x) => normalizar(x.label) === normalizar(o.label)) !== i)
        if (dup.length) erro(onde, `Opções repetidas: ${dup.map((o) => o.label).join(", ")}`)
        item = { ...base, kind: "marcacao", options: opts, ...(listId ? { listId } : {}), multiple: p.multipla, other: p.outro }
        break
      }
      case "verificacao": {
        // Fixed answers (sim/nao/na/confirmo), or the items of an answer list, named by their labels.
        let answerList: OptionList | undefined
        if (p.respostas === "lista") {
          if (!p.lista_respostas) erro(onde, "Respostas “lista” sem a lista (lista_respostas)")
          else {
            answerList = listByName.get(normalizar(p.lista_respostas)) ?? matchByName(p.lista_respostas, cadastro.optionLists, (x) => x.name)?.hit
            if (!answerList) erro(onde, `Lista de respostas “${p.lista_respostas}” não declarada em listas nem existente na planta`)
            else if (!resolucao.listas.some((c) => c.id === answerList!.id)) resolucao.listas.push({ nome: p.lista_respostas, situacao: "encontrado", id: answerList.id, nomeNaPlanta: answerList.name })
          }
        } else if (p.lista_respostas) erro(onde, "lista_respostas só com respostas “lista”")
        const choices = p.respostas === "lista" ? (answerList?.items ?? []).map((x) => ({ id: x.id, label: x.label })) : answersOf(p.respostas).map((a) => ({ id: a, label: a }))
        const toId = (v: string) => (p.respostas === "lista" ? choices.find((c) => normalizar(c.label) === normalizar(v))?.id : choices.find((c) => c.id === v)?.id)
        const lines = p.linhas.map((l): CheckLine => {
          const ol = `${onde} › “${l.rotulo}”`
          checkOrigin(l.origem, ol, l.rotulo, l.rotulo_original, itemId)
          checkConfidence(l.confianca, l.observacao, ol, itemId)
          const bad = [...l.impede, ...l.justificar].filter((a) => !toId(a))
          if (bad.length && (p.respostas !== "lista" || answerList)) erro(ol, p.respostas === "lista" ? `Resposta ${bad.map((b) => `“${b}”`).join(", ")} não é item da lista “${answerList!.name}”` : `Resposta ${bad.join(", ")} não existe em ${p.respostas}`)
          const blockOn = [...new Set(l.impede.map(toId).filter((x): x is string => !!x))]
          const noteOn = [...new Set(l.justificar.map(toId).filter((x): x is string => !!x))]
          if (blockOn.some((a) => noteOn.includes(a))) erro(ol, "A mesma resposta impede e pede justificativa")
          if (choices.length > 1 && choices.every((c) => blockOn.includes(c.id))) erro(ol, "Todas as respostas impedem a etapa")
          const id = novoId("fl")
          keep(id, l.origem, { original: l.rotulo_original, confianca: l.confianca, observacao: l.observacao })
          if (l.ref) { if (lineRefs.has(l.ref)) erro(ol, `Ref de linha “${l.ref}” repetida`); lineRefs.set(l.ref, id) }
          lineCount++
          return { id, label: l.rotulo.trim(), blockOn, noteOn }
        })
        item = { ...base, kind: "verificacao", answers: p.respostas, ...(answerList ? { answerListId: answerList.id } : {}), lines }
        break
      }
      case "documento": item = { ...base, kind: "documento", ...(p.formato?.trim() ? { pattern: p.formato.trim() } : {}), attach: p.anexo, validity: p.validade }; break
      case "data": {
        for (const [k, v] of [["mínima", p.minimo], ["máxima", p.maximo]] as const) if (v !== undefined && !isoDate(v)) erro(onde, `Data ${k} ${v} não existe`)
        if (p.minimo && p.maximo && p.minimo > p.maximo) erro(onde, "Data mínima depois da máxima")
        item = { ...base, kind: "data", notBeforeToday: p.nao_antes_de_hoje, ...(p.minimo ? { min: p.minimo } : {}), ...(p.maximo ? { max: p.maximo } : {}) }
        break
      }
      case "pessoa": {
        const roleId = p.cargo?.trim() ? resolveCargo(p.cargo.trim()) : undefined
        if (p.deve_ser_elegivel && !p.cargo) erro(onde, "“Deve ser elegível” precisa do cargo")
        item = { ...base, kind: "pessoa", multiple: p.multipla, ...(roleId ? { roleId } : {}), mustBeEligible: p.deve_ser_elegivel && !!roleId }
        break
      }
      case "isolamento": item = { ...base, kind: "isolamento", minRows: p.minimo_linhas }; break
      case "grupo": {
        const columns = p.colunas.map((c) => buildItem(c, `${onde} › coluna`, true) as ColumnItem)
        item = { ...base, kind: "grupo", minRows: p.minimo_linhas, columns }
        break
      }
    }
    if (coluna) {
      if (p.mostrar_quando) erro(onde, "Coluna de grupo não tem condição: a condição fica no grupo")
      return item
    }
    itemByRef.set(p.ref, { item, lineRefs })
    if (p.mostrar_quando) conds.push({ item, cond: p.mostrar_quando, onde })
    return item
  }

  // Sections follow the final stage order (anchors first/last), so "condition points to a later item" is judged as the app judges it.
  const pkgOfStage = new Map([...stageOfPkg].map(([e, s]) => [s.id, e]))
  for (const st of stages) {
    const e = pkgOfStage.get(st.id)
    for (const sec of e?.secoes ?? []) {
      const onde = `Etapa “${st.name}” › Seção “${sec.titulo}”`
      const secId = novoId("fs")
      keep(secId, sec.origem, { original: sec.titulo_original })
      if (sec.ref) uniqueRef(sec.ref, onde, secId)
      sections.push({ id: secId, title: sec.titulo.trim(), stageId: st.id, items: sec.itens.map((p) => buildItem(p, onde)) })
    }
  }

  /* ---- conditions: refs → ids, option labels → option ids ---- */
  const allLists = [...cadastro.optionLists, ...listasNovas]
  const resolveCond = (cond: CondicaoPacote, onde: string, alvo: string): Condition | null => {
    const erro = (w: string, m: string) => problemas.push({ nivel: "erro", onde: w, mensagem: m, alvo })
    const src = itemByRef.get(cond.item)
    if (!src) { erro(onde, `Condição aponta para o item “${cond.item}”, que não existe no pacote`); return null }
    const s = src.item
    let c: Condition | null = null
    if (s.kind === "marcacao") {
      if (cond.linha) erro(onde, "Condição com linha, mas o item de origem é marcação")
      const opts = optionsOf(s, allLists, true)
      const ids = cond.valores.map((v) => opts.find((o) => normalizar(o.label) === normalizar(v))?.id)
      const missing = cond.valores.filter((_, i) => !ids[i])
      if (missing.length) erro(onde, `Condição usa ${missing.map((m) => `“${m}”`).join(", ")}, que não é opção de “${s.label}”`)
      else c = { itemId: s.id, anyOf: ids as string[] }
    } else if (s.kind === "verificacao") {
      const lineId = cond.linha ? src.lineRefs.get(cond.linha) ?? s.lines.find((l) => normalizar(l.label) === normalizar(cond.linha!))?.id : undefined
      if (!cond.linha) erro(onde, `Condição sobre a verificação “${s.label}” precisa da linha`)
      else if (!lineId) erro(onde, `Condição aponta para a linha “${cond.linha}”, que não existe em “${s.label}”`)
      const choices = s.answers === "lista" ? lineChoices(s, allLists, true) : answersOf(s.answers).map((a) => ({ id: a, label: a }))
      const ids = cond.valores.map((v) => (s.answers === "lista" ? choices.find((o) => normalizar(o.label) === normalizar(v))?.id : choices.find((o) => o.id === v)?.id))
      const bad = cond.valores.filter((_, i) => !ids[i])
      if (bad.length) erro(onde, `Condição usa ${bad.join(", ")}; respostas possíveis: ${choices.map((o) => o.label).join(", ")}`)
      if (lineId && !bad.length) c = { itemId: s.id, lineId, anyOf: ids as string[] }
    } else erro(onde, `Condição só pode depender de marcação ou verificação, não de ${KIND_WORD[s.kind]}`)
    return c
  }
  for (const { item, cond, onde } of conds) { const c = resolveCond(cond, onde, item.id); if (c) item.showWhen = c }
  // "Obrigatória só quando…" on a signature: the same rule, pointing at a question of its stage or before.
  for (const e of pkg.etapas) for (const a of e.assinaturas) {
    if (!a.obrigatoria_quando) continue
    const slot = slotByRef.get(a.ref)
    if (!slot) continue
    const onde = `Etapa “${e.nome}” › Assinatura “${a.significado}”`
    if (!a.obrigatoria) { aviso(onde, "Condição numa assinatura opcional não muda nada", slot.id); continue }
    const c = resolveCond(a.obrigatoria_quando, onde, slot.id)
    if (c) slot.requiredWhen = c
  }

  /* ---- separation ---- */
  // Stored as the database keeps it: no id, slotA < slotB (each slot keeps its own excerpt).
  const separation: Separation[] = []
  for (const r of pkg.separacoes) {
    const a = slotByRef.get(r.a)
    const b = slotByRef.get(r.b)
    const onde = `Separação ${r.a} ≠ ${r.b}`
    if (!a || !b) { erro(onde, `Assinatura ${!a ? r.a : r.b} não existe no pacote`, (a ?? b)?.id); continue }
    if (a.id === b.id) { erro(onde, "Regra liga a assinatura a ela mesma", a.id); continue }
    const sp = normalizeSeparation(a.id, b.id, !!r.travada)
    if (separation.some((x) => separationKey(x) === separationKey(sp))) { aviso(onde, "Regra repetida", a.id); continue }
    separation.push(sp)
  }
  // Product rule: who issues never accepts in the field (fixed on every template).
  const emi = stages.find((s) => s.kind === "emissao")?.slots[0]
  const campo = stages.find((s) => s.kind === "aceite_campo")?.slots[0]
  if (emi && campo) {
    const fixed = normalizeSeparation(emi.id, campo.id, true)
    const rule = separation.find((x) => separationKey(x) === separationKey(fixed))
    if (rule) rule.locked = true
    else separation.unshift(fixed)
  }

  /* ---- the app's own checks ---- */
  const form = { sections, ...(pkg.modelo.politica_eletrica ? { electrical: remapElectricalPolicy(pkg.modelo.politica_eletrica, (ref) => itemByRef.get(ref)?.item.id ?? ref) } : {}) }
  // A marcação whose list is still empty: the plant fills the list before activating (warning, not error).
  const waiting = new Set([...emptyListItems].map((id) => sections.flatMap((s) => s.items).find((i) => i.id === id)?.label).filter(Boolean).map((l) => `${l}: marcação sem opções`))
  for (const m of validateForm(form, stages, allLists)) { if (waiting.has(m)) aviso("Formulário", `${m.replace(": marcação sem opções", "")}: a lista ainda não tem itens; inclua-os antes de ativar`); else erro("Formulário", m) }
  // The database's own structure check (PTW15): what it would refuse when the version is written.
  const fp = formProblem(form)
  if (fp) erro("Formulário", `O banco recusaria o formulário: ${fp}`)
  // The same signature checks as activation (core/templateChecks). Structure blocks the import; a
  // signature still without cargo, and anything that depends on the plant's people today (nobody
  // eligible, a rule nobody can satisfy), is a warning: the reviewer fixes it before activating.
  // Without a registry (CLI), cargos are not checked: their placeholder ids count as chosen.
  const draftForChecks = { locationTypeIds, assetTypeIds, stages, separation, form: { sections } }
  const roleTypes = conferirCargos ? [...cadastro.roleTypes, ...cargosNovos] : [...cadastro.roleTypes, ...resolucao.cargos.filter((c) => c.id).map((c): TypeDef => ({ id: c.id!, label: c.nome, active: true }))]
  const checksReg = { people: cadastro.people ?? [], locations: cadastro.locations ?? [], roleTypes }
  for (const issue of signatureIssues(draftForChecks, checksReg, opcoes.agora.slice(0, 10))) {
    const alvo = issue.slotId ?? issue.stageIds?.[0]
    if (!cadastro.people && !STRUCTURAL.includes(issue.kind)) continue
    if (issue.kind === "sem_quem") aviso("Fluxo", `${issue.text}: a versão não ativa até alguém escolher`, alvo)
    else if (STRUCTURAL.includes(issue.kind)) erro("Fluxo", issue.text, alvo)
    else aviso("Fluxo", `${issue.text}: a versão não ativa até alguém da planta poder assinar`, alvo)
  }

  // The package's own pendências point at a ref: name the place and the element it became.
  for (const p of [...pkg.pendencias].reverse()) {
    const at = p.onde ? refAt.get(p.onde) : undefined
    pendencias.unshift({ ...p, ...(at ? { onde: at.onde, ...(at.alvo ? { alvo: at.alvo } : {}) } : {}) })
  }
  for (const c of pkg.campos_do_sistema) checkOrigin(c.origem, `Campo do sistema “${c.rotulo}”`, c.rotulo, c.rotulo_original)

  const resumo: Resumo = {
    etapas: stages.length, assinaturas: stages.reduce((k, s) => k + s.slots.length, 0), secoes: sections.length, itens: counts,
    linhas: lineCount, separacoes: separation.length, camposDoSistema: pkg.campos_do_sistema.length, pendencias: pendencias.length,
    prendeEquipamento: pkg.modelo.prende_equipamento ?? true, prazoMaximoHoras: pkg.modelo.prazo_maximo_horas ?? null,
  }
  const fileNote = pkg.origem.arquivos.map((f) => `${f.arquivo} (${f.sha256.slice(0, 12)})`).join(", ")
  const pacote = opcoes.pacote ?? { arquivo: "", sha256: sha256Hex(JSON.stringify(entrada)) }
  const note = (doc ? `Importado de ${fileNote}; revisar antes de ativar` : (pkg.modelo.descricao?.trim() || "Importado de outra planta; revisar antes de ativar")).slice(0, 2000)
  const versao: TemplateVersion = {
    id: novoId("ver"), number, status: "rascunho", createdAt: opcoes.agora, activatedAt: null,
    note,
    locationTypeIds, assetTypeIds, stages, separation, form,
    maxWindowHours: pkg.modelo.prazo_maximo_horas ?? null,
    holdsEquipment: pkg.modelo.prende_equipamento ?? true,
    origin: "sugerida",
    sourceSha256: pacote.sha256,
    importSource: {
      pacote: { arquivo: pacote.arquivo, sha256: pacote.sha256 },
      documentos: pkg.origem.arquivos.map((f) => ({ arquivo: f.arquivo, sha256: f.sha256, paginas: f.paginas })),
      ferramenta: pkg.origem.gerado_por.ferramenta.slice(0, 200),
      ...(pkg.origem.gerado_por.modelo ? { modelo: pkg.origem.gerado_por.modelo.slice(0, 200) } : {}),
      ...(pkg.idioma ? { idioma: { documento: pkg.idioma.documento, rotulos: pkg.idioma.rotulos } } : {}),
      importadoEm: opcoes.agora,
      trechos,
    },
  }
  const previa: Rascunho = { modeloId: tplId, modeloNome: existing ? existing.hit.name : name, modeloExistente: !!existing, versao, listasNovas, tiposDeLocalNovos, tiposDeAtivoNovos, cargosNovos, cargoPedido }
  const blocked = problemas.some((p) => p.nivel === "erro")
  return { rascunho: blocked ? null : previa, previa, problemas, pendencias, resolucao, resumo }
}

/** Validation without a plant (CLI, the skill): names are not checked, everything else is. */
export function validarPacote(entrada: unknown, cadastro?: Cadastro, agora = "1970-01-01T00:00:00Z"): ResultadoImportacao {
  const vazio: Cadastro = { roleTypes: [], locationTypes: [], assetTypes: [], optionLists: [], templates: [] }
  return importarModelo(entrada, cadastro ?? vazio, { agora, conferirCargos: !!cadastro })
}

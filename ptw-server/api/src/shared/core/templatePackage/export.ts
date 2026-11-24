// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templatePackage/export.ts; não edite (node scripts/sync-shared.mjs)
/**
 * Export: an existing template → package (to move it between plants).
 */
import type { Condition, FormItem, OptionList, PermitTemplate, TypeDef } from "@/registry/types"
import { optionsOf } from "../form.ts"
import type { Cadastro, ColunaPacote, CondicaoPacote, EtapaPacote, ItemPacote, OpcoesExportacao, PacoteModelo, PendenciaPacote } from "./types.ts"
import { FORMATO } from "./types.ts"

/** The chosen version (default: the active one, else the latest) as a portable package. */
export function exportarModelo(tpl: PermitTemplate, cadastro: Cadastro, opcoes: OpcoesExportacao): PacoteModelo {
  const ver = (opcoes.versaoId ? tpl.versions.find((v) => v.id === opcoes.versaoId) : undefined)
    ?? tpl.versions.find((v) => v.status === "ativa")
    ?? [...tpl.versions].sort((a, b) => b.number - a.number)[0]
  if (!ver) throw new Error(`O modelo “${tpl.name}” não tem versão`)
  const pendencias: PendenciaPacote[] = []
  const typeName = (pool: TypeDef[], id: string) => pool.find((t) => t.id === id)?.label
  const listsUsed = new Map<string, OptionList>()
  const allItems = (ver.form?.sections ?? []).flatMap((s) => s.items)

  const condOut = (w: Condition): CondicaoPacote => {
    const src = allItems.find((x) => x.id === w.itemId)
    const valores = src?.kind === "marcacao"
      ? w.anyOf.map((id) => optionsOf(src, cadastro.optionLists, true).find((o) => o.id === id)?.label ?? id)
      : w.anyOf
    return { item: w.itemId, ...(w.lineId ? { linha: w.lineId } : {}), valores }
  }
  const exportItem = (i: FormItem): ItemPacote => {
    const base = { ref: i.id, rotulo: i.label, obrigatorio: i.required }
    const cond: CondicaoPacote | undefined = i.showWhen ? condOut(i.showWhen) : undefined
    const withCond = cond ? { mostrar_quando: cond } : {}
    switch (i.kind) {
      case "texto": return { ...base, tipo: "texto", longo: i.long, ...withCond }
      case "aviso": return { ref: i.id, tipo: "aviso", rotulo: i.label, obrigatorio: i.required, texto: i.text, ...withCond }
      case "horario": return { ...base, tipo: "horario", segundos: i.seconds, ...withCond }
      case "documento": return { ...base, tipo: "documento", ...(i.pattern ? { formato: i.pattern } : {}), anexo: i.attach, validade: i.validity, ...withCond }
      case "data": return { ...base, tipo: "data", nao_antes_de_hoje: i.notBeforeToday, ...(i.min ? { minimo: i.min } : {}), ...(i.max ? { maximo: i.max } : {}), ...withCond }
      case "pessoa": {
        const cargo = i.roleId ? typeName(cadastro.roleTypes, i.roleId) : undefined
        return { ...base, tipo: "pessoa", multipla: i.multiple, ...(cargo ? { cargo } : {}), deve_ser_elegivel: i.mustBeEligible && !!cargo, ...withCond }
      }
      case "isolamento": return { ...base, tipo: "isolamento", minimo_linhas: i.minRows, ...withCond }
      case "grupo": return { ...base, tipo: "grupo", minimo_linhas: i.minRows, colunas: i.columns.map((c) => exportItem(c) as ColunaPacote), ...withCond }
      case "anexo": return { ...base, tipo: "anexo", aceita: i.accept, minimo: i.min, dica: i.hint, ...withCond }
      case "numero": return { ...base, tipo: "numero", unidade: i.unit, casas_decimais: i.decimals, negativo: i.negative, ...(i.min !== undefined ? { minimo: i.min } : {}), ...(i.max !== undefined ? { maximo: i.max } : {}), ...withCond }
      case "verificacao": {
        if (i.answers !== "lista") return { ...base, tipo: "verificacao", respostas: i.answers, linhas: i.lines.map((l) => ({ ref: l.id, rotulo: l.label, impede: l.blockOn, justificar: l.noteOn })), ...withCond }
        const l = cadastro.optionLists.find((x) => x.id === i.answerListId)
        if (l) listsUsed.set(l.id, l)
        else pendencias.push({ descricao: `A lista de respostas de “${i.label}” não existe mais`, motivo: "duvida", onde: i.id })
        const word = (id: string) => l?.items.find((x) => x.id === id)?.label ?? id
        return { ...base, tipo: "verificacao", respostas: "lista", ...(l ? { lista_respostas: l.name } : {}), linhas: i.lines.map((x) => ({ ref: x.id, rotulo: x.label, impede: x.blockOn.map(word), justificar: x.noteOn.map(word) })), ...withCond }
      }
      case "marcacao": {
        const l = i.listId ? cadastro.optionLists.find((x) => x.id === i.listId) : undefined
        if (l) {
          listsUsed.set(l.id, l)
          if ((i.blockOptionIds ?? []).length) pendencias.push({ descricao: `Em “${i.label}”, impedem a etapa: ${(i.blockOptionIds ?? []).map((id) => l.items.find((x) => x.id === id)?.label ?? id).join(", ")}. Marque de novo em Modelos › Fluxo`, motivo: "fora_do_produto", onde: i.id })
          return { ...base, tipo: "marcacao", lista: l.name, multipla: i.multiple, outro: i.other, ...withCond }
        }
        if (i.listId) pendencias.push({ descricao: `A lista de “${i.label}” não existe mais; opções exportadas vazias`, motivo: "duvida", onde: i.id })
        return { ...base, tipo: "marcacao", opcoes: i.options.map((o) => ({ rotulo: o.label, ...(o.blocks ? { impede: true } : {}) })), multipla: i.multiple, outro: i.other, ...withCond }
      }
    }
  }

  const etapas: EtapaPacote[] = ver.stages.map((st) => ({
    ref: st.id, nome: st.name, ...(st.kind ? { tipo: st.kind } : {}),
    assinaturas: st.slots.map((sl) => {
      const names = sl.roleIds.map((id) => typeName(cadastro.roleTypes, id)).filter((x): x is string => !!x)
      const cargo = names.length === 0 ? null : names.length === 1 ? names[0] : names
      if (sl.meaning === null) pendencias.push({ descricao: "Assinatura sem significado no modelo de origem: escreva o que ela atesta", motivo: "duvida", onde: sl.id })
      if (sl.kind === "pessoa") pendencias.push({ descricao: `“${sl.meaning}” é assinada por uma pessoa nomeada; na outra planta, escolha a pessoa`, motivo: "duvida", onde: sl.id })
      const quando = sl.requiredWhen ? condOut(sl.requiredWhen) : undefined
      return { ref: sl.id, significado: sl.meaning ?? "Assinatura", cargo, minimo: sl.min, obrigatoria: sl.required, ...(sl.delegable ? { administrativa_delegavel: true } : {}), ...(quando ? { obrigatoria_quando: quando } : {}) }
    }),
    secoes: (ver.form?.sections ?? []).filter((s) => s.stageId === st.id || (s.stageId === undefined && st === ver.stages[0])).map((s) => ({ ref: s.id, titulo: s.title, itens: s.items.map(exportItem) })),
  }))

  return {
    formato: FORMATO,
    origem: { tipo: "exportacao", arquivos: [], gerado_por: { ferramenta: opcoes.ferramenta ?? "PTW in a Box", ...(opcoes.versaoApp ? { versao: opcoes.versaoApp } : {}) }, gerado_em: opcoes.agora },
    modelo: {
      nome: tpl.name,
      ...(ver.form?.electrical ? { politica_eletrica: structuredClone(ver.form.electrical) } : {}),
      ...(ver.note ? { descricao: ver.note } : {}),
      ...(ver.maxWindowHours != null ? { prazo_maximo_horas: ver.maxWindowHours } : {}),
      ...(ver.holdsEquipment === false ? { prende_equipamento: false } : {}),
      escopo: {
        tipos_de_local: ver.locationTypeIds.map((id) => typeName(cadastro.locationTypes, id)).filter((x): x is string => !!x),
        tipos_de_ativo: ver.assetTypeIds.map((id) => typeName(cadastro.assetTypes, id)).filter((x): x is string => !!x),
      },
    },
    listas: [...listsUsed.values()].map((l) => ({ nome: l.name, itens: l.items.filter((x) => x.active).map((x) => x.label) })),
    etapas,
    separacoes: ver.separation.map((r) => ({ a: r.slotA, b: r.slotB, ...(r.locked ? { travada: true } : {}) })),
    campos_do_sistema: [],
    pendencias,
  }
}

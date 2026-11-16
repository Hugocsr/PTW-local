/**
 * The client's interlock-disabling form ("Desabilitação de intertravamento físico e lógico /
 * dispositivo de segurança"), brought in exactly as a plant would: the `ptw.modelo/1` package goes
 * through the real import (`importarModelo` → store write `importTemplate`), then a reviewer fills the
 * empty "Intertravamentos" list, resolves the cargos the package names with the plant's own, sets the
 * scope and activates the version. Every step is a registry write with its audit events.
 *
 * The package is the client's (clientes/desabilitacao-intertravamento) minus one pendência that quoted
 * the form's footer contacts (phone numbers stay out of the app's data).
 */
import { sha256Hex, type AuditCtx, type AuditDraft } from "@/core/audit"
import { importarModelo, lerPacote, normalizar } from "@/core/templatePackage"
import { registryStep, type Action } from "@/registry/store"
import type { FormItem, MarcacaoItem, PermitTemplate, RegistryState, SignSlot, TemplateVersion } from "@/registry/types"
import pacoteTexto from "./desabilitacao-intertravamento.ptw-modelo.json?raw"
import { C } from "./ids"

export const PACOTE_ARQUIVO = "desabilitacao-intertravamento.ptw-modelo.json"
export { pacoteTexto }

/** Tags of the plant's interlocks and safety devices (fictional). */
export const INTERLOCKS = [
  "IT-DG-01 Pressão alta do digestor",
  "IT-DG-04 Vazão baixa da circulação inferior do digestor",
  "IT-LAV-03 Nível alto do tanque de filtrado TQ-312",
  "IT-BRQ-02 Vazamento de ClO₂ no gerador (detector de gás)",
  "IT-EV-03 Nível alto do tanque de licor preto forte",
  "IT-CR-01 Pressão alta da fornalha da caldeira de recuperação",
  "IT-CR-07 Nível baixo do tubulão",
  "IT-CR-12 Parada dos ventiladores de tiragem induzida",
  "IT-CF-02 Temperatura alta dos gases da caldeira de força",
  "IT-CAU-05 Chama apagada no queimador do forno de cal",
  "IT-MS-04 Quebra de folha no secador",
  "IT-UTL-05 Pressão baixa do ar de instrumentos",
  "IT-ETE-02 pH do efluente tratado fora da faixa",
  "IT-MAD-02 Sobrecarga do transportador de cavacos TC-101",
] as const

const R = C.role
/** The package's cargo names the plant does not have, resolved by the reviewer. */
const CARGO_RESOLVIDO: Record<string, string[]> = {
  [normalizar("Responsável Operacional")]: [R.supTurno, R.coordArea],
  [normalizar("Especialistas de operação")]: [R.espOp],
  [normalizar("Especialistas de manutenção")]: [R.espMan],
  [normalizar("Executante da Desabilitação")]: [R.tecIns, R.tecEle],
  [normalizar("Responsável pela Autorização")]: [R.supTurno, R.coordArea, R.gerArea],
}
/** The Entrega the form does not have (the product adds it): the executante ends the intervention. */
const ENTREGA = { meaning: "Conclui a intervenção e libera a reabilitação", roleIds: [R.tecIns, R.tecEle] }

export interface InterlockModel {
  templateId: string
  versionId: string
  /** Item ids by what they are (the import makes them; the story answers them). */
  item: { tipo: string; classe: string; tag: string; funcao: string; motivo: string; justif: string; verif: string; medidas: string; reab: string }
  /** Option ids of "tipo" and "classe" by label; list items of "Intertravamentos" by tag (first word). */
  option: (item: "tipo" | "classe", label: string) => string
  interlock: (tag: string) => string
  simNa: { sim: string; na: string }
  verifLines: string[]
  reabLines: string[]
  /** Slot ids: Solicitação, approval by class (1–4), Desabilitação, Entrega, Reabilitação. */
  slot: { sol: string; classe: Record<1 | 2 | 3 | 4, string>; campo: string; ent: string; area: string }
}

type Who = { at: string; who: string }

/**
 * Runs the import and the review on `before`; returns the new registry, the audit drafts in order and
 * the ids the story needs. Throws if any step is refused (the sample must follow the rules).
 */
export function importInterlockModel(before: RegistryState, when: { importa: Who; lista: Who; revisa: Who; ativa: Who }): { state: RegistryState; events: AuditDraft[]; model: InterlockModel } {
  let state = before
  const events: AuditDraft[] = []
  const ctx = (w: Who): AuditCtx => ({ at: w.at, actorId: w.who, auth: "sessao" })
  const run = (action: Action, w: Who) => {
    const step = registryStep(state, action, [], ctx(w))
    if (step.denied) throw new Error(`Cenário celulose: ${action.kind} recusado: ${step.denied.code} ${step.denied.message}`)
    state = step.state
    events.push(...step.events)
  }

  // 1. Importar modelo: the package, read and checked like the screen does.
  let n = 0
  const { pacote, erro } = lerPacote(pacoteTexto)
  if (erro) throw new Error(`Cenário celulose: pacote ilegível: ${erro}`)
  const r = importarModelo(pacote, state, { agora: when.importa.at, novoId: () => C.imported(++n), pacote: { arquivo: PACOTE_ARQUIVO, sha256: sha256Hex(pacoteTexto) } })
  if (!r.rascunho) throw new Error(`Cenário celulose: importação com erro: ${r.problemas.filter((p) => p.nivel === "erro").map((p) => `${p.onde}: ${p.mensagem}`).join("; ")}`)
  const draft = r.rascunho
  run({ kind: "importTemplate", draft }, when.importa)

  // 2. The list the form left empty: the plant's interlock tags.
  const list = state.optionLists.find((l) => normalizar(l.name) === normalizar("Intertravamentos"))
  if (!list) throw new Error("Cenário celulose: lista Intertravamentos ausente")
  run({ kind: "update", list: "optionLists", id: list.id, fn: (l) => ({ ...l, items: INTERLOCKS.map((label, i) => ({ id: C.interlock(i + 1), label, active: true })) }) }, when.lista)

  // 3. Review: cargos of the plant in place of the ones it lacks, the Entrega's signer, the scope.
  const created = new Map(draft.cargosNovos.map((t) => [t.id, normalizar(t.label)]))
  const resolve = (sl: SignSlot): SignSlot => {
    if (sl.roleIds.length === 0) return { ...sl, ...ENTREGA }
    const ids = sl.roleIds.flatMap((id) => (created.has(id) ? CARGO_RESOLVIDO[created.get(id)!] ?? [] : [id]))
    if (!ids.length) throw new Error(`Cenário celulose: cargo sem resolução em “${sl.meaning}”`)
    return { ...sl, roleIds: [...new Set(ids)] }
  }
  const editVersion = (f: (v: TemplateVersion) => TemplateVersion) => (t: PermitTemplate): PermitTemplate =>
    ({ ...t, versions: t.versions.map((v) => (v.id === draft.versao.id ? f(v) : v)) })
  run({
    kind: "update", list: "templates", id: draft.modeloId,
    fn: editVersion((v) => ({
      ...v,
      note: "Revisada: cargos da planta, escopo e lista de intertravamentos",
      locationTypeIds: Object.values(C.locationType),
      assetTypeIds: Object.values(C.assetType),
      stages: v.stages.map((st) => ({ ...st, slots: st.slots.map(resolve) })),
    })) as never,
  }, when.revisa)
  // The disabling of an interlock accompanies another PT on the same equipment (maintenance, hot
  // work on the analyzer): the reviewer turns "Prende o equipamento" off.
  run({ kind: "update", list: "templates", id: draft.modeloId, fn: editVersion((v) => ({ ...v, holdsEquipment: false })) as never }, when.revisa)

  // 4. Ativar versão.
  run({ kind: "update", list: "templates", id: draft.modeloId, fn: editVersion((v) => ({ ...v, status: "ativa", activatedAt: when.ativa.at })) as never }, when.ativa)
  // The cargos the import created are no longer used by anyone: the reviewer removes them.
  for (const id of created.keys()) run({ kind: "removeType", list: "roleTypes", id }, when.ativa)

  /* ---- the ids the story answers ---- */
  const tpl = state.templates.find((t) => t.id === draft.modeloId)!
  const ver = tpl.versions.find((v) => v.id === draft.versao.id)!
  const items = (ver.form?.sections ?? []).flatMap((s) => s.items)
  const byLabel = (start: string): FormItem => {
    const it = items.find((i) => i.kind !== "aviso" && normalizar(i.label).startsWith(normalizar(start)))
    if (!it) throw new Error(`Cenário celulose: item ausente: ${start}`)
    return it
  }
  const item = {
    tipo: byLabel("Intertravamento lógico, intertravamento físico").id,
    classe: byLabel("Classe").id,
    tag: byLabel("Tag do intertravamento").id,
    funcao: byLabel("Função do intertravamento").id,
    motivo: byLabel("Motivo da desabilitação").id,
    justif: byLabel("Justificativa de ultrapasse").id,
    verif: byLabel("Itens de verificação").id,
    medidas: byLabel("Medidas preventivas").id,
    reab: byLabel("Reabilitação").id,
  }
  const option = (k: "tipo" | "classe", label: string) => {
    const it = items.find((i) => i.id === item[k]) as MarcacaoItem
    const o = it.options.find((x) => x.label === label)
    if (!o) throw new Error(`Cenário celulose: opção ausente: ${label}`)
    return o.id
  }
  const filled = state.optionLists.find((l) => l.id === list.id)!
  const interlock = (tag: string) => {
    const x = filled.items.find((i) => i.label.split(" ")[0] === tag)
    if (!x) throw new Error(`Cenário celulose: intertravamento ausente: ${tag}`)
    return x.id
  }
  const simnaList = state.optionLists.find((l) => l.name === "SIM / N.A.")!
  const lines = (id: string) => { const it = items.find((i) => i.id === id); return it?.kind === "verificacao" ? it.lines.map((l) => l.id) : [] }
  const slots = ver.stages.flatMap((s) => s.slots)
  const slotBy = (meaning: string) => { const s = slots.find((x) => x.meaning === meaning); if (!s) throw new Error(`Cenário celulose: assinatura ausente: ${meaning}`); return s.id }
  const stageSlot = (kind: string) => ver.stages.find((s) => s.kind === kind)!.slots[0].id
  return {
    state, events,
    model: {
      templateId: tpl.id, versionId: ver.id, item, option, interlock,
      simNa: { sim: simnaList.items.find((i) => i.label === "SIM")!.id, na: simnaList.items.find((i) => i.label === "N.A.")!.id },
      verifLines: lines(item.verif), reabLines: lines(item.reab),
      slot: {
        sol: stageSlot("solicitacao"), campo: stageSlot("aceite_campo"), ent: stageSlot("entrega"), area: stageSlot("aceite_area"),
        classe: { 1: slotBy("Autoriza a desabilitação classe 1"), 2: slotBy("Autoriza a desabilitação classe 2"), 3: slotBy("Autoriza a desabilitação classe 3"), 4: slotBy("Autoriza a desabilitação classe 4") },
      },
    },
  }
}

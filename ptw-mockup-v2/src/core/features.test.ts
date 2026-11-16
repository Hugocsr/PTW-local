/**
 * The five rules of 2026-11-09 (scratchpad contracts R1–R5, mirrored from the database): options that
 * stop the stage, checklist answers from a list, the longest window per version, a signature any of
 * several cargos may give, and Prorrogar.
 */
import { describe, expect, it } from "vitest"
import { PERMIT_ID, permitSeed, permitSeedEvents, SIM_START } from "@/permit/seed"
import { permitReducer, type PermitAction } from "@/permit/store"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import type { PermitData } from "@/permit/types"
import type { FormItem, FormSpec, OptionList, Person, RegistryState, TemplateVersion } from "@/registry/types"
import { blockingChoice, freezeForm, itemProblems, lineAnswerLabel, lineChoices, validateForm } from "./form"
import { answerProblem, formProblem, normalizeForm, permitBlocker } from "./formRules"
import { checkRoleAt, joinOr, personIneligible } from "./eligibility"
import { activationDenied } from "./templateVersions"
import { maxWindowText, windowLimitDenied } from "./windowLimit"
import { planExtend } from "./extension"
import { addMinutes, dayOf, instant } from "./time"
import { appendEvents, verifyChain } from "./audit"
import { exportarModelo, importarModelo, validarPacote } from "./templatePackage"

const NOW = SIM_START
const TODAY = dayOf(NOW)
const SIM = ID.listItem("simna", "SIM"), NA = ID.listItem("simna", "N.A.")
const lists: OptionList[] = seed.optionLists
const ctx = { people: seed.people, pathIds: [], today: TODAY, now: NOW }
const step = (data: PermitData, a: PermitAction, who: string, at = NOW, registry: RegistryState = seed) =>
  permitReducer(data, a, { audit: { at, actorId: who }, registry })

describe("R1 · opção de marcação que impede a etapa", () => {
  const classe: Extract<FormItem, { kind: "marcacao" }> = {
    id: "classe", kind: "marcacao", label: "Classe", required: true, multiple: false, other: false,
    options: [{ id: "c4", label: "Classe 4" }, { id: "c5", label: "Classe 5", blocks: true }],
  }
  const form: FormSpec = { sections: [{ id: "s", title: "S", items: [classe] }] }
  it("escolher a opção que impede bloqueia (completude e banco, mesma mensagem)", () => {
    expect(itemProblems(classe, { t: "marcacao", ids: ["c4"] }).blocked).toEqual([])
    expect(itemProblems(classe, { t: "marcacao", ids: ["c5"] }).blocked).toEqual(["Classe: “Classe 5” impede a etapa"])
    expect(permitBlocker(form, { classe: { t: "marcacao", ids: ["c5"] } }, 0, {}, ctx)).toBe("Classe: “Classe 5” impede a etapa")
  })
  it("opções de lista: blockOptionIds com listId; congelar copia o bloqueio para a opção", () => {
    const docs = lists.find((l) => l.id === ID.list.docs)!
    const quente = ID.listItem("docs", "PT de trabalho a quente")
    const it2: FormItem = { id: "d", kind: "marcacao", label: "Documentos", required: false, multiple: true, other: false, options: [], listId: docs.id, blockOptionIds: [quente] }
    expect(blockingChoice(it2, [quente], lists)?.label).toBe("PT de trabalho a quente")
    const f: FormSpec = { sections: [{ id: "s", title: "S", items: [it2] }] }
    expect(permitBlocker(f, { d: { t: "marcacao", ids: [quente] } }, 0, {}, { ...ctx, optionLists: lists })).toBe("Documentos: “PT de trabalho a quente” impede a etapa")
    const frozen = freezeForm(f, lists).sections[0].items[0] as Extract<FormItem, { kind: "marcacao" }>
    expect(frozen.listId).toBeUndefined()
    expect(frozen.options.find((o) => o.id === quente)?.blocks).toBe(true)
    expect(formProblem(JSON.parse(JSON.stringify(freezeForm(f, lists))))).toBeNull()
  })
  it("estrutura: blockOptionIds sem lista é recusado; todas as opções impedindo é erro de montagem", () => {
    expect(formProblem({ sections: [{ items: [{ id: "x", kind: "marcacao", label: "X", options: [], blockOptionIds: [ID.listItem("simna", "SIM")] }] }] })).toBe("X: opções da lista que impedem sem lista")
    const all: FormItem = { ...classe, options: classe.options.map((o) => ({ ...o, blocks: true })) }
    expect(validateForm({ sections: [{ id: "s", title: "S", items: [all] }] }, [], [])).toContain("Classe: todas as opções impedem a etapa")
    expect(normalizeForm(JSON.parse(JSON.stringify(form))).sections[0].items[0]).toEqual(classe)
  })
})

describe("R2 · respostas da verificação vindas de uma lista", () => {
  const area: Extract<FormItem, { kind: "verificacao" }> = {
    id: "area", kind: "verificacao", label: "Área", required: true, answers: "lista", answerListId: ID.list.simna,
    lines: [{ id: "l1", label: "Área liberada", blockOn: [NA], noteOn: [] }, { id: "l2", label: "Iluminação", blockOn: [], noteOn: [NA] }],
  }
  const form: FormSpec = { sections: [{ id: "s", title: "S", items: [area] }] }
  const actx = { permitId: "p", permitAssetIds: [], attachments: [], people: seed.people, optionLists: lists, pathIds: [], today: TODAY, now: NOW }
  it("as respostas são os itens da lista; o valor gravado é o id do item", () => {
    expect(lineChoices(area, lists).map((c) => c.label)).toEqual(["SIM", "N.A."])
    expect(lineAnswerLabel(area, NA, lists)).toBe("N.A.")
    expect(answerProblem(form, "area", { t: "verificacao", lines: { l1: { a: SIM } } }, actx)).toBeNull()
    expect(answerProblem(form, "area", { t: "verificacao", lines: { l1: { a: "sim" } } }, actx)?.code).toBe("PTW15")
  })
  it("item que impede e item que pede justificativa, com o rótulo da lista", () => {
    expect(itemProblems(area, { t: "verificacao", lines: { l1: { a: NA }, l2: { a: SIM } } }, { lists }).blocked).toEqual(["Área liberada: “N.A.” impede a etapa"])
    expect(itemProblems(area, { t: "verificacao", lines: { l1: { a: SIM }, l2: { a: NA } } }, { lists }).missing).toEqual(["Iluminação: justificar “N.A.”"])
    expect(permitBlocker(form, { area: { t: "verificacao", lines: { l1: { a: NA } } } }, 0, {}, { ...ctx, optionLists: lists })).toBe('Área liberada: "N.A." impede a etapa')
  })
  it("estrutura: lista exige answerListId (uuid) e respostas uuid; ativar confere os itens", () => {
    expect(formProblem({ sections: [{ items: [{ ...area, answerListId: undefined }] }] })).toBe("Área: lista de respostas inválida")
    expect(formProblem({ sections: [{ items: [{ ...area, lines: [{ id: "l1", label: "x", blockOn: ["nao"] }] }] }] })).toBe("Área: linhas inválidas")
    const ver = { ...seed.templates.find((t) => t.id === ID.template.geral)!.versions[0] }
    const bad: TemplateVersion = { ...ver, form: { sections: [{ id: "s", title: "S", items: [{ ...area, lines: [{ id: "l1", label: "x", blockOn: [ID.listItem("epi", "Luvas")], noteOn: [] }] }] }] } }
    expect(activationDenied(bad, lists)?.code).toBe("PTW15")
  })
})

describe("R3 · prazo máximo da janela por versão", () => {
  it("texto em dias quando múltiplo de 24 h, senão em horas", () => {
    expect(maxWindowText(72)).toBe("até 3 dias")
    expect(maxWindowText(24)).toBe("até 1 dia")
    expect(maxWindowText(12)).toBe("até 12 horas")
  })
  it("fim − início acima do prazo: PTW31; nulo = sem limite", () => {
    const start = instant("2026-11-07T08:00:00")
    expect(windowLimitDenied({ maxWindowHours: 12 }, start, addMinutes(start, 12 * 60))).toBeNull()
    expect(windowLimitDenied({ maxWindowHours: 12 }, start, addMinutes(start, 12 * 60 + 1))).toEqual({ code: "PTW31", message: "A janela passa do prazo máximo deste modelo (até 12 horas)" })
    expect(windowLimitDenied({ maxWindowHours: null }, start, addMinutes(start, 10_000))).toBeNull()
  })
  it("Enviar uma PT com janela maior que o prazo é recusado (PTW31)", () => {
    const data = structuredClone(permitSeed)
    // A draft on a free asset whose window runs 08:00–22:00 (14 h > 12 h of the Painel v2).
    data.permits = data.permits.map((p) => (p.id === PERMIT_ID.draft ? { ...p, assetIds: [ID.asset(10)], windowEnd: instant("2026-11-07T22:00:00") } : p))
    data.permits = data.permits.filter((p) => p.id !== PERMIT_ID.p0012)
    const s = step(data, { kind: "sign", permitId: PERMIT_ID.draft, slotId: ID.slot("painel2", "sol"), personId: ID.person.rafael }, ID.person.rafael)
    expect(s.denied).toEqual({ code: "PTW31", message: "A janela passa do prazo máximo deste modelo (até 12 horas)" })
  })
})

describe("R4 · assinatura aceita por vários cargos", () => {
  const p = (roleId: string): Person => ({ ...seed.people.find((x) => x.id === ID.person.paulo)!, roles: [{ id: "r", roleId, scopeLocationId: null, validUntil: "2027-12-31" }] })
  it("elegível com qualquer um dos cargos", () => {
    expect(personIneligible(p(ID.role.lider), [ID.role.tec, ID.role.lider], null, TODAY, NOW)).toBeNull()
    expect(personIneligible(p(ID.role.exec), [ID.role.tec, ID.role.lider], null, TODAY, NOW)).toBe("cargo vencido ou fora do escopo do local")
    expect(checkRoleAt([p(ID.role.tec), p(ID.role.exec)], [ID.role.tec, ID.role.lider], null, false, TODAY).length).toBe(1)
    expect(joinOr(["Gerente industrial", "Gerente de manutenção", "Gerente da área"])).toBe("Gerente industrial, Gerente de manutenção ou Gerente da área")
  })
  it("ativar sem cargo: PTW28", () => {
    const ver = seed.templates.find((t) => t.id === ID.template.painel)!.versions[1]
    const empty: TemplateVersion = { ...ver, stages: ver.stages.map((s, i) => (i === 0 ? { ...s, slots: s.slots.map((x) => ({ ...x, roleIds: [] })) } : s)) }
    expect(activationDenied(empty)?.code).toBe("PTW28")
  })
})

describe("R5 · Prorrogar a janela", () => {
  const P8 = PERMIT_ID.p0008
  const end = (d: PermitData) => d.permits.find((x) => x.id === P8)!.windowEnd
  it("quem pode emitir prorroga; o histórico diz de/para e o motivo", () => {
    const data = structuredClone(permitSeed)
    const s = step(data, { kind: "extend", permitId: P8, personId: ID.person.marina, newEnd: instant("2026-11-07T19:00:00"), reason: "Peça chega à tarde" }, ID.person.marina)
    expect(s.denied).toBeUndefined()
    expect(end(s.data)).toBe(instant("2026-11-07T19:00:00"))
    expect(s.data.extensions.at(-1)).toMatchObject({ permitId: P8, oldEnd: instant("2026-11-07T17:00:00"), reason: "Peça chega à tarde", personId: ID.person.marina })
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({ action: "pt.prorrogada", text: "Janela prorrogada: até 07/11 17:00 → até 07/11 19:00 · Peça chega à tarde" })
    expect(s.events[0].data).toEqual({ de: { fim: "2026-11-07T20:00:00+00:00" }, para: { fim: "2026-11-07T22:00:00+00:00" }, motivo: "Peça chega à tarde" })
  })
  it("recusas: PTW32 quem não emite; PTW33 sem motivo ou fim anterior; PTW31 além do prazo; PTW33 depois do fim", () => {
    const data = structuredClone(permitSeed)
    const later = instant("2026-11-07T19:00:00")
    expect(step(data, { kind: "extend", permitId: P8, personId: ID.person.paulo, newEnd: later, reason: "x" }, ID.person.paulo).denied?.code).toBe("PTW32")
    expect(step(data, { kind: "extend", permitId: P8, personId: ID.person.marina, newEnd: later, reason: " " }, ID.person.marina).denied?.code).toBe("PTW33")
    expect(step(data, { kind: "extend", permitId: P8, personId: ID.person.marina, newEnd: instant("2026-11-07T16:00:00"), reason: "x" }, ID.person.marina).denied?.code).toBe("PTW33")
    expect(step(data, { kind: "extend", permitId: P8, personId: ID.person.marina, newEnd: instant("2026-11-07T19:00:01"), reason: "x" }, ID.person.marina).denied?.code).toBe("PTW31")
    const after = step(data, { kind: "extend", permitId: P8, personId: ID.person.marina, newEnd: later, reason: "x" }, ID.person.marina, instant("2026-11-07T17:00:00"))
    expect(after.denied).toEqual({ code: "PTW33", message: "Só a PT emitida ou ativa, antes do fim da janela, é prorrogada" })
    // A refusal changes nothing and stays in the trail.
    expect(after.data).toBe(data)
    expect(after.events[0]).toMatchObject({ action: "pt.prorrogada", ok: false })
  })
  it("o plano diz quem pode antes de pedir o novo fim (Retomar usa a mesma regra)", () => {
    const pm = permitSeed.permits.find((x) => x.id === P8)!
    const ver = seed.templates.find((t) => t.id === pm.templateId)!.versions.find((v) => v.id === pm.versionId)!
    const base = { permit: pm, ver, people: seed.people, locations: seed.locations, roleLabel: (id: string) => id, now: NOW }
    expect(planExtend({ ...base, signer: seed.people.find((x) => x.id === ID.person.marina)! }).ok).toBe(true)
    expect(planExtend({ ...base, signer: seed.people.find((x) => x.id === ID.person.paulo)! }).ok).toBe(false)
  })
  it("o exemplo traz a PT 0010 prorrogada e a cadeia continua íntegra", () => {
    expect(permitSeed.extensions.map((x) => x.permitId)).toEqual([PERMIT_ID.p0010])
    expect(permitSeedEvents.some((e) => e.action === "pt.prorrogada" && e.text.startsWith("Janela prorrogada: até 06/11 17:00 → até 06/11 19:00"))).toBe(true)
    expect(verifyChain(appendEvents([], permitSeedEvents, seed.units[0].id)).ok).toBe(true)
  })
})

describe("pacote ptw.modelo/1 · os cinco recursos", () => {
  const O = (t: string) => ({ pagina: 1, trecho: t })
  const pkg = {
    formato: "ptw.modelo/1",
    origem: { tipo: "documento", arquivos: [{ arquivo: "f.png", sha256: "a".repeat(64), paginas: 1 }], gerado_por: { ferramenta: "teste" }, gerado_em: "2026-11-09" },
    modelo: { nome: "Desabilitação", prazo_maximo_horas: 168, escopo: { tipos_de_local: [], tipos_de_ativo: [] } },
    listas: [{ nome: "SIM / N.A.", itens: ["SIM", "N.A."], origem: O("SIM N.A.") }, { nome: "Intertravamentos", itens: [], origem: O("TAG DO INTERTRAVAMENTO") }],
    etapas: [
      { ref: "sol", nome: "Solicitação", tipo: "solicitacao", origem: O("Solicitante"), assinaturas: [{ ref: "a1", significado: "Solicita", cargo: "Responsável Operacional", minimo: 1, obrigatoria: true, origem: O("Responsável Operacional") }],
        secoes: [{ titulo: "Classe", itens: [
          { ref: "classe", tipo: "marcacao", rotulo: "Classe", obrigatorio: true, multipla: false, outro: false, origem: O("CLASSE 4 CLASSE 5"), opcoes: [{ rotulo: "Classe 4" }, { rotulo: "Classe 5", impede: true }] },
          { ref: "tag", tipo: "marcacao", rotulo: "Intertravamento", obrigatorio: true, multipla: false, outro: false, lista: "Intertravamentos", origem: O("TAG DO INTERTRAVAMENTO") },
          { ref: "v", tipo: "verificacao", rotulo: "Itens de verificação", obrigatorio: true, respostas: "lista", lista_respostas: "SIM / N.A.", origem: O("ITENS DE VERIFICAÇÃO"),
            linhas: [{ rotulo: "Cartão instalado", impede: [], justificar: ["N.A."], origem: O("Cartão instalado") }] },
        ] }] },
      { ref: "emi", nome: "Aprovação", tipo: "emissao", origem: O("APROVAÇÃO"), secoes: [],
        assinaturas: [{ ref: "a2", significado: "Autoriza", cargo: ["Gerente industrial", "Gerente da área"], minimo: 1, obrigatoria: true, origem: O("Gerente industrial Gerente da área") }] },
    ],
    separacoes: [], campos_do_sistema: [], pendencias: [],
  }
  it("importa: impede, lista de respostas, prazo, vários cargos; lista vazia é aviso", () => {
    const r = importarModelo(pkg, seed, { agora: "2026-11-09T10:00:00-03:00" })
    expect(r.problemas.filter((p) => p.nivel === "erro")).toEqual([])
    expect(r.problemas.some((p) => p.nivel === "aviso" && p.mensagem.includes("a lista ainda não tem itens"))).toBe(true)
    const v = r.rascunho!.versao
    expect(v.maxWindowHours).toBe(168)
    const items = v.form!.sections.flatMap((s) => s.items)
    const classe = items.find((i) => i.label === "Classe") as Extract<FormItem, { kind: "marcacao" }>
    expect(classe.options.map((o) => !!o.blocks)).toEqual([false, true])
    const ver = items.find((i) => i.kind === "verificacao") as Extract<FormItem, { kind: "verificacao" }>
    expect(ver.answers).toBe("lista")
    expect(ver.answerListId).toBe(ID.list.simna)
    expect(ver.lines[0].noteOn).toEqual([NA])
    const emi = v.stages.find((s) => s.kind === "emissao")!.slots[0]
    expect(emi.roleIds).toHaveLength(2)
    expect(r.rascunho!.cargoPedido[emi.id]).toEqual(["Gerente industrial", "Gerente da área"])
  })
  it("“cargos” vale como “cargo”; os dois juntos é erro; rótulo fora da lista é erro", () => {
    const withCargos = structuredClone(pkg)
    const a2 = withCargos.etapas[1].assinaturas[0] as Record<string, unknown>
    a2.cargos = a2.cargo; delete a2.cargo
    expect(validarPacote(withCargos).problemas.filter((p) => p.nivel === "erro")).toEqual([])
    a2.cargo = "Gerente"
    expect(validarPacote(withCargos).problemas.some((p) => p.mensagem.includes("não os dois"))).toBe(true)
    const badLabel = structuredClone(pkg)
    ;(badLabel.etapas[0].secoes[0].itens[2] as { linhas: { justificar: string[] }[] }).linhas[0].justificar = ["NÃO"]
    expect(validarPacote(badLabel).problemas.some((p) => p.mensagem.includes("não é item da lista"))).toBe(true)
  })
  it("exporta e volta: prazo, impede, lista de respostas e cargos", () => {
    const geral = seed.templates.find((t) => t.id === ID.template.geral)!
    const out = exportarModelo(geral, seed, { agora: "2026-11-09T10:00:00-03:00" })
    expect(out.modelo.prazo_maximo_horas).toBe(72)
    expect(out.etapas[1].assinaturas[0].cargo).toEqual([ID.role.tec, ID.role.lider].map((id) => seed.roleTypes.find((r) => r.id === id)!.label))
    const back = importarModelo(out, seed, { agora: "2026-11-09T10:00:00-03:00" })
    expect(back.problemas.filter((p) => p.nivel === "erro")).toEqual([])
    const items = back.rascunho!.versao.form!.sections.flatMap((s) => s.items)
    expect((items.find((i) => i.label === "Condição do tempo") as Extract<FormItem, { kind: "marcacao" }>).options.find((o) => o.label === "Ventos fortes")?.blocks).toBe(true)
    expect((items.find((i) => i.label === "Área de trabalho") as Extract<FormItem, { kind: "verificacao" }>).lines[0].noteOn).toEqual([NA])
    expect(back.rascunho!.versao.stages[1].slots[0].roleIds).toEqual([ID.role.tec, ID.role.lider])
  })
  it("prende_equipamento: ausente = prende; falso volta como holdsEquipment false", () => {
    const geral = seed.templates.find((t) => t.id === ID.template.geral)!
    const out = exportarModelo(geral, seed, { agora: "2026-11-09T10:00:00-03:00" })
    expect(out.modelo.prende_equipamento).toBeUndefined()
    expect(importarModelo(out, seed, { agora: "2026-11-09T10:00:00-03:00" }).rascunho!.versao.holdsEquipment).toBe(true)
    const solto = { ...geral, versions: geral.versions.map((v) => ({ ...v, holdsEquipment: false })) }
    const out2 = exportarModelo(solto, seed, { agora: "2026-11-09T10:00:00-03:00" })
    expect(out2.modelo.prende_equipamento).toBe(false)
    expect(validarPacote(out2).problemas.filter((p) => p.nivel === "erro")).toEqual([])
    expect(importarModelo(out2, seed, { agora: "2026-11-09T10:00:00-03:00" }).rascunho!.versao.holdsEquipment).toBe(false)
  })
})

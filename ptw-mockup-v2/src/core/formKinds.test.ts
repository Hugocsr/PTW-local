import { pickSlot, planSign } from "./signing"
import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import { importEvents } from "@/registry/auditModelos"
import { ID } from "@/registry/seedIds"
import { uuidv7 } from "@/lib/id"
import type { FormItem, FormSection, RegistryState, Stage, TemplateContent } from "@/registry/types"
import { codeMatches, dateIso, freezeForm, itemProblems, maskDate, sectionStatus, slotRequired, slotNeed, conditionPhrase, validateForm, type FormAnswers } from "./form"
import { checksForSlot, locationPathIds, signatureIssues, signatureProblems } from "./templateChecks"
import { aplicarImportacao, errosDeEsquema, exportarModelo, importarModelo, totaisDaImportacao, type PacoteModelo } from "./templatePackage"
import exampleOnDisk from "../../../.claude/skills/ptw-modelo-de-formulario/exemplos/intervencao-desenergizada-em-painel.ptw-modelo.json?raw"

const TODAY = "2026-11-08"
const ctx = { people: seed.people, today: TODAY }
const base = { id: "x", label: "Item", required: true }
const sec = (items: FormItem[]): FormSection => ({ id: "s", title: "S", stageId: "st", items })
const stages: Stage[] = [{ id: "st", name: "Etapa", slots: [{ id: "sl", meaning: "Assina", kind: "cargo", roleIds: [ID.role.tec], personId: null, min: 1, required: true }] }]

describe("tipos novos · regras", () => {
  it("Documento: código no formato, anexo e validade (vencido impede)", () => {
    const doc: FormItem = { ...base, label: "Nº da APR", kind: "documento", pattern: "APR-####", attach: true, validity: true }
    expect(codeMatches("apr-0042", "APR-####")).toBe(true)
    expect(codeMatches("APR-42", "APR-####")).toBe(false)
    expect(itemProblems(doc, undefined, ctx).missing).toEqual(["Nº da APR", "Nº da APR: anexar o documento", "Nº da APR: validade"])
    expect(itemProblems(doc, { t: "documento", code: "APR-12", files: [], validUntil: "2026-12-31" }, ctx).missing).toContain("Nº da APR: formato APR-####")
    const file = uuidv7()
    expect(itemProblems(doc, { t: "documento", code: "APR-0042", files: [file], validUntil: "2026-12-31" }, ctx)).toEqual({ missing: [], blocked: [] })
    // stored ISO, shown dd/mm/aaaa
    expect(itemProblems(doc, { t: "documento", code: "APR-0042", files: [file], validUntil: "2026-11-01" }, ctx).blocked).toEqual(["Nº da APR: vencido em 01/11/2026"])
    expect(itemProblems(doc, { t: "documento", code: "APR-0042", files: [file], validUntil: "01/11/2026" }, ctx).missing).toEqual(["Nº da APR: validade"])
  })

  it("Data: máscara, data real, não antes de hoje e faixa impedem", () => {
    expect(maskDate("08112026")).toBe("08/11/2026")
    expect(dateIso("31/02/2026")).toBeNull()
    const d: FormItem = { ...base, label: "Data da medição", kind: "data", notBeforeToday: true, max: "2026-12-31" }
    expect(itemProblems(d, undefined, ctx).missing).toEqual(["Data da medição"])
    expect(itemProblems(d, { t: "data", v: "2026-11-07" }, ctx).blocked).toEqual(["Data da medição: 07/11/2026 está antes de hoje"])
    expect(itemProblems(d, { t: "data", v: "2027-01-02" }, ctx).blocked[0]).toMatch(/depois de 31\/12\/2026/)
    expect(itemProblems(d, { t: "data", v: "2026-11-08" }, ctx)).toEqual({ missing: [], blocked: [] })
  })

  it("Pessoa: deve estar elegível no cargo (cargo vencido ou sem cargo impede)", () => {
    const vigia: FormItem = { ...base, label: "Vigia", kind: "pessoa", multiple: true, roleId: ID.role.exec, mustBeEligible: true }
    expect(itemProblems(vigia, { t: "pessoa", ids: [ID.person.carlos] }, ctx)).toEqual({ missing: [], blocked: [] })
    expect(itemProblems(vigia, { t: "pessoa", ids: [ID.person.marina] }, ctx).blocked).toEqual(["Vigia: Marina Costa não elegível (não tem o cargo)"])
    expect(itemProblems(vigia, { t: "pessoa", ids: [ID.person.carlos] }, { ...ctx, today: "2027-02-01" }).blocked[0]).toMatch(/cargo vencido/)
    // without a cargo, mustBeEligible still checks record and account (as the database does)
    const semCargo: FormItem = { ...vigia, roleId: undefined }
    const off = { ...seed.people.find((p) => p.id === ID.person.carlos)!, status: "inativo" as const }
    expect(itemProblems(semCargo, { t: "pessoa", ids: [off.id] }, { ...ctx, people: [off] }).blocked).toEqual(["Vigia: Carlos Mota não elegível (cadastro inativo)"])
    expect(itemProblems(vigia, undefined, ctx).missing).toEqual(["Vigia"])
  })

  it("Pontos de isolamento: mínimo de pontos, campos de cada ponto, energia zero 'Não' impede", () => {
    const iso: FormItem = { ...base, label: "Bloqueios", kind: "isolamento", minRows: 2 }
    const ok = { id: "r1", point: "Q3", energy: "eletrica" as const, method: "Disjuntor travado", lock: "C-17", zero: "sim" as const, by: ID.person.rafael }
    expect(itemProblems(iso, { t: "isolamento", rows: [ok] }, ctx).missing).toEqual(["Bloqueios: 1 de 2 pontos"])
    const p = itemProblems(iso, { t: "isolamento", rows: [ok, { ...ok, id: "r2", lock: "", zero: "nao" }] }, ctx)
    expect(p.missing).toEqual(["Bloqueios · ponto 2 (Q3): cadeado/etiqueta"])
    expect(p.blocked).toEqual(["Bloqueios · ponto 2 (Q3): energia zero não verificada"])
  })

  it("Grupo repetível: cada linha responde as colunas; número fora da faixa impede", () => {
    const g: FormItem = {
      ...base, label: "Medições de gás", kind: "grupo", minRows: 1,
      columns: [{ id: "h", label: "Hora", required: true, kind: "horario", seconds: false }, { id: "o2", label: "O2", required: true, kind: "numero", unit: "%", decimals: 1, negative: false, min: 19.5, max: 23.5 }],
    }
    expect(itemProblems(g, undefined, ctx).missing).toEqual(["Medições de gás"])
    const a: FormAnswers = { x: { t: "grupo", rows: [{ id: "r1", answers: { h: { t: "horario", v: "08:00" }, o2: { t: "numero", v: 20.9 } } }, { id: "r2", answers: { o2: { t: "numero", v: 18 } } }] } }
    const st = sectionStatus(sec([g]), a, ctx)
    expect(st.missing).toEqual(["Medições de gás · linha 2 · Hora"])
    expect(st.blocked[0]).toMatch(/^Medições de gás · linha 2 · O2: 18,0 % está abaixo do mínimo/)
  })

  it("validateForm checks the new settings and group columns; freezeForm copies list options inside columns", () => {
    const g: FormItem = { ...base, label: "G", kind: "grupo", minRows: 1, columns: [] }
    const d: FormItem = { ...base, id: "d", label: "D", kind: "data", notBeforeToday: false, min: "2026-12-01", max: "2026-11-01" }
    expect(validateForm({ sections: [sec([g, d])] }, stages)).toEqual(expect.arrayContaining(["G: grupo sem colunas", "D: data inicial depois da final"]))
    const withList: FormItem = { ...base, label: "G", kind: "grupo", minRows: 0, columns: [{ id: "c", label: "EPI", required: true, kind: "marcacao", options: [], listId: seed.optionLists[0].id, multiple: true, other: false }] }
    const frozen = freezeForm({ sections: [sec([withList])] }, seed.optionLists).sections[0].items[0]
    expect(frozen.kind === "grupo" && frozen.columns[0].kind === "marcacao" && frozen.columns[0].listId === undefined && frozen.columns[0].options.length > 0).toBe(true)
  })

  it("Assinatura condicional: exigida só quando a condição vale; validateForm aponta condição de etapa posterior", () => {
    const slot = { required: true, requiredWhen: { itemId: "q", anyOf: ["o1"] } }
    expect(slotRequired(slot, {})).toBe(false)
    expect(slotRequired(slot, { q: { t: "marcacao", ids: ["o1"] } })).toBe(true)
    expect(slotRequired({ required: false, requiredWhen: slot.requiredWhen }, { q: { t: "marcacao", ids: ["o1"] } })).toBe(false)
    const q: FormItem = { ...base, id: "q", label: "Espaço confinado?", kind: "marcacao", options: [{ id: "o1", label: "Sim" }], multiple: false, other: false }
    const two: Stage[] = [{ id: "a", name: "A", slots: [{ id: "s1", meaning: "Vigia", kind: "cargo", roleIds: [ID.role.exec], personId: null, min: 1, required: true, requiredWhen: { itemId: "q", anyOf: ["o1"] } }] }, { id: "b", name: "B", slots: [] }]
    expect(validateForm({ sections: [{ id: "s", title: "S", stageId: "b", items: [q] }] }, two)).toContain("Assinatura “Vigia”: condição aponta para item de etapa posterior")
  })

  it("a conditional signature whose condition does not hold is never offered to sign (pickSlot)", () => {
    const slot = (id: string, cls: string) => ({ id, meaning: id, kind: "cargo", roleIds: [], personId: null, min: 1, required: true, requiredWhen: { itemId: "q", anyOf: [cls] } })
    const view = (id: string, cls: string, who: string) => ({ slot: slot(id, cls), satisfied: false, signed: [], eligible: [{ person: { id: who }, ok: true, reasons: [] }] })
    const rail = [{ stage: { id: "st", name: "Aprovação", slots: [] }, status: "atual", slots: [view("s4", "c4", "gerente"), view("s3", "c3", "coordenador")] }] as unknown as Parameters<typeof pickSlot>[0]
    const classe4 = { q: { t: "marcacao" as const, ids: ["c4"] } }
    // Class 4 answered: the coordinator (eligible only for the class-3 signature) is offered the class-4 slot, which is not theirs.
    expect(pickSlot(rail, "coordenador", classe4)?.slot.slot.id).toBe("s4")
    expect(pickSlot(rail, "gerente", classe4)?.slot.slot.id).toBe("s4")
    expect(pickSlot(rail, "coordenador", { q: { t: "marcacao", ids: ["c3"] } })?.slot.slot.id).toBe("s3")
    // Nothing answered: no conditional signature is asked.
    expect(pickSlot(rail, "coordenador", {})).toBeNull()
    // Asked for by id (the store, the API): refused with PTW20, as the database does.
    const stage = { id: "st", name: "Aprovação", slots: [slot("s4", "c4"), slot("s3", "c3")] }
    const plan = planSign({
      permit: { id: "p", state: "em_analise", revision: 1, answers: classe4, authorId: "x", assetIds: [], holdReason: null, holdAt: null, resumedBy: null, resumedReason: null, windowStart: "2026-01-01T08:00:00-03:00", windowEnd: "2026-01-01T18:00:00-03:00" },
      ver: { id: "v", stages: [stage], separation: [] }, rail, permits: [], signer: { id: "coordenador", name: "C", roles: [], status: "ativo" }, roleLabel: (id: string) => id, now: "2026-01-01T09:00:00-03:00", slotId: "s3",
    } as unknown as Parameters<typeof planSign>[0])
    expect(plan.ok).toBe(false)
    expect(plan.checks.find((c) => c.id === "condicao")?.deny?.code).toBe("PTW20")
  })

  it("slotNeed: assinatura condicional não exigida diz por quê (só para …), nunca “aguardando”", () => {
    const classe: FormItem = { ...base, id: "q", label: "Classe", kind: "marcacao", options: [{ id: "c3", label: "Classe 3" }, { id: "c4", label: "Classe 4" }], multiple: false, other: false }
    const form = { sections: [{ id: "s", title: "S", stageId: "st", items: [classe] }] }
    const c4 = { required: true, requiredWhen: { itemId: "q", anyOf: ["c4"] } }
    expect(slotNeed(c4, { q: { t: "marcacao", ids: ["c3"] } }, form)).toEqual({ need: "nao_exigida", when: "só para Classe 4" })
    expect(slotNeed(c4, {}, form)).toEqual({ need: "nao_exigida", when: "só para Classe 4" })
    expect(slotNeed(c4, { q: { t: "marcacao", ids: ["c4"] } }, form)).toEqual({ need: "exigida" })
    expect(slotNeed({ required: true }, {}, form)).toEqual({ need: "sempre" })
    expect(slotNeed({ required: false }, {}, form)).toEqual({ need: "opcional" })
    expect(slotNeed({ required: true, requiredWhen: { itemId: "q", anyOf: ["c3", "c4"] } }, {}, form)).toEqual({ need: "nao_exigida", when: "só para Classe 3 ou Classe 4" })
    const chk: FormItem = { ...base, id: "v", label: "Verificações", kind: "verificacao", answers: "sim_nao_na", lines: [{ id: "l1", label: "Há gás?" }] } as FormItem
    expect(conditionPhrase({ itemId: "v", lineId: "l1", anyOf: ["sim"] }, { sections: [{ ...form.sections[0], items: [chk] }] })).toBe("só quando “Há gás?” for Sim")
    expect(conditionPhrase({ itemId: "sumiu", anyOf: ["x"] }, form)).toBe("só quando uma resposta pedir")
  })
})

describe("templateChecks (movidas do FlowEditor)", () => {
  const tpl = seed.templates.find((t) => t.id === ID.template.painel)!.versions.find((v) => v.status === "ativa")!
  it("the seed's active version has no signature problem; structural issues are typed and point at stages", () => {
    expect(signatureProblems(tpl, seed, "2026-11-06")).toEqual([])
    const broken: TemplateContent = { ...tpl, stages: [{ ...tpl.stages[0], slots: [] }, { ...tpl.stages[1], slots: tpl.stages[1].slots.map((s) => ({ ...s, roleIds: [], meaning: null })) }], separation: [] }
    const issues = signatureIssues(broken, seed, "2026-11-06")
    expect(issues.map((i) => i.kind)).toEqual(["sem_assinatura", "sem_quem", "sem_descricao"])
    expect(issues[0].stageIds).toEqual([tpl.stages[0].id])
  })
  it("nobody eligible when the only holders' cargo expired; location path is root first", () => {
    const leaf = seed.locations.find((l) => l.parentId && seed.locations.find((x) => x.id === l.parentId)?.parentId)!
    const path = locationPathIds(seed.locations, leaf.id)
    expect(seed.locations.find((l) => l.id === path[0])!.parentId).toBeNull()
    expect(path[path.length - 1]).toBe(leaf.id)
    const sl = tpl.stages.flatMap((s) => s.slots).find((s) => s.roleIds.includes(ID.role.lider))!
    expect(checksForSlot(seed, tpl, sl, "2026-11-06").some((c) => c.ok)).toBe(true)
    expect(signatureProblems(tpl, seed, "2028-01-01")).toContain(`Ninguém elegível: ${sl.meaning}`)
  })
})

describe("Importar modelo · criar", () => {
  const AGORA = "2026-11-08T10:00:00-03:00"
  const novoId = () => uuidv7()
  const pacote = (): PacoteModelo => JSON.parse(exampleOnDisk)

  it("the example (with the new kinds) is valid and every kind round-trips through export", () => {
    const r = importarModelo(pacote(), seed, { agora: AGORA, novoId })
    expect(r.problemas.filter((p) => p.nivel === "erro")).toEqual([])
    const kinds = new Set((r.rascunho!.versao.form?.sections ?? []).flatMap((s) => s.items.map((i) => i.kind)))
    for (const k of ["documento", "data", "pessoa", "isolamento", "grupo"]) expect(kinds.has(k as FormItem["kind"])).toBe(true)
    expect(r.rascunho!.versao.stages.flatMap((s) => s.slots).some((s) => s.requiredWhen)).toBe(true)
    // nothing in the example is a pendência for lack of a kind any more
    expect(r.pendencias.filter((p) => p.motivo === "sem_tipo")).toEqual([])
    const state = aplicarImportacao(seed, r.rascunho!)
    const tpl = state.templates.find((t) => t.id === r.rascunho!.modeloId)!
    const back = JSON.parse(JSON.stringify(exportarModelo(tpl, state, { agora: AGORA, versaoId: r.rascunho!.versao.id })))
    expect(errosDeEsquema(back)).toEqual([])
    const again = importarModelo(back, { ...state, templates: [] }, { agora: AGORA, novoId })
    expect(again.problemas.filter((p) => p.nivel === "erro")).toEqual([])
  })

  it("applies lists/types/cargos first, then the version as a suggested draft, and describes it for the audit", () => {
    const p = pacote()
    p.modelo.nome = "Modelo importado de teste"
    p.modelo.escopo.tipos_de_local.push("Galeria de cabos")
    p.listas.push({ nome: "Gases medidos", itens: ["O2", "LEL"], origem: { pagina: 1, trecho: "Gases medidos: O2 / LEL" } })
    p.etapas[0].assinaturas[0].cargo = "Engenheiro de turno"
    const r = importarModelo(p, seed, { agora: AGORA, novoId, pacote: { arquivo: "pt.json", sha256: "b".repeat(64) } })
    expect(r.rascunho).not.toBeNull()
    const d = r.rascunho!
    const before: RegistryState = seed
    const after = aplicarImportacao(before, d)
    const tpl = after.templates.find((t) => t.id === d.modeloId)!
    expect(tpl.versions).toHaveLength(1)
    expect(tpl.versions[0]).toMatchObject({ status: "rascunho", origin: "sugerida", activatedAt: null })
    expect(after.locationTypes.some((t) => t.label === "Galeria de cabos")).toBe(true)
    expect(after.optionLists.some((l) => l.name === "Gases medidos")).toBe(true)
    expect(after.roleTypes.some((t) => t.label === "Engenheiro de turno")).toBe(true)
    expect(tpl.versions[0].importSource!.trechos[tpl.versions[0].stages[0].id].pagina).toBe(1)
    expect(before.templates.some((t) => t.id === d.modeloId)).toBe(false) // pure: the input is untouched

    expect(tpl.versions[0].sourceSha256).toBe("b".repeat(64))

    // Audit: the model's rows (types, lists and cargos are registry rows), then modelo.importado (G2).
    const ev = importEvents(before, after, d, { at: AGORA, actorId: ID.person.marina })
    expect(ev[0].action).toBe("modelo.criado")
    expect(ev[1].action).toBe("modelo.versao.criada")
    expect(ev.filter((e) => e.action === "modelo.assinatura.criada")).toHaveLength(d.versao.stages.flatMap((s) => s.slots).length)
    const imp = ev[ev.length - 1]
    expect(imp.action).toBe("modelo.importado")
    expect(imp.entity).toBe("template_version")
    expect(imp.entityId).toBe(d.versao.id)
    const k = totaisDaImportacao(d)
    expect(imp.text).toBe(`Importou “Modelo importado de teste” v1 como rascunho sugerido de pt.json: ${k.etapas} etapas, ${k.itens} itens, ${k.assinaturas} assinaturas, 1 lista nova, 1 tipo novo, 1 cargo novo`)
    expect((imp.data.pacote as { sha256: string }).sha256).toBe("b".repeat(64))
    expect(imp.data.ferramenta).toContain("ptw-modelo-de-formulario")
    expect(imp.data.novos).toEqual({ listas: d.listasNovas.map((x) => x.id), tipos: d.tiposDeLocalNovos.map((x) => x.id), cargos: d.cargosNovos.map((x) => x.id) })
  })

  it("an existing model gets a new draft version; nothing is activated", () => {
    const r = importarModelo(pacote(), seed, { agora: AGORA, novoId })
    const after = aplicarImportacao(seed, r.rascunho!)
    const tpl = after.templates.find((t) => t.id === r.rascunho!.modeloId)!
    const old = seed.templates.find((t) => t.id === r.rascunho!.modeloId)!
    expect(tpl.versions).toHaveLength(old.versions.length + 1)
    expect(tpl.versions.filter((v) => v.status === "ativa").map((v) => v.id)).toEqual(old.versions.filter((v) => v.status === "ativa").map((v) => v.id))
  })
})

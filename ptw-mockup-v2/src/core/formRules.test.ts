import { describe, expect, it } from "vitest"
import type { FormItem, FormSpec, Person } from "@/registry/types"
import { answerProblem, formProblem, formSha256, isoDate, itemStageId, normalizeForm, permitBlocker, type AnswerCtx } from "./formRules"
import { activationDenied, copyVersion, importSourceProblem, normalizeSeparation, versionChangeDenied } from "./templateVersions"
import { seedTemplates } from "@/registry/seedModelos"
import { ID } from "@/registry/seedIds"
import { canonicalJson, sha256Hex } from "./audit"
import { stageGate, validateForm, type FormAnswers } from "./form"

const U = (n: number) => `019a0999-0000-7000-8000-${n.toString(16).padStart(12, "0")}`
const ROLE = U(1), P1 = U(2), P2 = U(3), LIST = U(4), LI = U(5), ATT = U(6), ATT2 = U(7), PERMIT = U(8), ASSET = U(9), LOC = U(10), ST1 = U(11), ST2 = U(12)

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, unitId: U(99), revision: 1, updatedAt: "2026-11-06T09:00:00-03:00", origin: "manual", status: "ativo",
  name, company: "X", employeeId: name, login: null, enabled: true, accountExpires: null, adObjectGuid: null,
  roles: [{ id: U(50 + name.length), roleId: ROLE, scopeLocationId: null, validUntil: "2027-01-01" }], ...extra,
})
const people = [person(P1, "Ana"), person(P2, "Bia", { status: "inativo" })]

const items: FormItem[] = [
  { id: "t", kind: "texto", label: "Texto", required: true, long: false },
  { id: "n", kind: "numero", label: "O2", required: true, unit: "%", decimals: 1, negative: false, min: 19.5, max: 23.5 },
  { id: "h", kind: "horario", label: "Hora", required: false, seconds: false },
  { id: "m", kind: "marcacao", label: "EPI", required: false, options: [{ id: "o1", label: "Capacete" }], listId: LIST, multiple: false, other: false },
  { id: "v", kind: "verificacao", label: "Check", required: true, answers: "sim_nao", lines: [{ id: "l1", label: "Testado", blockOn: ["nao"], noteOn: [] }] },
  { id: "a", kind: "anexo", label: "Foto", required: false, accept: ["foto"], min: 1, hint: "" },
  { id: "d", kind: "documento", label: "APR", required: false, pattern: "APR-##", attach: true, validity: true },
  { id: "dt", kind: "data", label: "Data", required: false, notBeforeToday: true, min: "2026-01-01", max: "2026-12-31" },
  { id: "p", kind: "pessoa", label: "Vigia", required: false, multiple: false, roleId: ROLE, mustBeEligible: true },
  { id: "i", kind: "isolamento", label: "Bloqueio", required: false, minRows: 0 },
  { id: "g", kind: "grupo", label: "Leituras", required: false, minRows: 0, columns: [{ id: "c1", kind: "numero", label: "LIE", required: true, unit: "%", decimals: 0, negative: false, max: 10 }] },
  { id: "w", kind: "aviso", label: "Aviso", required: false, text: "Atenção" },
]
const form: FormSpec = { sections: [{ id: "s1", title: "S1", stageId: ST1, items: items.slice(0, 6) }, { id: "s2", title: "S2", stageId: ST2, items: items.slice(6) }] }
const ctx: AnswerCtx = {
  permitId: PERMIT, permitAssetIds: [ASSET], people,
  attachments: [{ id: ATT, permitId: PERMIT, kind: "foto" }, { id: ATT2, permitId: U(77), kind: "foto" }],
  optionLists: [{ id: LIST, name: "EPI", revision: 1, updatedAt: "2026-11-06T09:00:00-03:00", items: [{ id: LI, label: "Luvas", active: false }] }],
  pathIds: [LOC], today: "2026-11-06", now: "2026-11-06T10:00:00-03:00",
}

describe("formRules: answers (ptw.answer_problem)", () => {
  const msg = (id: string, v: unknown) => answerProblem(form, id, v as never, ctx)
  it("accepts well-formed answers in the database shape", () => {
    expect(msg("t", { t: "texto", v: "x" })).toBeNull()
    expect(msg("n", { t: "numero", v: 20.5 })).toBeNull()
    expect(msg("n", { t: "numero", v: 99 })).toBeNull() // out of range is accepted; it only blocks the signature
    expect(msg("h", { t: "horario", v: "23:59" })).toBeNull()
    expect(msg("m", { t: "marcacao", ids: [LI] })).toBeNull() // inactive list item still exists
    expect(msg("v", { t: "verificacao", lines: { l1: { a: "nao" } } })).toBeNull()
    expect(msg("a", { t: "anexo", files: [ATT] })).toBeNull()
    expect(msg("d", { t: "documento", code: "x", files: [], validUntil: "2026-02-28" })).toBeNull()
    expect(msg("dt", { t: "data", v: "2025-02-28" })).toBeNull()
    expect(msg("p", { t: "pessoa", ids: [P1] })).toBeNull()
    expect(msg("i", { t: "isolamento", rows: [{ id: "r1", point: "Q1", method: "cadeado", lock: "12", assetId: ASSET, by: P1, zero: "sim", energy: "eletrica" }] })).toBeNull()
    expect(msg("g", { t: "grupo", rows: [{ id: "r1", answers: { c1: { t: "numero", v: 3 } } }] })).toBeNull()
  })
  it("refuses with the database's words (PTW15) and PTW08 for an ineligible person", () => {
    expect(msg("zz", { t: "texto", v: "x" })).toEqual({ code: "PTW15", message: "O item zz não existe no formulário da PT" })
    expect(msg("w", { t: "aviso" })?.message).toBe("Resposta inválida: Aviso: aviso não tem resposta")
    expect(msg("t", { t: "numero", v: 1 })?.message).toBe("Resposta inválida: Texto: resposta de numero para item de texto")
    expect(msg("n", { t: "numero", v: -1 })?.message).toBe("Resposta inválida: O2: número negativo")
    expect(msg("n", { t: "numero", v: 20.55 })?.message).toBe("Resposta inválida: O2: casas decimais demais")
    expect(msg("h", { t: "horario", v: "24:00" })?.message).toBe("Resposta inválida: Hora: horário inválido")
    expect(msg("m", { t: "marcacao", ids: ["o1", LI] })?.message).toBe("Resposta inválida: EPI: só uma opção")
    expect(msg("m", { t: "marcacao", ids: [], other: "x" })?.message).toBe('Resposta inválida: EPI: "outro" não é aceito')
    expect(msg("m", { t: "marcacao", ids: ["zz"] })?.message).toBe("Resposta inválida: EPI: opção inexistente (zz)")
    expect(msg("v", { t: "verificacao", lines: { l1: { a: "na" } } })?.message).toBe("Resposta inválida: Check: linha ou resposta inválida (l1)")
    expect(msg("a", { t: "anexo", files: ["x"] })?.message).toBe("Resposta inválida: Foto: anexo fora do formato (id do anexo)")
    expect(msg("a", { t: "anexo", files: [ATT2] })?.message).toBe(`Resposta inválida: Foto: anexo não é desta PT (${ATT2})`)
    expect(msg("a", { t: "anexo", files: [ATT, ATT] })?.message).toBe("Resposta inválida: Foto: anexo repetido")
    expect(msg("d", { t: "documento", code: "x", files: [], validUntil: "28/02/2026" })?.message).toBe("Resposta inválida: APR: validade inválida (AAAA-MM-DD)")
    expect(msg("dt", { t: "data", v: "2026-02-30" })?.message).toBe("Resposta inválida: Data: data inválida (AAAA-MM-DD)")
    expect(msg("p", { t: "pessoa", ids: [U(55)] })?.message).toBe("Resposta inválida: Vigia: pessoa inexistente na unidade")
    expect(msg("p", { t: "pessoa", ids: [P2] })).toEqual({ code: "PTW08", message: "Vigia: Bia não elegível (cadastro inativo)" })
    expect(msg("i", { t: "isolamento", rows: [{ id: "r1", point: "Q1", method: "", lock: "", assetId: U(55) }] })?.message).toBe("Resposta inválida: Bloqueio: o ativo do ponto Q1 não é desta PT")
    expect(msg("g", { t: "grupo", rows: [{ id: "r1", answers: { zz: { t: "numero", v: 1 } } }] })?.message).toBe("Resposta inválida: Leituras: coluna inexistente (zz)")
    expect(msg("g", { t: "grupo", rows: [{ id: "r1", answers: { c1: { t: "numero", v: 1.5 } } }] })?.message).toBe("Resposta inválida: Leituras › LIE: casas decimais demais")
  })
})

describe("formRules: signature gate (ptw.permit_blocker)", () => {
  const pos = { [ST1]: 0, [ST2]: 1 }
  const b = (answers: FormAnswers, at = 1) => permitBlocker(form, answers, at, pos, ctx)
  it("checks the stage and the earlier ones, skips later ones and hidden items", () => {
    expect(b({ n: { t: "numero", v: 30 } })).toBe("O2 fora da faixa (30)")
    expect(b({ dt: { t: "data", v: "2026-11-01" } }, 0)).toBeNull()
    expect(b({ dt: { t: "data", v: "2026-11-01" } })).toBe("Data: 01/11/2026 está antes de hoje")
    expect(b({ v: { t: "verificacao", lines: { l1: { a: "nao" } } } })).toBe('Testado: "Não" impede a etapa')
    expect(b({ d: { t: "documento", code: "APR-1", files: [] } })).toBe("APR: fora do formato APR-##")
    expect(b({ d: { t: "documento", code: "apr-12", files: [] } })).toBe("APR: falta anexar o documento")
    expect(b({ d: { t: "documento", code: "APR-12", files: [ATT] } })).toBe("APR: falta a validade")
    expect(b({ d: { t: "documento", code: "APR-12", files: [ATT], validUntil: "2026-11-05" } })).toBe("APR vencido em 05/11/2026")
    expect(b({ p: { t: "pessoa", ids: [P2] } })).toBe("Vigia: Bia não elegível (cadastro inativo)")
    expect(b({ i: { t: "isolamento", rows: [{ id: "r", point: " Q1 ", method: "", lock: "", zero: "nao" }] } })).toBe("Bloqueio · ponto 1 (Q1): energia zero não verificada")
    expect(b({ g: { t: "grupo", rows: [{ id: "r", answers: { c1: { t: "numero", v: 11 } } }] } })).toBe("Leituras › LIE fora da faixa (11)")
    const hidden: FormSpec = { sections: [{ id: "s", title: "S", items: [{ ...items[1], showWhen: { itemId: "m", anyOf: ["o1"] } }, items[3]] }] }
    expect(permitBlocker(hidden, { n: { t: "numero", v: 30 } }, 0, {}, ctx)).toBeNull()
    expect(permitBlocker(hidden, { n: { t: "numero", v: 30 }, m: { t: "marcacao", ids: ["o1"] } }, 0, {}, ctx)).toBe("O2 fora da faixa (30)")
  })
  it("a section without a stage blocks every stage and completes with the first", () => {
    const f: FormSpec = { sections: [{ id: "s", title: "Geral", items: [items[0]] }] }
    expect(itemStageId(f, "t")).toBeUndefined()
    expect(itemStageId(f, "zz")).toBeNull()
    expect(stageGate(f, ST1, {}, {}, ST1)).toHaveLength(1)
    expect(stageGate(f, ST2, {}, {}, ST1)).toHaveLength(0)
    expect(validateForm(f, [{ id: ST1, name: "Sol", slots: [] }])).toEqual([])
  })
})

describe("formRules: structure (ptw.form_problem) and the form address", () => {
  it("first problem, in the database's words", () => {
    expect(formProblem({})).toBe("formulário sem seções")
    expect(formProblem(form)).toBeNull()
    expect(formProblem({ sections: [{ items: [{ id: "a b", kind: "texto", label: "X" }] }] })).toBe("X: id inválido")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "numero", label: "N", min: 2, max: 1 }] }] })).toBe("N: mínimo maior que o máximo")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "data", label: "D", min: "2026-02-30" }] }] })).toBe("D: campos da data inválidos")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "pessoa", label: "P", roleId: "rt_x" }] }] })).toBe("P: cargo inválido")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "documento", label: "D", pattern: "  " }] }] })).toBe("D: formato vazio")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "texto", label: "A" }, { id: "a", kind: "texto", label: "B" }] }] })).toBe("id repetido no formulário: a")
    expect(formProblem({ sections: [{ items: [{ id: "a", kind: "texto", label: "A", showWhen: { itemId: "z", anyOf: [] } }] }] })).toBe("a: a condição aponta para um item que não existe")
    expect(formProblem({ sections: [{ items: [{ id: "g", kind: "grupo", label: "G", columns: [{ id: "c", kind: "data", label: "C" }] }] }] })).toBe("G › C: tipo data não entra em grupo")
  })
  it("normalizeForm fills the database defaults", () => {
    const f = normalizeForm({ sections: [{ id: "s", title: "S", items: [{ id: "n", kind: "numero", label: "N", min: null }, { id: "x", kind: "texto", label: "X" }] }] })
    expect(f.sections[0].items[0]).toEqual({ id: "n", kind: "numero", label: "N", required: false, unit: "", decimals: 4, negative: false })
    expect(f.sections[0].stageId).toBeUndefined()
    expect(() => normalizeForm({ sections: [{ items: [{ id: "a", kind: "zz", label: "A" }] }] })).toThrow("tipo de item desconhecido")
  })
  it("formSha256 = SHA-256 of the canonical (jsonb) text; isoDate is iso_date", () => {
    expect(formSha256(form)).toBe(sha256Hex(canonicalJson(JSON.parse(JSON.stringify(form)))))
    expect(formSha256({ sections: [] })).toBe(sha256Hex('{"sections": []}'))
    expect(isoDate("2024-02-29")).toBe("2024-02-29")
    expect(isoDate("2026-02-29")).toBeNull()
  })
})

describe("templateVersions", () => {
  const tpl = seedTemplates[0]
  it("the sample models pass the database's checks", () => {
    for (const t of seedTemplates) expect(versionChangeDenied(undefined, { ...t, versions: t.versions.map((v) => ({ ...v, status: "rascunho" as const, activatedAt: null })) }, () => false)).toBeNull()
    for (const t of seedTemplates) for (const v of t.versions) for (const r of v.separation) expect(r.slotA < r.slotB).toBe(true)
  })
  it("copyVersion gives new stage and slot ids and remaps sections and separation", () => {
    const from = tpl.versions[1]
    const c = copyVersion(from, 4, "2026-11-09T10:00:00-03:00")
    expect(c.status).toBe("rascunho")
    expect(c.origin).toBe("manual")
    expect(c.stages.map((s) => s.id).some((id) => from.stages.some((s) => s.id === id))).toBe(false)
    expect(c.form!.sections.every((s) => c.stages.some((st) => st.id === s.stageId))).toBe(true)
    const slotIds = c.stages.flatMap((s) => s.slots.map((x) => x.id))
    expect(c.separation.every((r) => slotIds.includes(r.slotA) && slotIds.includes(r.slotB) && r.slotA < r.slotB)).toBe(true)
    expect(c.form!.sections.flatMap((s) => s.items.map((i) => i.id))).toEqual(from.form!.sections.flatMap((s) => s.items.map((i) => i.id)))
  })
  it("only a draft changes or leaves; active → archived only (PTW03 / 23503)", () => {
    const act = tpl.versions[1]
    const changed = { ...tpl, versions: tpl.versions.map((v) => (v.id === act.id ? { ...v, note: "x" } : v)) }
    expect(versionChangeDenied(tpl, changed, () => false)?.code).toBe("PTW03")
    const archived = { ...tpl, versions: tpl.versions.map((v) => (v.id === act.id ? { ...v, status: "arquivada" as const } : v)) }
    expect(versionChangeDenied(tpl, archived, () => false)).toBeNull()
    const noActive = { ...tpl, versions: tpl.versions.filter((v) => v.id !== act.id) }
    expect(versionChangeDenied(tpl, noActive, () => false)?.code).toBe("PTW03")
    const draft = tpl.versions[2]
    const noDraft = { ...tpl, versions: tpl.versions.filter((v) => v.id !== draft.id) }
    expect(versionChangeDenied(tpl, noDraft, () => false)).toBeNull()
    expect(versionChangeDenied(tpl, noDraft, (id) => id === draft.id)?.code).toBe("23503")
    expect(versionChangeDenied(tpl, undefined, () => false)?.code).toBe("PTW03")
  })
  it("activation needs cargo and meaning (PTW28) and an existing item/line for the condition (PTW15)", () => {
    const d = tpl.versions[2]
    const withSlot = (patch: object) => ({ ...d, stages: d.stages.map((s, i) => (i === 0 ? { ...s, slots: [{ ...s.slots[0], ...patch }] } : s)) })
    expect(activationDenied(d)).toBeNull()
    expect(activationDenied(withSlot({ roleIds: [] }))).toEqual({ code: "PTW28", message: 'A assinatura "Solicita a PT" da etapa "Solicitação" está sem cargo' })
    expect(activationDenied(withSlot({ meaning: null }))).toEqual({ code: "PTW28", message: 'A assinatura 1 da etapa "Solicitação" está sem significado' })
    expect(activationDenied(withSlot({ requiredWhen: { itemId: "zz", anyOf: ["sim"] } }))?.code).toBe("PTW15")
    expect(activationDenied(withSlot({ requiredWhen: { itemId: "fi_emi_conf", lineId: "zz", anyOf: ["confirmo"] } }))?.message).toBe('A assinatura "Solicita a PT" depende da linha zz que não existe no item fi_emi_conf')
    // A draft may keep the slot without cargo/meaning; activating it is what is refused.
    const t2 = { ...tpl, versions: tpl.versions.map((v) => (v.id === d.id ? withSlot({ roleIds: [], meaning: null }) : v)) }
    expect(versionChangeDenied(tpl, t2, () => false)).toBeNull()
    const act2 = { ...t2, versions: t2.versions.map((v) => (v.id === d.id ? { ...v, status: "ativa" as const, activatedAt: "2026-11-09T10:00:00-03:00" } : v.status === "ativa" ? { ...v, status: "arquivada" as const } : v)) }
    expect(versionChangeDenied(t2, act2, () => false)?.code).toBe("PTW28")
  })
  it("separation is stored with slotA < slotB; import source is checked (G1)", () => {
    expect(normalizeSeparation(ID.slot("painel1", "ver"), ID.slot("painel1", "iso"))).toEqual({ slotA: ID.slot("painel1", "iso"), slotB: ID.slot("painel1", "ver"), locked: false })
    const h = "a".repeat(64)
    expect(importSourceProblem({ pacote: { arquivo: "", sha256: h }, documentos: [], ferramenta: "x", importadoEm: "2026-11-09T10:00:00-03:00", trechos: { a: { pagina: 1, trecho: "t" } } })).toBeNull()
    expect(importSourceProblem({ pacote: { arquivo: "", sha256: h }, documentos: [], ferramenta: "x", importadoEm: "2026-11-09T10:00:00", trechos: {} })).toBe("data da importação sem fuso")
    expect(importSourceProblem({ pacote: { arquivo: "", sha256: h }, documentos: [], ferramenta: "x", importadoEm: "2026-11-09T10:00:00Z", trechos: { a: { pagina: 1, trecho: "t", arquivo: "z.pdf" } } })).toMatch(/não é documento de origem/)
  })
})

import { describe, expect, it } from "vitest"
import { permitSeed } from "@/permit/seed"
import type { FormItem, FormSpec } from "@/registry/types"
import type { Permit, SignatureRec } from "@/permit/types"
import { electricalPolicyProblem, electricalSequenceDenied, electricalShift, electricalTeamDenied, electricalWindowDenied, revalidationDenied } from "./electrical"
import { formProblem, normalizeForm } from "./formRules"
import { freezeForm } from "./form"
import { copyVersion } from "./templateVersions"
import { seed } from "@/registry/seed"

const NOW = "2026-11-18T23:00:00-03:00"
const check = (id: string): FormItem => ({ id, kind: "verificacao", label: id, required: true, answers: "sim_nao", lines: [{ id: "ok", label: id, blockOn: ["nao"], noteOn: [] }] })
const form: FormSpec = {
  electrical: { standard: "preparacao2027", procedure: "proc", riskAssessment: "apr", authorizations: "auth", workKind: "kind", isolation: ["iso1", "iso2"], restoration: ["return1", "return2"], shift: { startDate: "sd", startTime: "st", endDate: "ed", endTime: "et" } },
  sections: [{ id: "s", title: "Planejamento", items: [
    ...["proc", "apr", "auth"].map((id): FormItem => ({ id, label: id, kind: "documento", required: true, attach: true, validity: true })),
    { id: "kind", label: "Serviço", kind: "marcacao", required: true, options: [{ id: "rotineiro", label: "Rotineiro" }, { id: "nao_rotineiro", label: "Não rotineiro" }], multiple: false, other: false },
    ...["sd", "ed"].map((id): FormItem => ({ id, label: id, kind: "data", required: true, notBeforeToday: false })),
    ...["st", "et"].map((id): FormItem => ({ id, label: id, kind: "horario", required: true, seconds: false })),
    ...["iso1", "iso2", "return1", "return2"].map(check),
  ] }],
}
const p = { ...permitSeed.permits[0], state: "ativa" as const, holdReason: null, windowStart: "2026-11-18T22:00:00-03:00", windowEnd: "2026-11-19T05:00:00-03:00", answers: {
  sd: { t: "data" as const, v: "2026-11-18" }, st: { t: "horario" as const, v: "22:00" },
  ed: { t: "data" as const, v: "2026-11-19" }, et: { t: "horario" as const, v: "06:00" },
} }
const sig: SignatureRec = { id: "sig", permitId: p.id, rev: p.revision, slotId: "emit", personId: "issuer", signedAt: NOW, voidedAt: null, voidedReason: null }
const input = { shiftStart: "2026-11-18T22:00:00-03:00", shiftEnd: "2026-11-19T06:00:00-03:00", newEnd: "2026-11-19T05:30:00-03:00", reason: "Nova avaliação no local", conditionsUnchanged: true, teamUnchanged: true, assessmentConfirmed: true }
const denied = (over = {}, who = "issuer", permit: Permit = p, sigs: SignatureRec[] = [sig]) => revalidationDenied(permit, form, sigs, ["emit"], who, { ...input, ...over }, NOW)

describe("NR-10 · política congelada e limites do turno", () => {
  it("exige equipe explícita e recusa integrante sem autorização elegível", () => {
    expect(electricalTeamDenied(form, {}, [], [], "2026-11-18", NOW)?.code).toBe("PTW34")
    expect(electricalTeamDenied(form, { cargo: ["pessoa_ausente"] }, [], [], "2026-11-18", NOW)?.code).toBe("PTW34")
    expect(electricalTeamDenied({ sections: [] }, {}, [], [], "2026-11-18", NOW)).toBeNull()
  })
  it("valida a estrutura e preserva os controles ao normalizar/congelar/copiar", () => {
    expect(formProblem(form)).toBeNull()
    expect(normalizeForm(form).electrical).toEqual(form.electrical)
    expect(freezeForm(form, []).electrical).toEqual(form.electrical)
    const ver = seed.templates[0].versions[0]
    expect(copyVersion({ ...ver, form }, 99, NOW).form?.electrical).toEqual(form.electrical)
  })
  it("recusa referências inexistentes, ocultas, opcionais e documentos sem evidência", () => {
    for (const patch of [{ id: "outro" }, { required: false }, { attach: false }, { validity: false }, { showWhen: { itemId: "kind", anyOf: ["rotineiro"] } }]) {
      const f = structuredClone(form)
      Object.assign(f.sections[0].items[0], patch)
      expect(electricalPolicyProblem(f)).not.toBeNull()
    }
  })
  it("recusa sequência vazia, repetida ou sem bloqueio e turno incompleto", () => {
    for (const policy of [{ isolation: [] }, { isolation: ["iso1", "iso1"] }, { restoration: ["iso1"] }, { shift: undefined }]) {
      expect(electricalPolicyProblem({ ...form, electrical: { ...form.electrical!, ...policy } })).not.toBeNull()
    }
    const f = structuredClone(form)
    const item = f.sections[0].items.find((i) => i.id === "iso1")!
    if (item.kind === "verificacao") item.lines[0].blockOn = []
    expect(electricalPolicyProblem(f)).not.toBeNull()
  })
  it("resolve turno noturno no fuso da unidade e recusa ausência/inversão", () => {
    expect(electricalShift(form, p.answers)?.end).toBe("2026-11-19T06:00:00-03:00")
    expect(electricalShift(form, p.answers, "America/Manaus")?.end).toBe("2026-11-19T06:00:00-04:00")
    expect(electricalShift(form, {})).toBeNull()
    expect(electricalShift(form, { ...p.answers, ed: { t: "data", v: "2026-11-18" } })).toBeNull()
  })
  it("barra janela antes/depois do turno, mesmo abaixo do máximo de horas", () => {
    expect(electricalWindowDenied(form, p)).toBeNull()
    expect(electricalWindowDenied(form, { ...p, windowEnd: "2026-11-19T06:01:00-03:00" })?.code).toBe("PTW34")
    expect(electricalWindowDenied(form, { ...p, windowStart: "2026-11-18T21:59:00-03:00" })?.code).toBe("PTW34")
  })
  it("usa o turno revalidado e preserva os dados do formulário original", () => {
    const revalidation = { id: "r", ...input, personId: "issuer", at: NOW }
    expect(electricalWindowDenied(form, { ...p, revalidation, windowEnd: input.newEnd })).toBeNull()
    expect(p.answers.et.v).toBe("06:00")
  })
  it("mantém modelos comuns e base vigente sem regra nova de turno", () => {
    expect(electricalWindowDenied({ sections: [] }, p)).toBeNull()
    expect(electricalWindowDenied({ ...form, electrical: { ...form.electrical!, standard: "vigente2019", shift: undefined } }, p)).toBeNull()
  })
  it("exige confirmação dos passos anteriores antes da próxima gravação", () => {
    expect(electricalSequenceDenied(form, {}, "iso1")).toBeNull()
    expect(electricalSequenceDenied(form, {}, "iso2")?.code).toBe("PTW34")
    expect(electricalSequenceDenied(form, { iso1: { t: "verificacao", lines: { ok: { a: "nao" } } } }, "iso2")?.code).toBe("PTW34")
    expect(electricalSequenceDenied(form, { iso1: { t: "verificacao", lines: { ok: { a: "sim" } } } }, "iso2")).toBeNull()
  })
})

describe("NR-10 · revalidação", () => {
  it("admite a avaliação pelo emitente original inclusive após expiração", () => {
    expect(denied()).toBeNull()
    expect(denied({}, "issuer", { ...p, state: "expirada" })).toBeNull()
  })
  it("recusa outro responsável, assinatura anulada e parada pendente", () => {
    expect(denied({}, "other")?.code).toBe("PTW34")
    expect(denied({}, "issuer", p, [{ ...sig, voidedAt: NOW }])?.code).toBe("PTW34")
    expect(denied({}, "issuer", { ...p, holdReason: "Risco identificado" })?.code).toBe("PTW34")
  })
  it("recusa mudança de equipe/condições e ausência de avaliação local", () => {
    for (const key of ["conditionsUnchanged", "teamUnchanged", "assessmentConfirmed"]) expect(denied({ [key]: false })?.code).toBe("PTW34")
  })
  it("recusa turno futuro/encerrado, fim além do turno e justificativa inválida", () => {
    for (const patch of [{ shiftStart: "2026-11-19T01:00:00-03:00" }, { shiftEnd: NOW }, { newEnd: "2026-11-19T07:00:00-03:00" }, { newEnd: NOW }, { reason: " " }, { reason: "x".repeat(501) }, { shiftEnd: "inválido" }]) expect(denied(patch)?.code).toBe("PTW34")
  })
})

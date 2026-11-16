import { describe, expect, it } from "vitest"
import { PERMIT_ID, permitSeed, SIM_START } from "@/permit/seed"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import type { SignatureRec } from "@/permit/types"
import { canMove } from "./permitState"
import { mustActCount, myWork, waitingList, type MyWork } from "./myWork"
import { railOf } from "./permitView"
import { planSign, stateAfterSign } from "./signing"
import { dayOf, instant } from "./time"

const P = PERMIT_ID
const per = ID.person
/** 2026-11-06 14:00 in São Paulo. */
const NOW = SIM_START
const TODAY = dayOf(NOW)
const EQUIP = { relations: seed.relations, assets: seed.assets, partOf: [ID.relationKind.parte] }
/** A live signature for the tests. */
const sigOf = (o: Pick<SignatureRec, "id" | "permitId" | "rev" | "slotId" | "personId">, at = NOW): SignatureRec => ({ ...o, signedAt: at, voidedAt: null, voidedReason: null })
const voided = (g: SignatureRec): SignatureRec => ({ ...g, voidedAt: NOW, voidedReason: "Retomada: novo Aceite no campo exigido" })
const roleLabel = (id: string) => seed.roleTypes.find((r) => r.id === id)?.label ?? id
const work = (personId: string, now = NOW): MyWork =>
  myWork({ personId, permits: permitSeed.permits, signatures: permitSeed.signatures, people: seed.people, locations: seed.locations, templates: seed.templates, roleLabel, now, equipment: EQUIP })
const ids = (items: { permitId: string }[]) => items.map((i) => i.permitId).sort()

describe("máquina de estados (roteiro DESIGN.md)", () => {
  it("não permite ativa → cancelada nem entregue → suspensa", () => {
    expect(canMove("ativa", "cancelada")).toBe(false)
    expect(canMove("entregue", "suspensa")).toBe(false)
    expect(canMove("expirada", "entregue")).toBe(true)
  })
})

describe("myWork no seed às 14:00 (spec 09 DESIGN.md)", () => {
  it("Marina: em campo pt_0010; agir pt_0012 e pt_0013 (Emissão); nada bloqueado; aguardando pt_0008", () => {
    const w = work(per.marina)
    expect(ids(w.emCampo)).toEqual([P.p0010].sort())
    expect(ids(w.agir)).toEqual([P.p0012, P.p0013].sort())
    expect(w.agir.every((i) => i.act === "assinar")).toBe(true)
    expect(ids(w.bloqueadas)).toEqual([].sort())
    expect(ids(w.aguardando)).toContain(P.p0008)
  })
  it("todo item traz a etapa n/total do fluxo (1 ≤ n ≤ total)", () => {
    const w = work(per.paulo)
    const all = [...w.emCampo, ...w.agir, ...w.bloqueadas, ...w.proximas, ...w.aguardando]
    expect(all.length).toBeGreaterThan(0)
    for (const i of all) {
      expect(i.progress.total).toBeGreaterThan(0)
      expect(i.progress.n).toBeGreaterThanOrEqual(1)
      expect(i.progress.n).toBeLessThanOrEqual(i.progress.total)
    }
  })
  it("Paulo: em campo pt_0010 com Entregar; próximas incluem pt_0008 aguardando a janela", () => {
    const w = work(per.paulo)
    expect(ids(w.emCampo)).toEqual([P.p0010].sort())
    expect(w.emCampo[0].act).toBe("entregar")
    expect(ids(w.proximas)).toEqual([P.p0008, P.p0011, P.p0012, P.p0013, P.draft].sort())
    expect(w.proximas.find((i) => i.permitId === P.p0008)?.reasons[0]).toBe("Aceite a partir de 07/11 07:00:00")
  })
  it("Joana: agir pt_0007 (Aceite da área) e pt_0009 (Retomar a suspensa)", () => {
    const w = work(per.joana)
    expect(ids(w.emCampo)).toEqual([].sort())
    expect(ids(w.agir)).toEqual([P.p0007, P.p0009].sort())
    expect(w.agir.find((i) => i.permitId === P.p0009)?.act).toBe("retomar")
  })
  it("Rafael: agir com a devolvida; o rascunho bloqueado pela pt_0010 no CCM; em campo pt_0010 e pt_0009", () => {
    const w = work(per.rafael)
    expect(ids(w.agir)).toEqual([P.p0011].sort())
    expect(ids(w.bloqueadas)).toEqual([P.draft].sort())
    expect(w.bloqueadas[0].reasons).toEqual(["CCM-L2-01 já tem a PT-UN01-2026-00010 aberta (Ativa) em CCM-L2-01.C03"])
    expect(w.bloqueadas[0].holders).toEqual([{ id: P.p0010, number: "PT-UN01-2026-00010" }])
    expect(ids(w.emCampo)).toEqual([P.p0009, P.p0010].sort())
  })
  it("Minha área: só o próprio ato é marcado como seu; finalizadas ficam à parte", () => {
    const m = work(per.marina)
    expect(m.agir.every((i) => i.own)).toBe(true)
    expect(m.bloqueadas.every((i) => i.own)).toBe(true)
    expect(m.aguardando.every((i) => !i.own)).toBe(true)
    const p = work(per.paulo)
    expect(p.proximas.find((i) => i.permitId === P.p0008)?.own).toBe(true)
    expect(p.proximas.find((i) => i.permitId === P.p0012)?.own).toBe(false)
    expect(p.proximas.find((i) => i.permitId === P.draft)?.label).toBe("Ainda não enviada")
    expect(work(per.joana).agir.find((i) => i.permitId === P.p0009)?.cta).toBe("Retomar")
    const r = work(per.rafael)
    expect(r.finalizadas.length).toBeGreaterThan(0)
    expect(r.finalizadas.every((i) => i.act === "abrir")).toBe(true)
    expect(work(per.luis).finalizadas).toEqual([])
  })
  it("contador de Sua vez: só o que espera por você; Entregar de quem está em campo não conta", () => {
    expect(mustActCount(work(per.marina))).toBe(2)
    expect(mustActCount(work(per.joana))).toBe(2)
    const p = work(per.paulo)
    expect(p.emCampo[0].act).toBe("entregar")
    expect(mustActCount(p)).toBe(p.agir.length)
    expect(mustActCount(work(per.luis))).toBe(0)
  })
  it("Aguardando: minhas partes bloqueadas, depois minhas vezes futuras, depois o que espera outra pessoa", () => {
    const m = waitingList(work(per.marina))
    expect(m.some((i) => i.kind === "bloqueada")).toBe(false)
    expect(waitingList(work(per.rafael))[0]).toMatchObject({ permitId: P.draft, kind: "bloqueada" })
    expect(m.find((i) => i.permitId === P.p0008)?.kind).toBe("outros")
    const p = waitingList(work(per.paulo))
    expect(p[0]).toMatchObject({ permitId: P.p0008, kind: "depois" })
    expect(p.slice(1).every((i) => i.kind === "outros")).toBe(true)
    const kinds = p.map((i) => i.kind)
    expect(kinds.indexOf("outros")).toBeGreaterThan(kinds.lastIndexOf("depois"))
    // Nothing is lost or repeated when the three groups become one list.
    const w = work(per.paulo)
    expect(p.length).toBe(w.bloqueadas.length + w.proximas.length + w.aguardando.length)
  })
  it("cada PT aparece em um único grupo", () => {
    for (const p of seed.people) {
      const w = work(p.id)
      const all = Object.values(w).flat().map((i) => i.permitId)
      expect(new Set(all).size).toBe(all.length)
    }
  })
})

describe("planSign", () => {
  const plan = (permitId: string, personId: string, now = NOW) => {
    const permit = permitSeed.permits.find((p) => p.id === permitId)!
    const ver = seed.templates.find((t) => t.id === permit.templateId)!.versions.find((v) => v.id === permit.versionId)!
    const rail = railOf(permit, ver, permitSeed.signatures, seed.people, seed.locations, dayOf(now), now)
    return { permit, ver, p: planSign({ permit, ver, rail, permits: permitSeed.permits, signer: seed.people.find((x) => x.id === personId)!, roleLabel, now, equipment: EQUIP }) }
  }
  it("Marina emite a pt_0012 depois de preencher a parte dela (conferência e foto)", () => {
    const { p, permit, ver } = plan(P.p0012, per.marina)
    expect(p.ok).toBe(false)
    expect(p.fillOnly).toBe(true)
    expect(p.slot?.slot.meaning).toBe("Emite a PT")
    const filled = { ...permit, answers: { ...permit.answers,
      fi_emi_conf: { t: "verificacao" as const, lines: { fl_emi_etiq: { a: "confirmo" as const }, fl_emi_tensao: { a: "confirmo" as const } } },
      fi_emi_tensao_v: { t: "numero" as const, v: 0 },
      fi_emi_foto: { t: "anexo" as const, files: ["a"] } } }
    const rail = railOf(filled, ver, permitSeed.signatures, seed.people, seed.locations, TODAY)
    expect(planSign({ permit: filled, ver, rail, permits: permitSeed.permits, signer: seed.people.find((x) => x.id === per.marina)!, roleLabel, now: NOW, equipment: EQUIP }).ok).toBe(true)
  })
  it("a pt_0013 não tem bloqueio: só falta a parte da Emissão", () => {
    const { p } = plan(P.p0013, per.marina)
    expect(p.fillOnly).toBe(true)
  })
  it("Enviar do rascunho falha enquanto a pt_0010 (ativa) segura a gaveta do mesmo CCM", () => {
    const { p } = plan(P.draft, per.rafael)
    expect(p.ok).toBe(false)
    expect(p.fillOnly).toBe(false)
    const lock = p.checks.find((c) => c.holder)
    expect(lock).toMatchObject({ ok: false, holder: { id: P.p0010, number: "PT-UN01-2026-00010" } })
    expect(lock?.text).toBe("CCM-L2-01 já tem a PT-UN01-2026-00010 aberta (Ativa) em CCM-L2-01.C03")
  })
  it("quem não tem o cargo não assina", () => {
    const { p } = plan(P.p0012, per.rafael)
    expect(p.ok).toBe(false)
    expect(p.checks.find((c) => c.id === "elegivel")?.ok).toBe(false)
  })
  it("o aceite no campo espera a janela e depois passa", () => {
    expect(plan(P.p0008, per.paulo).p.checks.find((c) => c.id === "janela")?.wait).toBe(true)
    const later = plan(P.p0008, per.paulo, instant("2026-11-07T07:30:00")).p
    expect(later.checks.find((c) => c.id === "janela")?.ok).toBe(true)
    expect(later.fillOnly).toBe(true)
  })
  it("o estado avança só quando a etapa fecha", () => {
    const { permit, ver } = plan(P.p0012, per.marina)
    const sig = sigOf({ id: "x", permitId: P.p0012, rev: 1, slotId: ID.slot("painel2", "emi"), personId: per.marina })
    expect(stateAfterSign(permit, ver, permitSeed.signatures)).toBe("em_analise")
    expect(stateAfterSign(permit, ver, [...permitSeed.signatures, sig])).toBe("emitida")
  })
})

import { canStop, needsResume, planResume, resumeCandidates, stopEffect } from "./stopResume"
import { nextLabel } from "./permitView"
import { PERMIT_STATES } from "./permitState"
import type { Permit } from "@/permit/types"

describe("Parar e Retomar (decisões D5, D6, D8)", () => {
  const permitOf = (id: string): Permit => ({ ...permitSeed.permits.find((p) => p.id === id)! })
  const verOf = (p: Permit) => seed.templates.find((t) => t.id === p.templateId)!.versions.find((v) => v.id === p.versionId)!
  const person = (id: string) => seed.people.find((p) => p.id === id)!
  const today = TODAY
  const resumers = (p: Permit) => resumeCandidates(p, verOf(p), seed.people, seed.locations, today)

  it("o efeito do Parar nunca viola a máquina de estados, em nenhum dos 10 estados", () => {
    for (const state of PERMIT_STATES) {
      const p = { ...permitOf(P.p0010), state }
      const eff = stopEffect(p)
      expect(eff.state === state || canMove(state, eff.state)).toBe(true)
    }
  })
  it("parar ativa suspende; parar emitida mantém o estado e grava bloqueio", () => {
    expect(stopEffect(permitOf(P.p0010))).toEqual({ state: "suspensa" })
    expect(stopEffect(permitOf(P.p0008))).toEqual({ state: "emitida" })
  })
  it("qualquer pessoa com login ativo pode parar em campo; sem login ou fora de campo, não", () => {
    expect(canStop(permitOf(P.p0008), person(per.rafael), NOW).ok).toBe(true)
    expect(canStop(permitOf(P.p0008), person(per.carlos), NOW).ok).toBe(false)
    expect(canStop(permitOf(P.p0012), person(per.rafael), NOW).ok).toBe(false)
  })
  it("com bloqueio, o aceite no campo da pt_0008 fica barrado até a Retomada", () => {
    const base = permitOf(P.p0008)
    const held: Permit = { ...base, holdReason: "vazamento", holdBy: per.rafael, holdAt: instant("2026-11-07T07:10:00") }
    const ver = verOf(held)
    const at = instant("2026-11-07T07:30:00")
    const rail = railOf(held, ver, permitSeed.signatures, seed.people, seed.locations, dayOf(at), at)
    const plan = planSign({ permit: held, ver, rail, permits: permitSeed.permits, signer: person(per.paulo), roleLabel, now: at, equipment: EQUIP })
    expect(plan.ok).toBe(false)
    expect(plan.checks.find((c) => c.id === "parada")?.text).toContain("aguarda Retomada")
    expect(needsResume(held)).toBe(true)
    const resumed: Permit = { ...held, holdReason: null, holdBy: null, holdAt: null }
    const rail2 = railOf(resumed, ver, permitSeed.signatures, seed.people, seed.locations, dayOf(at), at)
    const after = planSign({ permit: resumed, ver, rail: rail2, permits: permitSeed.permits, signer: person(per.paulo), roleLabel, now: at, equipment: EQUIP })
    expect(after.checks.some((c) => c.id === "parada")).toBe(false)
    expect(after.fillOnly).toBe(true)
  })
  it("pt_0009 suspensa: Joana retoma, Beatriz não; o rótulo diz “Joana · Retomada”", () => {
    const p = permitOf(P.p0009)
    expect(needsResume(p)).toBe(true)
    const ver = verOf(p)
    const rail = railOf(p, ver, permitSeed.signatures, seed.people, seed.locations, today)
    expect(nextLabel(p, rail, seed.people, resumers(p))).toBe("Joana · Retomada")
    const plan = (id: string) => planResume({ permit: p, ver, signer: person(id), people: seed.people, locations: seed.locations, roleLabel, now: NOW })
    expect(plan(per.joana).ok).toBe(true)
    expect(plan(per.beatriz).ok).toBe(false)
  })
  it("depois da Retomada: continua suspensa, o aceite anulado volta a pendente e Beatriz (não Joana) o refaz", () => {
    const p: Permit = { ...permitOf(P.p0009), holdReason: null, holdBy: null, holdAt: null, resumedReason: "reparado", resumedBy: per.joana, resumedAt: NOW }
    const ver = verOf(p)
    const campo = ver.stages.find((s) => s.name === "Aceite no campo")!.slots.map((s) => s.id)
    const sigs = permitSeed.signatures.map((g) => (g.permitId === p.id && g.rev === p.revision && campo.includes(g.slotId) ? voided(g) : g))
    const rail = railOf(p, ver, sigs, seed.people, seed.locations, today)
    expect(needsResume(p)).toBe(false)
    expect(nextLabel(p, rail, seed.people)).toBe("Beatriz · Aceite no campo")
    const plan = (id: string) => planSign({ permit: p, ver, rail, permits: permitSeed.permits, signer: person(id), roleLabel, now: NOW, equipment: EQUIP })
    expect(plan(per.beatriz).ok).toBe(true)
    const sig = sigOf({ id: "n", permitId: p.id, rev: p.revision, slotId: campo[0], personId: per.beatriz })
    expect(stateAfterSign(p, ver, [...sigs, sig])).toBe("ativa")
    expect(stateAfterSign(p, ver, sigs)).toBe("suspensa")
  })
  it("quem registrou a Retomada não dá o novo aceite", () => {
    const p: Permit = { ...permitOf(P.p0009), holdReason: null, holdBy: null, holdAt: null, resumedReason: "reparado", resumedBy: per.beatriz, resumedAt: NOW }
    const ver = verOf(p)
    const campo = ver.stages.find((s) => s.name === "Aceite no campo")!.slots.map((s) => s.id)
    const sigs = permitSeed.signatures.map((g) => (g.permitId === p.id && campo.includes(g.slotId) ? voided(g) : g))
    const rail = railOf(p, ver, sigs, seed.people, seed.locations, today)
    const plan = planSign({ permit: p, ver, rail, permits: permitSeed.permits, signer: person(per.beatriz), roleLabel, now: NOW, equipment: EQUIP })
    expect(plan.ok).toBe(false)
    expect(plan.checks.find((c) => c.id === "retomador")?.ok).toBe(false)
  })
})

import { daysBetween, involvement, personalNotices, rolesView } from "./rolesView"

describe("rolesView (spec 09 DESIGN.md)", () => {
  const paulo = seed.people.find((p) => p.id === per.paulo)!
  it("Paulo em 06/11: 55 dias, vigente; assina Painel v2 e Vapor v1; não pode também emitir", () => {
    const [r] = rolesView(paulo, seed.templates, "2026-11-06")
    expect(r.daysLeft).toBe(55)
    expect(r.status).toBe("vigente")
    const meanings = r.signs.map((s) => `${s.templateName} v${s.version}: ${s.meaning}`)
    expect(meanings).toContain("Intervenção desenergizada em painel v2: Aceita no campo")
    expect(meanings).toContain("Soldagem em tubulação de vapor v1: Entrega a área")
    expect(r.cannotAlso).toContain("Emite a PT")
  })
  it("Paulo em 06/12: 25 dias, vence em breve, e dois avisos (cargo e conta)", () => {
    const roles = rolesView(paulo, seed.templates, "2026-12-06")
    expect(roles[0].daysLeft).toBe(25)
    expect(roles[0].status).toBe("vence_em_breve")
    const notices = personalNotices(paulo, roles, "2026-12-06", (id) => id)
    expect(notices.filter((n) => n.severity === "aviso")).toHaveLength(2)
  })
  it("Paulo em 01/01/2027: cargo vencido e conta expirada bloqueiam", () => {
    const roles = rolesView(paulo, seed.templates, "2027-01-01")
    expect(roles[0].status).toBe("vencido")
    expect(personalNotices(paulo, roles, "2027-01-01", (id) => id, instant("2027-01-01T08:00:00")).every((n) => n.severity === "bloqueia")).toBe(true)
  })
  it("Ana, em revisão, tem o aviso de cadastro que bloqueia", () => {
    const ana = seed.people.find((p) => p.id === per.ana)!
    expect(personalNotices(ana, rolesView(ana, seed.templates, "2026-11-06"), "2026-11-06", (id) => id).some((n) => n.id === "cadastro" && n.severity === "bloqueia")).toBe(true)
  })
  it("daysBetween ignora a hora", () => {
    expect(daysBetween("2026-11-06T23:59:00", "2026-11-07")).toBe(1)
  })
})

describe("involvement", () => {
  it("Paulo é líder da pt_0010 e assinou; Rafael é autor", () => {
    const p = permitSeed.permits.find((x) => x.id === P.p0010)!
    expect(involvement(p, permitSeed.signatures, per.paulo, ID.role.lider)).toEqual(["lider", "assinante"])
    expect(involvement(p, permitSeed.signatures, per.rafael, ID.role.lider)).toEqual(["autor", "assinante"])
  })
})

import { evalCondition, formatMeasure, formatNumber, parseNumberText, sectionStatus, validateForm, type FormAnswers } from "./form"
import type { FormItem } from "@/registry/types"

describe("motor do formulário (spec 10)", () => {
  const geral = seed.templates.find((t) => t.id === ID.template.geral)!.versions[0]
  const sec = (id: string) => geral.form!.sections.find((s) => s.id === id)!

  it("o modelo PT geral da seed é válido", () => {
    expect(validateForm(geral.form, geral.stages, seed.optionLists)).toEqual([])
  })
  it("seção vazia falta os obrigatórios; preenchida, completa", () => {
    const s = sec("fs_ident")
    expect(sectionStatus(s, {}).missing).toEqual(["Empresa contratada", "Tipos de trabalho", "Condição do tempo"])
    const a: FormAnswers = { fi_empresa: { t: "texto", v: "Elétrica Exemplo" }, fi_desc: { t: "texto", v: "Troca do disjuntor" }, fi_trab: { t: "marcacao", ids: [ID.listItem("trabalho", "Elétrico")] }, fi_clima: { t: "marcacao", ids: ["fo_clima_bom"] } }
    expect(sectionStatus(s, a).done).toBe(true)
  })
  it("“Não” numa linha que impede bloqueia; “N/A” sem justificativa falta", () => {
    const s = sec("fs_prec")
    const lines = Object.fromEntries(s.items[0].kind === "verificacao" ? s.items[0].lines.map((l) => [l.id, { a: "sim" as const }]) : [])
    const base: FormAnswers = { fi_resid: { t: "texto", v: "Ruído" }, fi_epi: { t: "marcacao", ids: [ID.listItem("epi", "Capacete")] }, fi_o2: { t: "numero", v: 20.9 },
      fi_prep_foto: { t: "anexo", files: ["a"] }, fi_area: { t: "verificacao", lines: { fl_area_lib: { a: ID.listItem("simna", "SIM") }, fl_area_ilum: { a: ID.listItem("simna", "SIM") } } } }
    expect(sectionStatus(s, { ...base, fi_prec: { t: "verificacao", lines } }).done).toBe(true)
    const no = sectionStatus(s, { ...base, fi_prec: { t: "verificacao", lines: { ...lines, fl_teste: { a: "nao" } } } })
    expect(no.blocked[0]).toContain("impede a etapa")
    const na = sectionStatus(s, { ...base, fi_prec: { t: "verificacao", lines: { ...lines, fl_tubo: { a: "na" } } } })
    expect(na.missing[0]).toContain("justificar")
    expect(sectionStatus(s, { ...base, fi_prec: { t: "verificacao", lines: { ...lines, fl_tubo: { a: "na", note: "sem tubulação" } } } }).done).toBe(true)
  })
  it("número: digitação natural, vírgula ou ponto, casas no máximo, sinal só se permitido", () => {
    const v = (r: string, d: number, n = false) => { const x = parseNumberText(r, d, n); return x.ok ? x.value : x.message }
    expect(v("18", 1)).toBe(18)
    expect(v("20,9", 1)).toBe(20.9)
    expect(v("20.9", 1)).toBe(20.9)
    expect(v("1.234,5", 2)).toBe(1234.5)
    expect(v("1.234.567", 0)).toBe(1234567)
    expect(v("2,5", 0)).toBe("Este campo aceita só números inteiros.")
    expect(v("2,55", 1)).toBe("No máximo 1 casa decimal.")
    expect(v("2,555", 2)).toBe("No máximo 2 casas decimais.")
    expect(v("", 1)).toBeUndefined()
    expect(v("18,", 1)).toBe(18)
    expect(v("abc", 2)).toBe("Digite só números.")
    expect(v("-15", 0, true)).toBe(-15)
    expect(v("-15", 0)).toBe("Este campo não aceita valor negativo.")
    expect(v("-0", 0, true)).toBe(0)
    expect(formatNumber(1234.5, 2)).toBe("1.234,50")
    expect(formatMeasure(0, 1, "V")).toBe("0,0 V")
  })
  it("número fora da faixa impede a etapa; vazio obrigatório falta", () => {
    const s = sec("fs_prec")
    const o2 = s.items.find((i) => i.id === "fi_o2")!
    const only = { ...s, items: [o2] }
    expect(sectionStatus(only, {}).missing).toEqual(["Oxigênio no ar (teste de gás)"])
    expect(sectionStatus(only, { fi_o2: { t: "numero", v: 20.9 } }).done).toBe(true)
    expect(sectionStatus(only, { fi_o2: { t: "numero", v: 19.5 } }).done).toBe(true)
    const low = sectionStatus(only, { fi_o2: { t: "numero", v: 18 } })
    expect(low.blocked[0]).toBe("Oxigênio no ar (teste de gás): 18,0 % está abaixo do mínimo de 19,5 %")
  })
  it("validação do número: mínimo maior que o máximo e casas fora de 0–4", () => {
    const tpl = seed.templates[0].versions[0]
    const bad: FormItem = { id: "n", kind: "numero", label: "X", required: true, unit: "", decimals: 5, negative: false, min: 3, max: 1 }
    const form = { sections: [{ id: "s", title: "S", stageId: tpl.stages[0].id, items: [bad] }] }
    const p = validateForm(form, tpl.stages)
    expect(p).toContain("X: mínimo maior que o máximo")
    expect(p).toContain("X: casas decimais entre 0 e 4")
  })
  it("“Outro” preenchido conta como marcação", () => {
    const s = sec("fs_prec")
    const item = s.items.find((i) => i.id === "fi_epi")!
    expect(sectionStatus({ ...s, items: [item] }, { fi_epi: { t: "marcacao", ids: [], other: "Avental" } }).done).toBe(true)
  })
  it("validação: seção sem itens, marcação sem opções, condição para item posterior", () => {
    const form = { sections: [
      { id: "a", title: "A", stageId: ID.stage("geral1", "sol"), items: [{ id: "x", kind: "texto" as const, label: "X", required: true, long: false, showWhen: { itemId: "y", anyOf: ["o"] } }] },
      { id: "b", title: "B", stageId: ID.stage("geral1", "emi"), items: [{ id: "y", kind: "marcacao" as const, label: "Y", required: true, options: [], multiple: true, other: false }] },
      { id: "c", title: "", stageId: ID.stage("geral1", "emi"), items: [] },
    ] }
    const p = validateForm(form, geral.stages)
    expect(p).toContain("X: condição aponta para item posterior")
    expect(p).toContain("Y: marcação sem opções")
    expect(p).toContain("Há seção sem título")
  })
  it("condição: mostra só quando a opção está marcada", () => {
    expect(evalCondition({ itemId: "fi_docs", anyOf: ["fo_quente"] }, { fi_docs: { t: "marcacao", ids: ["fo_quente"] } })).toBe(true)
    expect(evalCondition({ itemId: "fi_docs", anyOf: ["fo_quente"] }, { fi_docs: { t: "marcacao", ids: [] } })).toBe(false)
  })
  it("renomear a etapa Emissão não quebra em_analise → emitida", () => {
    const permit = permitSeed.permits.find((p) => p.id === P.p0012)!
    const ver0 = seed.templates.find((t) => t.id === permit.templateId)!.versions.find((v) => v.id === permit.versionId)!
    const ver = { ...ver0, stages: ver0.stages.map((s) => (s.kind === "emissao" ? { ...s, name: "Autorização" } : s)) }
    const sig = sigOf({ id: "x", permitId: P.p0012, rev: 1, slotId: ID.slot("painel2", "emi"), personId: per.marina })
    expect(stateAfterSign(permit, ver, [...permitSeed.signatures, sig])).toBe("emitida")
  })
})

import { optionsOf } from "./form"

describe("listas de opções", () => {
  const geral = seed.templates.find((t) => t.id === ID.template.geral)!.versions[0]
  const epi = geral.form!.sections.flatMap((s) => s.items).find((i) => i.id === "fi_epi")!
  it("a pergunta de EPI usa a lista e um item inativo some das opções, mas segue legível", () => {
    if (epi.kind !== "marcacao") throw new Error("tipo")
    expect(optionsOf(epi, seed.optionLists).map((o) => o.label)).toContain("Capacete")
    const lists = seed.optionLists.map((l) => (l.id === ID.list.epi ? { ...l, items: l.items.map((x) => (x.label === "Capacete" ? { ...x, active: false } : x)) } : l))
    expect(optionsOf(epi, lists).map((o) => o.label)).not.toContain("Capacete")
    expect(optionsOf(epi, lists, true).map((o) => o.label)).toContain("Capacete")
  })
  it("lista removida vira pendência do modelo", () => {
    expect(validateForm(geral.form, geral.stages, seed.optionLists.filter((l) => l.id !== ID.list.epi))).toContain("EPI mínimo durante todo o trabalho: lista removida")
  })
})

describe("a vez de cada um na PT", () => {
  const person = (id: string) => seed.people.find((p) => p.id === id)!
  const verOf = (p: { templateId: string; versionId: string }) => seed.templates.find((t) => t.id === p.templateId)!.versions.find((v) => v.id === p.versionId)!
  const planFor = (permitId: string, personId: string) => {
    const permit = permitSeed.permits.find((p) => p.id === permitId)!
    const ver = verOf(permit)
    const rail = railOf(permit, ver, permitSeed.signatures, seed.people, seed.locations, TODAY)
    return planSign({ permit, ver, rail, permits: permitSeed.permits, signer: person(personId), roleLabel, now: NOW, equipment: EQUIP })
  }
  it("rascunho: Rafael preenche e envia (em equipamento livre); só o solicitante envia", () => {
    const draft = permitSeed.permits.find((p) => p.id === P.draft)!
    const free = { ...draft, assetIds: [ID.asset(3)] }
    const rail = railOf(free, verOf(free), permitSeed.signatures, seed.people, seed.locations, TODAY)
    const p = planSign({ permit: free, ver: verOf(free), rail, permits: permitSeed.permits, signer: person(per.rafael), roleLabel, now: NOW, equipment: EQUIP })
    expect(p.stageKind).toBe("solicitacao")
    expect(p.fillOnly).toBe(true)
    expect(planFor(P.draft, per.rafael).fillOnly).toBe(false)
    expect(planFor(P.draft, per.marina).checks.find((c) => c.id === "autor")?.ok).toBe(false)
  })
  it("devolvida: falta o limite do circuito que motivou a devolução", () => {
    const p = planFor(P.p0011, per.rafael)
    expect(p.fillOnly).toBe(true)
    expect(p.checks.find((c) => c.fill)?.text).toContain("falta 1 resposta")
  })
  it("enviar leva rascunho e devolvida a em análise", () => {
    const d = permitSeed.permits.find((p) => p.id === P.draft)!
    expect(stateAfterSign(d, verOf(d), [])).toBe("em_analise")
  })
  it("Minha área: preencher conta como agir, não como bloqueio", () => {
    const w = work(per.marina)
    expect(w.agir.find((i) => i.permitId === P.p0012)?.cta).toBe("Preencher e assinar: Emite a PT")
    expect(work(per.rafael).agir.find((i) => i.permitId === P.p0011)?.cta).toBe("Preencher e reenviar a PT")
  })
  it("a Entrega da pt_0010 pede a área devolvida, com foto ou vídeo", () => {
    const p = planFor(P.p0010, per.paulo)
    expect(p.stageKind).toBe("entrega")
    expect(p.checks.find((c) => c.fill)?.text).toContain("Área devolvida")
  })
})

import { freezeForm } from "./form"

describe("formulário congelado na PT", () => {
  it("PT enviada guarda as opções da lista; renomear a lista depois não muda a PT", () => {
    const geral = seed.templates.find((t) => t.id === ID.template.geral)!.versions[0]
    const frozen = freezeForm(geral.form, seed.optionLists)
    const epi = frozen.sections.flatMap((s) => s.items).find((i) => i.id === "fi_epi")!
    if (epi.kind !== "marcacao") throw new Error("tipo")
    expect(epi.listId).toBeUndefined()
    expect(epi.options.map((o) => o.label)).toContain("Capacete")
    const renamed = seed.optionLists.map((l) => ({ ...l, items: l.items.map((x) => ({ ...x, label: x.label + " (novo)" })) }))
    expect(optionsOf(epi, renamed).map((o) => o.label)).toContain("Capacete")
  })
  it("as PTs de exemplo enviadas têm cópia; o rascunho não", () => {
    const p10 = permitSeed.permits.find((p) => p.id === P.p0010)!
    expect(p10.snapshotAt).toBe("2026-11-05T14:00:00-03:00")
    expect(permitSeed.formSnapshots[p10.snapshotSha256!]).toBeDefined()
    expect(permitSeed.permits.find((p) => p.id === P.draft)!.snapshotSha256).toBeNull()
  })
})

describe("mostrar quando", () => {
  const geral = seed.templates.find((t) => t.id === ID.template.geral)!.versions[0]
  const prep = geral.form!.sections.find((x) => x.id === "fs_prec")!
  it("o nº da PT de trabalho a quente só aparece e só é exigido com trabalho a quente marcado", () => {
    const sem = sectionStatus(prep, { fi_trab: { t: "marcacao", ids: [ID.listItem("trabalho", "Elétrico")] } }).missing
    expect(sem.some((m) => m.includes("trabalho a quente"))).toBe(false)
    const com = sectionStatus(prep, { fi_trab: { t: "marcacao", ids: [ID.listItem("trabalho", "Trabalho a quente")] } }).missing
    expect(com).toContain("Nº da PT de trabalho a quente")
  })
})

import { nextPermitNumber, workRelease } from "./permitView"
import { actionLabel, canReturn } from "./signing"

describe("Trabalho liberado só quando está liberado agora", () => {
  const p10 = permitSeed.permits.find((p) => p.id === P.p0010)!
  it("ativa dentro da janela: liberado", () => {
    expect(workRelease(p10, NOW)).toEqual({ released: true })
  })
  it("janela encerrada: não liberado, mesmo ativa", () => {
    expect(workRelease(p10, instant("2027-01-02T08:00:00"))).toEqual({ released: false, why: "janela_encerrada" })
    // Closed at both ends, like ptw.work_released: the last second still counts, the next one does not.
    expect(workRelease(p10, p10.windowEnd).released).toBe(true)
    expect(workRelease(p10, instant("2026-11-06T19:00:01")).released).toBe(false)
    expect(workRelease(p10, instant("2026-11-06T07:59:59"))).toEqual({ released: false, why: "antes_da_janela" })
  })
  it("parada registrada ou outro estado: não liberado", () => {
    expect(workRelease({ ...p10, holdReason: "x", holdBy: per.marina, holdAt: NOW }, NOW).released).toBe(false)
    expect(workRelease({ ...p10, state: "suspensa" }, NOW).released).toBe(false)
    expect(workRelease({ ...p10, state: "emitida" }, NOW).released).toBe(false)
  })
})

describe("ações na PT", () => {
  const person = (id: string) => seed.people.find((p) => p.id === id)!
  const planFor = (permit: Permit, personId: string) => {
    const ver = seed.templates.find((t) => t.id === permit.templateId)!.versions.find((v) => v.id === permit.versionId)!
    const rail = railOf(permit, ver, permitSeed.signatures, seed.people, seed.locations, TODAY)
    return planSign({ permit, ver, rail, permits: permitSeed.permits, signer: person(personId), roleLabel, now: NOW, equipment: EQUIP })
  }
  const byId = (id: string) => permitSeed.permits.find((p) => p.id === id)!
  it("rascunho de outra pessoa: o envio não é oferecido a ela", () => {
    expect(planFor(byId(P.draft), per.marina).slot?.eligible).toEqual([])
    expect(planFor(byId(P.draft), per.rafael).slot?.eligible.map((e) => e.person.id)).toEqual([per.rafael])
  })
  it("Devolver: a emissora pode; o solicitante não devolve a própria PT", () => {
    const p12 = byId(P.p0012)
    expect(canReturn(p12, planFor(p12, per.marina), per.marina)).toBe(true)
    expect(canReturn(p12, planFor(p12, per.rafael), per.rafael)).toBe(false)
    const own = { ...p12, authorId: per.marina }
    expect(canReturn(own, planFor(own, per.marina), per.marina)).toBe(false)
  })
  it("Entregar diz o que se entrega, sem repetir o significado", () => {
    const p10 = byId(P.p0010)
    expect(actionLabel(p10, planFor(p10, per.paulo), true)).toBe("Preencher e entregar a área")
  })
  it("Minha área: Entregar com formulário aberto já diz Preencher e entregar", () => {
    const it10 = work(per.paulo).emCampo.find((i) => i.permitId === P.p0010)!
    expect(it10.act).toBe("entregar")
    expect(it10.fill).toBe(true)
    expect(it10.cta).toBe("Preencher e entregar a área")
  })
  it("a Entrega continua possível depois da janela (pare e entregue a área)", () => {
    const later = instant("2026-11-07T08:00:00")
    expect(work(per.paulo, later).emCampo.find((i) => i.permitId === P.p0010)?.act).toBe("entregar")
  })
  it("cada item diz por que é da pessoa", () => {
    expect(work(per.marina).agir.find((i) => i.permitId === P.p0012)?.why).toBe("Seu cargo: Supervisora de área")
    expect(work(per.rafael).bloqueadas.find((i) => i.permitId === P.draft)?.why).toBe("Você solicitou")
    for (const p of seed.people) for (const it of Object.values(work(p.id)).flat()) expect(it.why).not.toBe("")
  })
  it("Retomar: a linha diz o ato, o botão diz Retomar", () => {
    expect(work(per.joana).agir.find((i) => i.permitId === P.p0009)?.label).toBe("Registra a Retomada")
  })
  it("o número que o Enviar dá é o próximo da sequência", () => {
    expect(nextPermitNumber(permitSeed.permits, "UN-01", NOW)).toBe("PT-UN01-2026-00014")
    // The year is the unit's: 31/12 23:30 in São Paulo is already 2027 in UTC, still 2026 here.
    expect(nextPermitNumber(permitSeed.permits, "UN-01", "2027-01-01T02:30:00Z")).toBe("PT-UN01-2026-00014")
    expect(nextPermitNumber(permitSeed.permits, "UN-01", "2027-01-01T03:00:00Z")).toBe("PT-UN01-2027-00001")
  })
})

describe("type icons", () => {
  it("uses the chosen icon and guesses from the name otherwise", async () => {
    const { typeIconKey, guessTypeIcon } = await import("@/registry/typeIcons")
    expect(typeIconKey({ label: "Bomba centrífuga", icon: "tanque" }, "assetTypes")).toBe("tanque")
    expect(typeIconKey({ label: "Bomba centrífuga" }, "assetTypes")).toBe("bomba")
    expect(typeIconKey({ label: "X", icon: "nao-existe" }, "locationTypes")).toBe("local")
    expect(guessTypeIcon("Galpão", "locationTypes")).toBe("galpao")
    expect(guessTypeIcon("Subestação", "assetTypes")).toBe("eletrico")
  })
})

describe("times with seconds", () => {
  it("reads planned (minute) and recorded (second) times the same way", async () => {
    const { hms, dmHms, toSeconds } = await import("./time")
    expect(hms("2026-11-06T17:00")).toBe("17:00:00")
    expect(hms("2026-11-06T14:03:27")).toBe("14:03:27")
    expect(dmHms("2026-11-06T14:03:27")).toBe("06/11 14:03:27")
    expect(toSeconds("2026-11-06T17:00")).toBe("2026-11-06T17:00:00")
    // An instant with offset reads in the unit's local time, whatever offset it was written in.
    expect(hms("2026-11-06T17:00:00Z")).toBe("14:00:00")
    expect(dmHms("2026-11-07T02:30:00+00:00")).toBe("06/11 23:30:00")
  })
})

describe("horário (time of day)", () => {
  it("masks digits and refuses invalid times", async () => {
    const { maskTime, timeProblem } = await import("./form")
    expect(maskTime("1430", false)).toBe("14:30")
    expect(maskTime("14:3x05", true)).toBe("14:30:5")
    expect(maskTime("1430059999", true)).toBe("14:30:05")
    expect(timeProblem("14:30", false)).toBeNull()
    expect(timeProblem("14:3", false)).toMatch(/Complete/)
    expect(timeProblem("24:00", false)).toBe("Hora de 00 a 23.")
    expect(timeProblem("12:60", false)).toBe("Minutos de 00 a 59.")
    expect(timeProblem("12:30:61", true)).toBe("Segundos de 00 a 59.")
    expect(timeProblem("12:30", true)).toMatch(/hh:mm:ss/)
  })
  it("a required time counts as missing until it is a valid answer", async () => {
    const { itemProblems } = await import("./form")
    const item = { id: "h", kind: "horario" as const, label: "Hora do bloqueio", required: true, seconds: false }
    expect(itemProblems(item, undefined).missing).toEqual(["Hora do bloqueio"])
    expect(itemProblems(item, { t: "horario", v: "9:5" }).missing).toEqual(["Hora do bloqueio"])
    expect(itemProblems(item, { t: "horario", v: "09:05" }).missing).toEqual([])
  })
})

import { assetsCollide, equipmentHolders, isOpen, openCollisions, partOfKindIds } from "./equipmentLock"
import { permitReducer } from "@/permit/store"
import type { AssetRelation } from "@/registry/types"

describe("trava de equipamento: ninguém abre PT em equipamento com PT aberta", () => {
  const byId = (id: string) => permitSeed.permits.find((p) => p.id === id)!
  it("aberta em todo estado exceto rascunho, encerrada e cancelada (expirada e entregue ainda seguram)", () => {
    const open = (["rascunho", "em_analise", "devolvida", "emitida", "ativa", "suspensa", "entregue", "encerrada", "cancelada", "expirada"] as const).filter((state) => isOpen({ state }))
    expect(open).toEqual(["em_analise", "devolvida", "emitida", "ativa", "suspensa", "entregue", "expirada"])
  })
  it("colide no mesmo ativo e em 'é parte de' em qualquer profundidade e direção; outras relações não travam", () => {
    const rel: AssetRelation[] = [
      { id: "r1", fromId: "c", toId: "b", kindId: ID.relationKind.parte },
      { id: "r2", fromId: "b", toId: "a", kindId: ID.relationKind.parte },
      { id: "r3", fromId: "x", toId: "a", kindId: ID.relationKind.alimenta },
      { id: "r4", fromId: "y", toId: "a", kindId: ID.relationKind.isola },
      { id: "r5", fromId: "z", toId: "a", kindId: ID.relationKind.abastece },
    ]
    const parts = [ID.relationKind.parte]
    expect(assetsCollide("a", "a", rel, parts)).toBe(true)
    expect(assetsCollide("c", "a", rel, parts)).toBe(true)
    expect(assetsCollide("a", "c", rel, parts)).toBe(true)
    expect(assetsCollide("b", "c", rel, parts)).toBe(true)
    expect(assetsCollide("x", "a", rel, parts)).toBe(false)
    expect(assetsCollide("y", "a", rel, parts)).toBe(false)
    expect(assetsCollide("z", "a", rel, parts)).toBe(false)
    // In the seed: the gaveta C03 is part of the CCM; the breaker only feeds it.
    expect(partOfKindIds(seed.relationKinds)).toEqual([ID.relationKind.parte])
    expect(assetsCollide(ID.asset(1), ID.asset(2), seed.relations, EQUIP.partOf)).toBe(true)
    expect(assetsCollide(ID.asset(3), ID.asset(1), seed.relations, EQUIP.partOf)).toBe(false)
  })
  it("equipmentHolders ignora a própria PT e as que não estão abertas", () => {
    const draft = byId(P.draft)
    const holds = equipmentHolders(draft, permitSeed.permits, seed.relations, EQUIP.partOf)
    expect(holds.map((h) => [h.asset, h.heldAsset, h.holder.id])).toEqual([[ID.asset(1), ID.asset(2), P.p0010]])
    expect(equipmentHolders(byId(P.p0010), permitSeed.permits, seed.relations, EQUIP.partOf)).toEqual([])
  })
  it("seed: nenhum par de PTs abertas colide", () => {
    expect(openCollisions(permitSeed.permits, seed.relations, EQUIP.partOf).map(([a, b]) => `${a.id}×${b.id}`)).toEqual([])
  })
  it("store: Enviar com o equipamento seguro é recusado (PTW10) e fica no histórico; livre, vai a em análise", () => {
    const sign = { kind: "sign" as const, permitId: P.draft, slotId: ID.slot("painel2", "sol"), personId: per.rafael }
    const audit = { at: NOW, actorId: per.rafael }
    const refused = permitReducer(permitSeed, sign, { audit, registry: seed })
    expect(refused.denied?.code).toBe("PTW10")
    expect(refused.denied?.detail).toBe(P.p0010)
    expect(refused.data).toBe(permitSeed)
    expect(refused.events).toHaveLength(1)
    expect(refused.events[0]).toMatchObject({ permit: P.draft, action: "pt.estado", ok: false })
    expect(refused.events[0].text).toBe("Negado (PTW10): CCM-L2-01 já tem a PT-UN01-2026-00010 aberta (Ativa) em CCM-L2-01.C03")
    const free = { ...seed, relations: seed.relations.filter((r) => r.kindId !== ID.relationKind.parte) }
    const sent = permitReducer(permitSeed, sign, { audit, registry: free })
    expect(sent.denied).toBeUndefined()
    const draft = sent.data.permits.find((p) => p.id === P.draft)!
    expect(draft.state).toBe("em_analise")
    expect(draft.number).toBe("PT-UN01-2026-00014")
    expect(sent.events.map((e) => e.action)).toEqual(["pt.estado", "pt.assinatura"])
  })
})

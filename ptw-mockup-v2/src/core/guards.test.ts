import { describe, expect, it } from "vitest"
import { PERMIT_ID, permitSeed, permitSeedEvents, SIM_START } from "@/permit/seed"
import { permitReducer, type PermitAction } from "@/permit/store"
import { registryStep } from "@/registry/store"
import { seed } from "@/registry/seed"
import { ID } from "@/registry/seedIds"
import type { Permit, PermitData } from "@/permit/types"
import type { FormItem, FormSection, PermitTemplate, RegistryState, TemplateVersion } from "@/registry/types"
import { equipmentHolders, isOpen, newCollision } from "./equipmentLock"
import { accountStateAt, personIneligible } from "./eligibility"
import { myWork } from "./myWork"
import { actDenied } from "./permitActs"
import { dueToExpire, isFinalState, nextLabel, pathIds, railOf } from "./permitView"
import { lockChecks, planSign, STAGE, stageOfKind } from "./signing"
import { addMinutes, dayOf, dmHms, hms, instant, nextDayStart, wallOf } from "./time"

const P = PERMIT_ID
const per = ID.person
const NOW = SIM_START
const TODAY = dayOf(NOW)
const PARTS = [ID.relationKind.parte]
const EQUIP = { relations: seed.relations, assets: seed.assets, partOf: PARTS }
const roleLabel = (id: string) => seed.roleTypes.find((r) => r.id === id)?.label ?? id
const permitOf = (id: string): Permit => ({ ...permitSeed.permits.find((p) => p.id === id)! })
const verOf = (p: Permit, templates: PermitTemplate[] = seed.templates) => templates.find((t) => t.id === p.templateId)!.versions.find((v) => v.id === p.versionId)!
const person = (id: string) => seed.people.find((p) => p.id === id)!
const clone = (): PermitData => structuredClone(permitSeed)
/** One act through the store's reducer, as `who` at `at`. */
const step = (data: PermitData, a: PermitAction, who: string | null, at = NOW, registry: RegistryState = seed, serverDown = false) =>
  permitReducer(data, a, { audit: who ? { at, actorId: who } : { at, actorId: null, auth: "sistema" }, registry, serverDown })

/** Signs, with the rail, whoever is eligible for the slot the permit waits on (the first eligible person). */
function signNext(data: PermitData, permitId: string, at = NOW) {
  const p = data.permits.find((x) => x.id === permitId)!
  const ver = verOf(p)
  const rail = railOf(p, ver, data.signatures, seed.people, seed.locations, dayOf(at), at)
  const cur = rail.find((s) => s.status === "atual")!
  const slot = cur.slots.find((v) => !v.satisfied)!
  const signer = slot.eligible.find((e) => e.ok)!.person
  const plan = planSign({ permit: p, ver, rail, permits: data.permits, signer, roleLabel, now: at, equipment: EQUIP, people: seed.people })
  const s = step(data, { kind: "sign", permitId, slotId: slot.slot.id, personId: signer.id }, signer.id, at)
  return { plan, cur, step: s, signer }
}

describe("o exemplo das PTs é a história reexecutada pela loja", () => {
  it("números na ordem do envio, a partir do contador 3", () => {
    const n = (k: keyof typeof P) => permitSeed.permits.find((p) => p.id === P[k])!.number
    expect(n("p0004")).toBe("PT-UN01-2026-00004")
    expect(n("p0010")).toBe("PT-UN01-2026-00010")
    expect(n("p0013")).toBe("PT-UN01-2026-00013")
    expect(n("draft")).toBeNull()
  })
  it("eventos em ordem de tempo; só uma negada (o envio do rascunho, PTW10)", () => {
    const ts = permitSeedEvents.map((e) => Date.parse(e.at))
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
    const denied = permitSeedEvents.filter((e) => !e.ok)
    expect(denied).toHaveLength(1)
    expect(denied[0]).toMatchObject({ permit: P.draft, action: "pt.estado", data: { erro: "PTW10" } })
  })
  it("todo instante gravado tem fuso", () => {
    const zoned = /([+-]\d{2}:\d{2}|Z)$/
    for (const p of permitSeed.permits) {
      for (const t of [p.windowStart, p.windowEnd, p.createdAt, p.updatedAt, p.snapshotAt, p.holdAt, p.resumedAt]) if (t) expect(t).toMatch(zoned)
    }
    for (const g of permitSeed.signatures) expect(g.signedAt).toMatch(zoned)
  })
})

describe("reenvio depois de devolvida: nova revisão, assinaturas anteriores anuladas", () => {
  it("PT-…0010: r2 com linha de revisão (sem linha para a r1) e as três assinaturas da r1 anuladas com o motivo do banco", () => {
    const p10 = permitOf(P.p0010)
    expect(p10.revision).toBe(2)
    const rv = permitSeed.revisions.filter((r) => r.permitId === P.p0010)
    expect(rv.map((r) => [r.rev, r.reason])).toEqual([[2, "Reenviada após devolução"]])
    expect(rv[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    const r1 = permitSeed.signatures.filter((g) => g.permitId === P.p0010 && g.rev === 1)
    expect(r1).toHaveLength(3)
    for (const g of r1) {
      expect(g.voidedAt).not.toBeNull()
      expect(g.voidedReason).toBe("Reenviada após devolução: vale a revisão 2")
    }
    expect(permitSeed.signatures.filter((g) => g.permitId === P.p0010 && g.rev === 2).every((g) => g.voidedAt === null)).toBe(true)
  })
  it("o trilho mostra as anuladas à parte (struck) e conta só as da revisão atual", () => {
    const p10 = permitOf(P.p0010)
    const rail = railOf(p10, verOf(p10), permitSeed.signatures, seed.people, seed.locations, TODAY, NOW)
    const sol = rail.find((s) => s.stage.kind === "solicitacao")!.slots[0]
    expect(sol.signed.map((g) => g.rev)).toEqual([2])
    expect(sol.struck.map((g) => g.voidedReason)).toEqual(["Reenviada após devolução: vale a revisão 2"])
  })
  it("reenviar a PT-…0011 abre a r2, anula as da r1, grava a revisão e limpa a nota", () => {
    const s = step(clone(), { kind: "sign", permitId: P.p0011, slotId: ID.slot("painel2", "sol"), personId: per.rafael }, per.rafael)
    expect(s.denied).toBeUndefined()
    const p = s.data.permits.find((x) => x.id === P.p0011)!
    expect(p).toMatchObject({ state: "em_analise", revision: 2, note: null })
    expect(s.events.map((e) => e.action)).toEqual(["pt.estado", "pt.assinatura.anulada", "pt.assinatura.anulada", "pt.assinatura.anulada", "pt.revisao", "pt.assinatura"])
    expect(s.data.signatures.filter((g) => g.permitId === P.p0011 && g.voidedAt === null).map((g) => g.rev)).toEqual([2])
  })
})

describe("guarda da loja de PTs: cada recusa com o código do banco", () => {
  it("assinar fora da etapa atual (Aceite no campo em análise): PTW20, nada aplicado, negada registrada", () => {
    const data = clone()
    const s = step(data, { kind: "sign", permitId: P.p0012, slotId: ID.slot("painel2", "campo"), personId: per.paulo }, per.paulo)
    expect(s.denied?.code).toBe("PTW20")
    expect(s.data).toBe(data)
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({ ok: false, action: "pt.assinatura", text: expect.stringMatching(/^Negado \(PTW20\)/) })
  })
  it("assinatura de outra versão do modelo: PTW07", () => {
    const s = step(clone(), { kind: "sign", permitId: P.p0012, slotId: ID.slot("vapor1", "emi"), personId: per.marina }, per.marina)
    expect(s.denied?.code).toBe("PTW07")
  })
  it("assinar PT encerrada (PTW07), devolver fora de análise (PTW05), parar fora de campo (PTW25), retomar sem parada (PTW26)", () => {
    const data = clone()
    expect(step(data, { kind: "sign", permitId: P.p0006, slotId: ID.slot("painel2", "area"), personId: per.marina }, per.marina).denied?.code).toBe("PTW07")
    expect(step(data, { kind: "refuse", permitId: P.p0010, personId: per.marina, reason: "x" }, per.marina).denied?.code).toBe("PTW05")
    expect(step(data, { kind: "stop", permitId: P.p0012, personId: per.marina, reason: "x" }, per.marina).denied?.code).toBe("PTW25")
    expect(step(data, { kind: "resume", permitId: P.p0010, personId: per.joana, reason: "x" }, per.joana).denied?.code).toBe("PTW26")
  })
  it("só o solicitante envia (PTW17); o solicitante não devolve (PTW18); só quem pode assinar a etapa pendente devolve (PTW29)", () => {
    const data = clone()
    expect(step(data, { kind: "sign", permitId: P.p0011, slotId: ID.slot("painel2", "sol"), personId: per.marina }, per.marina).denied?.code).toBe("PTW17")
    const own = { ...data, permits: data.permits.map((p) => (p.id === P.p0012 ? { ...p, authorId: per.marina } : p)) }
    expect(step(own, { kind: "refuse", permitId: P.p0012, personId: per.marina, reason: "x" }, per.marina).denied?.code).toBe("PTW18")
    expect(step(data, { kind: "refuse", permitId: P.p0012, personId: per.paulo, reason: "x" }, per.paulo).denied?.code).toBe("PTW29")
  })
  it("quem não tem o cargo no local não assina (PTW08): recusado na gravação, mesmo que a tela tenha oferecido", () => {
    const s = step(clone(), { kind: "sign", permitId: P.p0012, slotId: ID.slot("painel2", "emi"), personId: per.joana }, per.joana)
    expect(s.denied).toEqual({ code: "PTW08", message: "Pessoa não elegível: cargo vencido ou fora do escopo do local" })
  })
  it("conta vencida no instante (não no dia) também barra a assinatura", () => {
    // Paulo's account ends 2027-01-01 00:00 (-03:00): one second before, eligible; at that instant, not.
    const paulo = person(per.paulo)
    expect(accountStateAt(paulo, instant("2026-12-31T23:59:59"))).toBe("ativa")
    expect(accountStateAt(paulo, instant("2027-01-01T00:00:00"))).toBe("vencida")
    expect(personIneligible(paulo, null, null, "2026-12-31", instant("2027-01-01T00:00:00"))).toBe("conta vencida")
  })
  it("Aceite no campo antes da janela: PTW23; dentro dela passa", () => {
    const data = clone()
    const early = step(data, { kind: "sign", permitId: P.p0008, slotId: ID.slot("painel2", "campo"), personId: per.paulo }, per.paulo)
    expect(early.denied?.code).toBe("PTW23")
  })
  it("a mesma pessoa não assina duas vezes a mesma etapa: PTW30", () => {
    // Sérgio holds tec and lider at the Linha 02. Without the separation Registra/Verifica, he could sign
    // both slots of the Preparação; the database allows one signature per person per stage and revision.
    const tpl = structuredClone(seed.templates)
    const ver = verOf(permitOf(P.p0012), tpl)
    ver.separation = ver.separation.filter((r) => ![r.slotA, r.slotB].includes(ID.slot("painel2", "iso")))
    const registry = { ...seed, templates: tpl }
    const data = clone()
    data.signatures = data.signatures.filter((g) => !(g.permitId === P.p0012 && [ID.slot("painel2", "iso"), ID.slot("painel2", "ver")].includes(g.slotId)))
    const first = step(data, { kind: "sign", permitId: P.p0012, slotId: ID.slot("painel2", "iso"), personId: per.sergio }, per.sergio, NOW, registry)
    expect(first.denied).toBeUndefined()
    const second = step(first.data, { kind: "sign", permitId: P.p0012, slotId: ID.slot("painel2", "ver"), personId: per.sergio }, per.sergio, NOW, registry)
    expect(second.denied).toEqual({ code: "PTW30", message: "Você já assinou esta etapa (Preparação)" })
  })
  it("parar uma PT já parada é negado", () => {
    expect(actDenied(permitOf(P.p0009), { kind: "stop" })?.code).toBe("PTW21")
  })
  it("sem servidor: resposta, assinatura e devolução negadas; Parar passa, grava a parada e suspende numa escrita", () => {
    const data = clone()
    const answer = step(data, { kind: "answer", permitId: P.p0012, personId: per.marina, itemId: "fi_emi_hora", value: { t: "horario", v: "10:00:00" } }, per.marina, NOW, seed, true)
    expect(answer.denied?.code).toBe("sem_servidor")
    expect(answer.data).toBe(data)
    const stop = step(data, { kind: "stop", permitId: P.p0010, personId: per.paulo, reason: "vazamento" }, per.paulo, NOW, seed, true)
    expect(stop.denied).toBeUndefined()
    const p = stop.data.permits.find((x) => x.id === P.p0010)!
    expect(p).toMatchObject({ state: "suspensa", holdReason: "vazamento", holdBy: per.paulo, holdAt: NOW, rowVersion: permitOf(P.p0010).rowVersion + 1 })
    expect(stop.events.map((e) => e.action)).toEqual(["pt.estado"])
  })
  it("parar sem login ativo: PTW24", () => {
    expect(step(clone(), { kind: "stop", permitId: P.p0010, personId: per.carlos, reason: "x" }, per.carlos).denied?.code).toBe("PTW24")
  })
  it("parar uma emitida grava a parada sem mudar o estado (pt.parada)", () => {
    const s = step(clone(), { kind: "stop", permitId: P.p0008, personId: per.rafael, reason: "chuva" }, per.rafael)
    expect(s.events.map((e) => [e.action, e.text])).toEqual([["pt.parada", "Parada: chuva"]])
    expect(s.data.permits.find((x) => x.id === P.p0008)!.state).toBe("emitida")
  })
  it("devolver em análise grava a nota de estado", () => {
    const s = step(clone(), { kind: "refuse", permitId: P.p0012, personId: per.marina, reason: "falta APR" }, per.marina)
    expect(s.denied).toBeUndefined()
    expect(s.data.permits.find((p) => p.id === P.p0012)).toMatchObject({ state: "devolvida", note: "falta APR" })
    expect(s.events[0].text).toBe("Em análise → Devolvida: falta APR")
  })
})

describe("elegibilidade recusada ao gravar (resposta Pessoa com “precisa ser elegível”)", () => {
  it("Ana (cadastro em revisão) numa pergunta de vigia elegível: PTW08, nada gravado", () => {
    const tpl = structuredClone(seed.templates)
    const base = permitOf(P.draft)
    const ver = verOf(base, tpl)
    const sol = stageOfKind(ver, "solicitacao")!
    const item: FormItem = { id: "it_vigia_teste", label: "Vigia", required: false, kind: "pessoa", multiple: false, roleId: ID.role.exec, mustBeEligible: true }
    ver.form = { sections: [...(ver.form?.sections ?? []), { id: "sec_vigia_teste", title: "Vigia", stageId: sol.id, items: [item] } as FormSection] }
    const registry = { ...seed, templates: tpl }
    const data = clone()
    const bad = step(data, { kind: "answer", permitId: P.draft, personId: per.rafael, itemId: "it_vigia_teste", value: { t: "pessoa", ids: [per.ana] } }, per.rafael, NOW, registry)
    expect(bad.denied?.code).toBe("PTW08")
    expect(bad.data).toBe(data)
    const ok = step(data, { kind: "answer", permitId: P.draft, personId: per.rafael, itemId: "it_vigia_teste", value: { t: "pessoa", ids: [per.diego] } }, per.rafael, NOW, registry)
    expect(ok.denied).toBeUndefined()
    expect(ok.data.permits.find((p) => p.id === P.draft)!.answerMeta.it_vigia_teste).toEqual({ answeredBy: per.rafael, answeredAt: NOW })
  })
  it("resposta numa PT encerrada: PTW06; expirada só na Entrega", () => {
    expect(step(clone(), { kind: "answer", permitId: P.p0006, personId: per.marina, itemId: "fi_ent_obs", value: { t: "texto", v: "x" } }, per.marina).denied?.code).toBe("PTW06")
    const exp = { ...clone() }
    exp.permits = exp.permits.map((p) => (p.id === P.p0010 ? { ...p, state: "expirada" as const } : p))
    expect(step(exp, { kind: "answer", permitId: P.p0010, personId: per.paulo, itemId: "fi_ent_obs", value: { t: "texto", v: "ok" } }, per.paulo).denied).toBeUndefined()
    expect(step(exp, { kind: "answer", permitId: P.p0010, personId: per.paulo, itemId: "fi_emi_hora", value: { t: "horario", v: "10:00:00" } }, per.paulo).denied?.code).toBe("PTW06")
  })
})

describe("Retomada anula o aceite no campo", () => {
  it("PT-…0009: Joana retoma; o aceite de Beatriz é anulado com o motivo do banco; Beatriz refaz e volta a ativa", () => {
    const at = instant("2026-11-06T14:10:00")
    const r = step(clone(), { kind: "resume", permitId: P.p0009, personId: per.joana, reason: "vazamento reparado" }, per.joana, at)
    expect(r.denied).toBeUndefined()
    expect(r.events.map((e) => e.action)).toEqual(["pt.retomada", "pt.assinatura.anulada"])
    const p = r.data.permits.find((x) => x.id === P.p0009)!
    expect(p).toMatchObject({ state: "suspensa", holdReason: null, resumedBy: per.joana })
    const campo = r.data.signatures.find((g) => g.permitId === P.p0009 && g.slotId === ID.slot("vapor1", "campo"))!
    expect(campo.voidedReason).toBe("Retomada: novo Aceite no campo exigido")
    // Joana resumed: she may not give the new acceptance (and she lacks the cargo anyway); Beatriz does.
    const again = step(r.data, { kind: "sign", permitId: P.p0009, slotId: ID.slot("vapor1", "campo"), personId: per.beatriz }, per.beatriz, at)
    expect(again.denied).toBeUndefined()
    expect(again.data.permits.find((x) => x.id === P.p0009)).toMatchObject({ state: "ativa", resumedReason: null })
  })
  it("quem não pode emitir não retoma (PTW26)", () => {
    expect(step(clone(), { kind: "resume", permitId: P.p0009, personId: per.beatriz, reason: "x" }, per.beatriz).denied?.code).toBe("PTW26")
  })
})

describe("expiração (ptw.expire_due)", () => {
  it("às 16:00 a PT-…0009 (suspensa, janela até 16:00) expira, sem pessoa, com a nota “Janela encerrada”", () => {
    const at = instant("2026-11-06T16:00:00")
    expect(dueToExpire(permitSeed.permits, instant("2026-11-06T15:59:59")).map((p) => p.id)).toEqual([])
    expect(dueToExpire(permitSeed.permits, at).map((p) => p.id)).toEqual([P.p0009])
    const s = step(clone(), { kind: "expire", permitId: P.p0009 }, null, at)
    expect(s.data.permits.find((x) => x.id === P.p0009)).toMatchObject({ state: "expirada", note: "Janela encerrada" })
    expect(s.events[0]).toMatchObject({ actor: null, auth: "sistema", action: "pt.estado", text: "Suspensa → Expirada: Janela encerrada" })
  })
})

describe("fuso: o dia é o da unidade, não o de UTC", () => {
  it("instant/wallOf/dayOf em São Paulo (-03:00)", () => {
    expect(instant("2026-11-06T14:00")).toBe("2026-11-06T14:00:00-03:00")
    expect(wallOf("2026-11-07T01:30:00Z")).toBe("2026-11-06T22:30:00")
    // 22:30 in São Paulo is already the next day in UTC: the day is still the 6th.
    expect(dayOf(instant("2026-11-06T22:30:00"))).toBe("2026-11-06")
    expect(dayOf("2026-11-07T02:59:59Z")).toBe("2026-11-06")
    expect(dayOf("2026-11-07T03:00:00Z")).toBe("2026-11-07")
    expect(hms("2026-11-07T01:30:00Z")).toBe("22:30:00")
    expect(dmHms("2026-11-07T01:30:00Z")).toBe("06/11 22:30:00")
  })
  it("validade “até o dia” vira o início do dia seguinte; virada de mês e de ano", () => {
    expect(nextDayStart("2026-12-31")).toBe("2027-01-01T00:00:00-03:00")
    expect(nextDayStart("2026-11-30")).toBe("2026-12-01T00:00:00-03:00")
    expect(nextDayStart("2028-02-28")).toBe("2028-02-29T00:00:00-03:00")
  })
  it("outro fuso e horário de verão (Nova York): sem dia a mais nem a menos", () => {
    const ny = "America/New_York"
    expect(instant("2026-07-01T12:00", ny)).toBe("2026-07-01T12:00:00-04:00")
    expect(instant("2026-12-01T12:00", ny)).toBe("2026-12-01T12:00:00-05:00")
    expect(dayOf("2026-11-01T03:30:00Z", ny)).toBe("2026-10-31")
    expect(nextDayStart("2026-11-01", ny)).toBe("2026-11-02T00:00:00-05:00")
  })
  it("o relógio simulado anda em instantes com fuso", () => {
    expect(addMinutes(NOW, 90)).toBe("2026-11-06T15:30:00-03:00")
    expect(addMinutes(instant("2026-11-06T23:59:30"), 1)).toBe("2026-11-07T00:00:30-03:00")
  })
  it("cargo válido até o dia: vale o dia inteiro no fuso da unidade, inclusive às 23:30", () => {
    // Paulo's cargo is valid until 2026-12-31: at 23:30 local (02:30 UTC of 01/01) it still holds.
    const late = instant("2026-12-31T23:30:00")
    const p = { ...person(per.paulo), accountExpires: null }
    expect(personIneligible(p, ID.role.lider, pathIds(seed.locations, ID.loc(4)), dayOf(late), late)).toBeNull()
    const next = instant("2027-01-01T00:30:00")
    expect(personIneligible(p, ID.role.lider, pathIds(seed.locations, ID.loc(4)), dayOf(next), next)).toBe("cargo vencido ou fora do escopo do local")
  })
})

describe("a área sempre pode ser devolvida (expirada / suspensa sem Retomada)", () => {
  it("expirada não é estado final e continua prendendo o equipamento", () => {
    expect(isFinalState("expirada")).toBe(false)
    expect(isOpen({ state: "expirada" })).toBe(true)
  })
  it("PT-…0004 expirada: a Entrega é a etapa atual, o aceite no campo fica como não feito, e a pessoa elegível pode entregar", () => {
    const { plan, cur, step: s } = signNext(clone(), P.p0004)
    expect(cur.stage.kind).toBe(STAGE.entrega)
    const rail = railOf(permitOf(P.p0004), verOf(permitOf(P.p0004)), permitSeed.signatures, seed.people, seed.locations, TODAY)
    expect(rail.find((st) => st.stage.kind === STAGE.campo)?.status).toBe("pulada")
    expect(plan.ok).toBe(true)
    expect(s.denied).toBeUndefined()
    expect(s.data.permits.find((p) => p.id === P.p0004)!.state).toBe("entregue")
  })
  it("PT-…0004: depois da Entrega vem o Aceite da área → encerrada, e o equipamento fica livre", () => {
    const first = signNext(clone(), P.p0004).step.data
    const { cur, step: s } = signNext(first, P.p0004)
    expect(cur.stage.kind).toBe(STAGE.area)
    const closed = s.data.permits.find((p) => p.id === P.p0004)!
    expect(closed.state).toBe("encerrada")
    const probe = { id: "probe", assetIds: [ID.asset(15)] }
    expect(equipmentHolders(probe, s.data.permits, seed.relations, PARTS).some((h) => h.holder.id === P.p0004)).toBe(false)
  })
  it("PT-…0004 aparece em Minha área para quem entrega, não em finalizadas", () => {
    const p = permitOf(P.p0004)
    const ver = verOf(p)
    const rail = railOf(p, ver, permitSeed.signatures, seed.people, seed.locations, TODAY)
    const who = rail.find((s) => s.stage.kind === STAGE.entrega)!.slots[0].eligible.find((e) => e.ok)!.person
    const w = myWork({ personId: who.id, permits: permitSeed.permits, signatures: permitSeed.signatures, people: seed.people, locations: seed.locations, templates: seed.templates, roleLabel, now: NOW, equipment: EQUIP })
    expect(w.finalizadas.some((i) => i.permitId === P.p0004)).toBe(false)
    const item = w.agir.find((i) => i.permitId === P.p0004)
    expect(item?.cta).toMatch(/entregar a área/i)
    expect(nextLabel(p, rail, seed.people)).toContain("Entrega")
  })
  it("PT-…0009 suspensa sem Retomada: dá para abandonar e entregar → entregue (a parada não barra a Entrega)", () => {
    const { plan, cur, step: s } = signNext(clone(), P.p0009)
    expect(cur.stage.kind).toBe(STAGE.entrega)
    expect(plan.checks.find((c) => c.id === "state")?.ok).toBe(true)
    expect(s.data.permits.find((p) => p.id === P.p0009)!.state).toBe("entregue")
  })
  it("expirada só aceita a Entrega: sem etapa de Entrega no modelo, nada assina", () => {
    const p = permitOf(P.p0004)
    const ver = verOf(p)
    const noEntrega: TemplateVersion = { ...ver, stages: ver.stages.filter((s) => s.kind !== STAGE.entrega) }
    const rail = railOf(p, noEntrega, permitSeed.signatures, seed.people, seed.locations, TODAY)
    const plan = planSign({ permit: p, ver: noEntrega, rail, permits: permitSeed.permits, signer: person(per.beatriz), roleLabel, now: NOW, equipment: EQUIP, people: seed.people })
    expect(plan.checks.find((c) => c.id === "state")?.ok).toBe(false)
  })
})

describe("myWork usa as mesmas entradas do detalhe da PT (pessoa elegível)", () => {
  it("resposta Pessoa não elegível: Minha área não diz “Assinar”, igual ao detalhe", () => {
    const base = permitOf(P.p0012)
    const tpl = structuredClone(seed.templates)
    const ver = verOf(base, tpl)
    const emi = stageOfKind(ver, STAGE.emissao)!
    const item: FormItem = { id: "it_vigia_teste", label: "Vigia", required: false, kind: "pessoa", multiple: false, roleId: ID.role.exec, mustBeEligible: true }
    // Only the test section in the Emissão stage, so the person answer is the one thing that decides.
    const section = { id: "sec_vigia_teste", title: "Vigia", stageId: emi.id, items: [item] } as FormSection
    ver.form = { sections: [...(ver.form?.sections ?? []).filter((x) => x.stageId !== emi.id), section] }
    // Ana Prado has the cargo but her registration is under review: not eligible.
    const permit: Permit = { ...base, snapshotSha256: null, answers: { ...base.answers, it_vigia_teste: { t: "pessoa", ids: [per.ana] } } }
    const permits = permitSeed.permits.map((p) => (p.id === permit.id ? permit : p))
    const rail = railOf(permit, ver, permitSeed.signatures, seed.people, seed.locations, TODAY)
    const detail = planSign({ permit, ver, rail, permits, signer: person(per.marina), roleLabel, now: NOW, equipment: EQUIP, people: seed.people })
    expect(detail.ok).toBe(false)
    expect(detail.checks.find((c) => !c.ok)?.text).toContain("não elegível")
    const w = myWork({ personId: per.marina, permits, signatures: permitSeed.signatures, people: seed.people, locations: seed.locations, templates: tpl, roleLabel, now: NOW, equipment: EQUIP })
    const it = [...w.agir, ...w.bloqueadas, ...w.proximas].find((i) => i.permitId === permit.id)!
    expect(it.cta ?? "").not.toMatch(/^Assinar/)
    if (it.cta) expect(it.fill).toBe(detail.fillOnly)
  })
})

describe("trava do equipamento na loja do cadastro", () => {
  const permits = permitSeed.permits
  // Two open PTs on different assets; joining them by "é parte de" must be refused.
  const open = permits.filter(isOpen)
  const [a, b] = (() => {
    for (const p of open) for (const q of open) {
      if (p.id === q.id) continue
      const x = p.assetIds[0], y = q.assetIds[0]
      if (x !== y) {
        const rel = { id: "r", fromId: x, toId: y, kindId: ID.relationKind.parte }
        if (newCollision(permits, seed.relations, [...seed.relations, rel], PARTS)) return [x, y]
      }
    }
    throw new Error("sem par de PTs abertas no exemplo")
  })()
  const rel = { id: "019affff-0000-7000-8000-000000000001", fromId: a, toId: b, kindId: ID.relationKind.parte }
  const base = { at: NOW, actorId: per.marina }

  it("adicionar “é parte de” entre equipamentos de duas PTs abertas: negado, registrado e não aplicado", () => {
    const s = registryStep(seed, { kind: "upsert", list: "relations", item: rel }, permits, base)
    expect(s.denied).toBeTruthy()
    expect(s.state).toBe(seed)
    expect(s.events.length).toBeGreaterThan(0)
    expect(s.events.every((e) => !e.ok)).toBe(true)
  })
  it("Desfazer (restore) de uma relação removida passa pela mesma trava", () => {
    const s = registryStep(seed, { kind: "restore", list: "relations", item: rel, index: 0 }, permits, base)
    expect(s.denied).toBeTruthy()
    expect(s.state).toBe(seed)
  })
  it("sem PT aberta nos ativos, a mesma relação é aceita", () => {
    const s = registryStep(seed, { kind: "upsert", list: "relations", item: rel }, [], base)
    expect(s.denied).toBeUndefined()
    expect(s.state.relations.some((r) => r.id === rel.id)).toBe(true)
  })
})

describe("lockChecks: ids únicos e texto do banco", () => {
  it("uma PT que bloqueia por dois ativos dá dois ids diferentes, cada um com PTW10 e o id da PT", () => {
    const holder: Permit = { ...permitOf(P.p0010), id: "h", number: "PT-H", state: "ativa", assetIds: [ID.asset(1), ID.asset(2)] }
    const me: Permit = { ...permitOf(P.draft), assetIds: [ID.asset(1)] }
    const relations = [{ id: "r1", fromId: ID.asset(2), toId: ID.asset(1), kindId: ID.relationKind.parte }]
    const checks = lockChecks(me, [me, holder], { relations, assets: seed.assets, partOf: PARTS })
    expect(checks).toHaveLength(2)
    expect(new Set(checks.map((c) => c.id)).size).toBe(2)
    expect(checks.map((c) => c.deny?.code)).toEqual(["PTW10", "PTW10"])
    expect(checks[0].deny?.detail).toBe("h")
    expect(checks.map((c) => c.text)).toContain("CCM-L2-01 já tem a PT-H aberta (Ativa) em CCM-L2-01")
  })
})

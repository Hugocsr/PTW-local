import { describe, expect, it } from "vitest"
import {
  accessEvent, appendEvents, asUndoDraft, auditGroup, auditValueText, canonicalJson, deniedEvent, epochMicros, eventChanges, eventHash, exportJsonl, exportManifest,
  GENESIS, microsToUtc, rowEvent, rowRange, rowTs, sessionEvent, sha256Hex, signatureEvent, systemEvent, verifyChain, type AuditCtx, type AuditDraft, type Json, type RowLookups,
} from "./audit"
import { denyCode5, ptwCodeOf, toastFor } from "./ptwErrors"

/*
 * Fixed vectors computed by ptw-server/tools/ptw_verifica.py (canon + event_hash), the independent
 * verifier: the app must agree byte for byte. Script: scratchpad d/vectors.py.
 */
const U = "019a0001-0000-7000-8000-000000000001"
const VEC_EVENTS: AuditDraft[] = [
  {
    at: "2025-11-06T14:00:00-03:00", actor: "019a0009-0000-7000-8000-000000000001", role: null, auth: "sessao", client: null, request: null, reason: null,
    action: "cadastro.ativo.alterado", ok: true, permit: null, rev: null, asset: "019a0005-0000-7000-8000-000000000009", entity: "asset",
    entityId: "019a0005-0000-7000-8000-000000000009", text: "Ativo alterado: CCM-01-K01 (apelidos)", data: { de: { aliases: [] }, para: { aliases: ["Partida P-202"] } },
  },
  {
    at: "2025-11-06T14:00:00.000001-03:00", actor: "019a0009-0000-7000-8000-000000000002", role: "019a0003-0000-7000-8000-000000000002", auth: "sessao",
    client: "simulação", request: "r-1", reason: "Desfazer", action: "pt.estado", ok: false, permit: "019a0020-0000-7000-8000-000000000010", rev: 2, asset: null,
    entity: "permit", entityId: "019a0020-0000-7000-8000-000000000010", text: "Negado (PTW05): \"aspas\" e\nquebra 😀",
    data: { erro: "PTW05", mensagem: "Fora da janela", valor: 1.5, n: 0 },
  },
  {
    at: "2025-11-06T14:01:00.123456-03:00", actor: null, role: null, auth: "sistema", client: null, request: null, reason: null,
    action: "sistema.servidor.parado", ok: true, permit: null, rev: null, asset: null, entity: null, entityId: null, text: "Servidor fora do ar", data: {},
  },
]
const VEC_HASH = [
  "463c3083ce7ee0e103ade94a8e346c85d7a7eb1833a8d5589a7564ae1446ec3c",
  "529d976c6d12a37f91802df1e30de2f67d463e5f88e115610912be4081a15eb2",
  "b581da4369fefa9a1065708fb97b248164c750c2fa013e6d206d39e999a81b22",
]
const VEC_CANON_1 =
  '{"v": 2, "at": 1762448400000000, "ok": true, "rev": null, "seq": 1, "auth": "sessao", "data": {"de": {"aliases": []}, "para": {"aliases": ["Partida P-202"]}}, "role": null, "text": "Ativo alterado: CCM-01-K01 (apelidos)", "unit": "019a0001-0000-7000-8000-000000000001", "actor": "019a0009-0000-7000-8000-000000000001", "asset": "019a0005-0000-7000-8000-000000000009", "action": "cadastro.ativo.alterado", "client": null, "entity": "asset", "permit": null, "reason": null, "request": null, "entity_id": "019a0005-0000-7000-8000-000000000009"}'

describe("auditoria: forma canônica v2 (vetores do ptw_verifica.py)", () => {
  it("SHA-256 bate com os vetores conhecidos (texto e bytes)", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Hex("abc"))
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1")
  })
  it("chaves por tamanho em bytes UTF-8 e depois byte a byte", () => {
    expect(canonicalJson({ b: 1, a: 2, aa: 3, "é": 4, z: 5 })).toBe('{"a": 2, "b": 1, "z": 5, "aa": 3, "é": 4}')
    // Length first: U+FFFF (3 bytes) comes before "abcd" and the emoji (4 bytes); a UTF-16 sort would put it last.
    expect(canonicalJson({ "ﬁ": 1, "😀": 2, abcd: 3, ab: 4, "￿": 5 })).toBe('{"ab": 4, "ﬁ": 1, "￿": 5, "abcd": 3, "😀": 2}')
  })
  it("texto: escape mínimo, resto literal em UTF-8", () => {
    expect(canonicalJson(["a\"b\\c", "\n\r\t\b\f", "\u0001\u001f", "ação ✓ 😀", "\u007f", " ", "/"]))
      .toBe('["a\\"b\\\\c", "\\n\\r\\t\\b\\f", "\\u0001\\u001f", "ação ✓ 😀", "\u007f", " ", "/"]')
  })
  it("número decimal simples, sem expoente; -0 vira 0", () => {
    // ptw_verifica.py: [0, -0.0, 1.5, 100, 1e2, 1e-7, 1e21, -2.25, 123456789012, 0.1] → "…, 0.0, …"; a JS number has no "-0.0", so it is 0.
    expect(canonicalJson([0, -0, 1.5, 100, 1e2, 1e-7, 1e21, -2.25, 123456789012, 0.1])).toBe("[0, 0, 1.5, 100, 100, 0.0000001, 1000000000000000000000, -2.25, 123456789012, 0.1]")
    expect(canonicalJson([1.5e-10, -3.25e22, 1.2345e-5])).toBe("[0.00000000015, -32500000000000000000000, 0.000012345]")
  })
  it("objetos e listas vazios, null, true, false", () => {
    expect(canonicalJson({ de: { name: "Bomba", aliases: [] }, para: { name: "Bomba 2", aliases: ["x", "y"] }, x: {}, n: null, t: true, f: false }))
      .toBe('{"f": false, "n": null, "t": true, "x": {}, "de": {"name": "Bomba", "aliases": []}, "para": {"name": "Bomba 2", "aliases": ["x", "y"]}}')
  })
  it("hash = SHA-256(prev 32 bytes ‖ canônico): três eventos encadeados iguais aos do verificador", () => {
    const log = appendEvents([], VEC_EVENTS, U)
    expect(log.map((e) => e.at)).toEqual([1762448400000000, 1762448400000001, 1762448460123456])
    expect(log.map((e) => e.hash)).toEqual(VEC_HASH)
    expect(log[0].prev).toBe(GENESIS)
    expect(canonicalJson({ v: 2, at: log[0].at, ok: true, rev: null, seq: 1, auth: "sessao", data: log[0].data, role: null, text: log[0].text, unit: U, actor: log[0].actor, asset: log[0].asset, action: log[0].action, client: null, entity: "asset", permit: null, reason: null, request: null, entity_id: log[0].entityId }))
      .toBe(VEC_CANON_1)
  })
  it("exportação: linha canônica com hash, prev e quando (UTC, µs)", () => {
    const log = appendEvents([], VEC_EVENTS, U)
    const lines = exportJsonl(log).split("\n")
    expect(lines).toHaveLength(4)
    expect(lines[3]).toBe("")
    expect(lines[2]).toBe(
      '{"v": 2, "at": 1762448460123456, "ok": true, "rev": null, "seq": 3, "auth": "sistema", "data": {}, "hash": "b581da4369fefa9a1065708fb97b248164c750c2fa013e6d206d39e999a81b22", "prev": "529d976c6d12a37f91802df1e30de2f67d463e5f88e115610912be4081a15eb2", "role": null, "text": "Servidor fora do ar", "unit": "019a0001-0000-7000-8000-000000000001", "actor": null, "asset": null, "action": "sistema.servidor.parado", "client": null, "entity": null, "permit": null, "quando": "2025-11-06T17:01:00.123456Z", "reason": null, "request": null, "entity_id": null}',
    )
    const man = exportManifest(log, { unitCode: "UN01", tz: "America/Sao_Paulo", from: "2025-11-06", to: "2025-11-07", reason: "Teste", generatedAt: "2025-11-06T15:00:00-03:00", jsonlBytes: 10, jsonlSha256: "ab" })
    expect(man).toMatchObject({ formato: "ptw-auditoria/2", unidade: U, primeiro_seq: 1, ultimo_seq: 3, eventos: 3, prev_hash_inicial: GENESIS, hash_final: VEC_HASH[2], arquivo: { nome: "auditoria-UN01-1-3.jsonl" } })
  })
})

describe("auditoria: hora", () => {
  it("µs desde 1970 a partir do ISO com fuso; sem fuso = São Paulo", () => {
    expect(epochMicros("2025-11-06T14:00:00-03:00")).toBe(1762448400000000)
    expect(epochMicros("2025-11-06T17:00:00Z")).toBe(1762448400000000)
    expect(epochMicros("2025-11-06T14:00:00")).toBe(1762448400000000)
    expect(epochMicros("2025-11-06T14:00:00.5-03:00")).toBe(1762448400500000)
    expect(microsToUtc(1762448460123456)).toBe("2025-11-06T17:01:00.123456Z")
  })
  it("a hora nunca volta em relação ao evento anterior (PTW12 no banco)", () => {
    const log = appendEvents([], [VEC_EVENTS[2], { ...VEC_EVENTS[0], at: "2025-11-06T13:00:00-03:00" }], U)
    expect(log[1].at).toBe(log[0].at)
    expect(verifyChain(log).ok).toBe(true)
  })
  it("linha: instante em UTC como to_jsonb; janela como tstzrange [início, fim)", () => {
    expect(rowTs("2026-11-06T14:00:00-03:00")).toBe("2026-11-06T17:00:00+00:00")
    expect(rowTs("2026-11-06T14:00:00.25-03:00")).toBe("2026-11-06T17:00:00.25+00:00")
    expect(rowRange("2026-11-06T14:00:00-03:00", "2026-11-06T18:00:00-03:00")).toBe('["2026-11-06 17:00:00+00","2026-11-06 21:00:00+00")')
  })
})

describe("auditoria: cadeia", () => {
  const log = appendEvents([], VEC_EVENTS, U)
  it("acrescentar não muda o que já existe", () => {
    const more = appendEvents(log, [VEC_EVENTS[0]], U)
    expect(more.slice(0, 3)).toEqual(log)
    expect(more[3].seq).toBe(4)
    expect(more[3].prev).toBe(log[2].hash)
  })
  it("detecta adulteração: texto, evento removido, ordem trocada, ok invertido, dado mudado", () => {
    expect(verifyChain(log)).toEqual({ ok: true, count: 3, head: VEC_HASH[2] })
    expect(verifyChain(log.map((e, i) => (i === 1 ? { ...e, text: "Outro" } : e)))).toMatchObject({ ok: false, firstBroken: 2 })
    expect(verifyChain([log[0], log[2]])).toMatchObject({ ok: false, firstBroken: 3 })
    // A slice may start at any seq (partial export); the event out of place is the one reported.
    expect(verifyChain([log[1], log[0], log[2]])).toMatchObject({ ok: false, firstBroken: 1 })
    expect(verifyChain(log.map((e, i) => (i === 2 ? { ...e, ok: false } : e)))).toMatchObject({ ok: false, firstBroken: 3 })
    expect(verifyChain(log.map((e, i) => (i === 0 ? { ...e, data: { de: { aliases: ["x"] } } } : e)))).toMatchObject({ ok: false, firstBroken: 1 })
    const forged = { ...log[0], text: "x" }
    const { hash: _h, ...body } = forged
    void _h
    expect(verifyChain([{ ...forged, hash: eventHash(body) }, log[1], log[2]])).toMatchObject({ ok: false, firstBroken: 2 })
  })
  it("ação fora do formato pontuado em minúsculas é recusada", () => {
    expect(() => appendEvents([], [{ ...VEC_EVENTS[0], action: "Ativo Alterado" }], U)).toThrow()
  })
})

const ctx: AuditCtx = { at: "2026-11-06T14:00:00-03:00", actorId: "p1" }
const look: RowLookups = { permitRevision: (id) => (id === "pt1" ? 3 : undefined), assetCode: (id) => (id === "a1" ? "M-201" : undefined), personName: (id) => (id === "p2" ? "Rafael Nunes" : undefined) }

describe("auditoria: evento por linha (espelho de ptw.audit_row)", () => {
  it("alteração: só as colunas que mudaram, sem as de controle; texto com rótulos", () => {
    const before = { id: "a1", unit_id: U, code: "M-201", name: "Motor", aliases: [], status: "ativo", revision: 1, updated_at: "x" }
    const e = rowEvent("asset", before, { ...before, name: "Motor 2", aliases: ["P"], revision: 2, updated_at: "y" }, ctx, look)!
    expect(e).toMatchObject({ action: "cadastro.ativo.alterado", text: "Ativo alterado: M-201 (apelidos, nome)", entity: "asset", entityId: "a1", asset: "a1", actor: "p1", auth: "sessao" })
    expect(e.data).toEqual({ de: { aliases: [], name: "Motor" }, para: { aliases: ["P"], name: "Motor 2" } })
    expect(rowEvent("asset", before, { ...before, revision: 9, updated_at: "z" }, ctx, look)).toBeNull()
  })
  it("inclusão e remoção: só 'para' / só 'de', sem id e sem nulos", () => {
    const row = { id: "r1", unit_id: U, asset_id: "a1", location_id: "l1", note: null }
    expect(rowEvent("asset_location", undefined, row, ctx, look)).toMatchObject({ action: "cadastro.ativo.local.incluido", text: "Local do ativo incluído: M-201", entityId: "a1", data: { para: { asset_id: "a1", location_id: "l1" } } })
    expect(rowEvent("asset_location", row, undefined, ctx, look)!.data).toEqual({ de: { asset_id: "a1", location_id: "l1" } })
  })
  it("PT: estado, parada, retomada e resposta com as frases do banco", () => {
    const p = { id: "pt1", unit_id: U, state: "em_analise", state_note: null, revision: 3, hold_reason: null, resumed_reason: null }
    expect(rowEvent("permit", p, { ...p, state: "devolvida", state_note: "Falta foto" }, ctx, look)).toMatchObject({ action: "pt.estado", text: "Em análise → Devolvida: Falta foto", permit: "pt1", rev: 3 })
    expect(rowEvent("permit", p, { ...p, hold_reason: "Vazamento" }, ctx, look)).toMatchObject({ action: "pt.parada", text: "Parada: Vazamento" })
    expect(rowEvent("permit", undefined, p, ctx, look)).toMatchObject({ action: "pt.criada", text: "Rascunho criado" })
    expect(rowEvent("permit_answer", undefined, { permit_id: "pt1", item_id: "tensao", value: { t: "numero", v: 0 } }, ctx, look)).toMatchObject({ action: "pt.resposta", text: "Respondeu: tensao", rev: 3, entityId: "pt1" })
    expect(rowEvent("permit_team", undefined, { permit_id: "pt1", role_id: "r", person_id: "p2" }, ctx, look)).toMatchObject({ text: "Equipe incluída: Rafael Nunes", entityId: "p2" })
  })
  it("versão: formulário como sha256; ativação com frase própria; conta separada da pessoa", () => {
    const v = { id: "v1", unit_id: U, template_id: "t1", number: 2, status: "rascunho", form: { sections: [] } as Json, note: "" }
    expect(rowEvent("template_version", undefined, v, ctx, look)!.data.para).toMatchObject({ form: { sha256: sha256Hex(canonicalJson({ sections: [] })) } })
    expect(rowEvent("template_version", v, { ...v, status: "ativa", activated_at: "x" }, ctx, look)).toMatchObject({ action: "modelo.versao.ativada", text: "Versão 2 ativada" })
    const pe = { id: "p2", unit_id: U, name: "Rafael Nunes", login: "rafael", enabled: true }
    expect(rowEvent("person", pe, { ...pe, enabled: false }, ctx, look)).toMatchObject({ action: "cadastro.conta.alterada", text: "Conta alterada: Rafael Nunes (conta ativa)" })
  })
})

describe("auditoria: assinatura, negada, acesso, sessão, sistema, desfazer", () => {
  const sig = { id: "s1", permitId: "pt1", rev: 3, slotId: "sl1", personId: "p2" }
  it("assinatura: ator é quem assinou; anulação com motivo", () => {
    expect(signatureEvent(sig, "Emissão", null, ctx)).toMatchObject({ action: "pt.assinatura", actor: "p2", text: "Assinou: Emissão", entity: "signature", data: { slot: "sl1", pessoa: "p2" } })
    expect(signatureEvent(sig, "Aceite no campo", "Retomada: novo Aceite no campo exigido", ctx)).toMatchObject({ action: "pt.assinatura.anulada", actor: "p1", text: "Assinatura anulada (Aceite no campo): Retomada: novo Aceite no campo exigido" })
  })
  it("negada: ok=false, código de 5 caracteres; chave simbólica vira o PTW do banco", () => {
    const d = deniedEvent("pt.estado", { code: "so_autor_envia", message: "Só o solicitante envia esta PT" }, { id: "pt1", revision: 3 }, ctx)
    expect(d).toMatchObject({ ok: false, text: "Negado (PTW17): Só o solicitante envia esta PT", entity: "permit", rev: 3, data: { erro: "PTW17", mensagem: "Só o solicitante envia esta PT" } })
    expect(denyCode5("PTW10")).toBe("PTW10")
    expect(denyCode5("sem_servidor")).toBe("PTA01")
    expect(ptwCodeOf({ code: "fora_da_janela" })).toBe("PTW23")
    expect(toastFor({ code: "PTW10", message: "M-201 já tem a PT-1 aberta" })).toEqual({ title: "Equipamento com PT aberta", description: "M-201 já tem a PT-1 aberta" })
    // The holder's id travels in "detail" for the screen's link; it never reaches the words.
    expect(toastFor({ code: "PTW10", message: "M-201 já tem a PT-1 aberta", detail: "019a0101-0000-7000-8000-00000000000a" }).description).toBe("M-201 já tem a PT-1 aberta")
  })
  it("acesso: anexo com arquivo/tipo/sha256; exportação exige motivo", () => {
    const a = accessEvent("acesso.anexo.visto", { permit: { id: "pt1", revision: 3 }, attachment: { id: "x1", permitId: "pt1", fileName: "foto.jpg", kind: "foto", sha256: "ab" } }, ctx)
    expect(a).toMatchObject({ text: "Viu o anexo foto.jpg", entity: "attachment", entityId: "x1", permit: "pt1", rev: 3, data: { arquivo: "foto.jpg", tipo: "foto", sha256: "ab" } })
    expect(() => accessEvent("acesso.exportacao", {}, ctx)).toThrow()
    expect(accessEvent("acesso.exportacao", { reason: "Auditoria interna" }, ctx)).toMatchObject({ text: "Exportou: Auditoria interna", data: { motivo: "Auditoria interna" } })
  })
  it("sessão e sistema", () => {
    expect(sessionEvent("sessao.entrada", true, "Entrou", "p2", ctx)).toMatchObject({ actor: "p2", entity: "person", entityId: "p2" })
    expect(systemEvent("sistema.servidor.parado", "Servidor fora do ar", ctx.at)).toMatchObject({ actor: null, role: null, auth: "sistema" })
    expect(() => systemEvent("servidor.parado", "x", ctx.at)).toThrow()
  })
  it("Desfazer: evento de linha ganha '.desfeito', 'Desfazer: ' e motivo; leituras e negadas não", () => {
    const e = rowEvent("asset", { id: "a1", code: "M-201", name: "A" }, { id: "a1", code: "M-201", name: "B" }, ctx, look)!
    expect(asUndoDraft(e)).toMatchObject({ action: "cadastro.ativo.alterado.desfeito", text: "Desfazer: Ativo alterado: M-201 (nome)", reason: "Desfazer" })
    const r = accessEvent("acesso.pt.aberta", { permit: { id: "pt1", revision: 3 } }, ctx)
    expect(asUndoDraft(r)).toBe(r)
  })
  it("grupos: negada vence; acesso; sessão, conta e sistema juntos", () => {
    expect(auditGroup({ action: "acesso.pt.aberta", ok: true })).toBe("acesso")
    expect(auditGroup({ action: "conta.bloqueada", ok: true })).toBe("sessao")
    expect(auditGroup({ action: "sistema.servidor.parado", ok: true })).toBe("sessao")
    expect(auditGroup({ action: "pt.estado", ok: false })).toBe("negada")
    expect(auditGroup({ action: "cadastro.ativo.alterado.desfeito", ok: true })).toBe("alteracao")
  })
})

describe("auditoria: leitura de data.de/para", () => {
  it("frases por coluna, com nomes, datas e estados legíveis", () => {
    const name = (id: string) => (id === "019a0009-0000-7000-8000-000000000002" ? "Rafael Nunes" : undefined)
    const fmt = (f: string, v: Json) => auditValueText(f, v, name)
    const rows = eventChanges({ data: { de: { state: "em_analise", valid_until: "2026-06-30", person_id: "019a0009-0000-7000-8000-000000000002" }, para: { state: "devolvida", valid_until: "2026-12-31", person_id: null, hold_at: "2026-11-06T17:00:00+00:00" } } }, fmt)
    expect(rows).toEqual([
      { field: "hold_at", label: "parada em", before: "—", after: "06/11/2026 14:00:00" },
      { field: "person_id", label: "pessoa", before: "Rafael Nunes", after: "—" },
      { field: "state", label: "estado", before: "Em análise", after: "Devolvida" },
      { field: "valid_until", label: "validade", before: "30/06/2026", after: "31/12/2026" },
    ])
    expect(auditValueText("work_window", '["2026-11-06 17:00:00+00","2026-11-06 21:00:00+00")')).toBe("06/11/2026 14:00:00 – 06/11/2026 18:00:00")
    expect(eventChanges({ data: { slot: "x" } }, fmt)).toEqual([])
  })
})

describe("auditoria: cadeia do exemplo", () => {
  // Replays and hashes the full fixture; Docker's constrained build shares CPU with the API tests.
  it("é íntegra, tem negadas, desfeitos, acessos, sessão e sistema; a exportação é canônica linha a linha", { timeout: 30_000 }, async () => {
    const { auditSeed } = await import("@/audit/seed")
    expect(auditSeed.length).toBeGreaterThan(40)
    expect(verifyChain(auditSeed).ok).toBe(true)
    expect(auditSeed.some((e) => !e.ok)).toBe(true)
    expect(auditSeed.some((e) => e.action.endsWith(".desfeito") && e.reason === "Desfazer")).toBe(true)
    for (const g of ["alteracao", "acesso", "sessao", "negada"] as const) expect(auditSeed.some((e) => auditGroup(e) === g)).toBe(true)
    for (let i = 1; i < auditSeed.length; i++) expect(auditSeed[i].at).toBeGreaterThanOrEqual(auditSeed[i - 1].at)
    for (const line of exportJsonl(auditSeed).trim().split("\n")) expect(canonicalJson(JSON.parse(line) as Json)).toBe(line)
  })
})

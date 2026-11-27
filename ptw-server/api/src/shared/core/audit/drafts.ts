// @ts-nocheck — cópia de ptw-mockup-v2/src/core/audit/drafts.ts; não edite (node scripts/sync-shared.mjs)
/** Drafts: one per kind of database emitter (row write, signature, extension, denied, access, session, system). */
import type { RuleError } from "../ptwErrors.ts"
import { denyCode5 } from "../ptwErrors.ts"
import { canonicalJson } from "./canonical.ts"
import { rowTs } from "./micros.ts"
import { sha256Hex } from "./sha256.ts"
import type { AuditCtx, AuditDraft, AuditTable, AuthMethod, Json, JsonObject, Row } from "./types.ts"

const ctxPart = (ctx: AuditCtx) => ({
  at: ctx.at, actor: ctx.actorId, role: ctx.roleId ?? null, auth: ctx.auth ?? (ctx.actorId ? "sessao" : "sistema") as AuthMethod,
  client: ctx.client ?? null, request: ctx.requestId ?? null, reason: ctx.reason ?? null,
})

/** Column labels of the sentences (ptw.audit_field_label). */
export const AUDIT_FIELD_LABEL: Record<string, string> = {
  name: "nome", code: "código", aliases: "apelidos", status: "situação", type_id: "tipo", parent_id: "local pai", origin: "origem",
  login: "login", enabled: "conta ativa", account_expires: "validade da conta", valid_until: "validade", scope_location_id: "escopo",
  label: "rótulo", active: "em uso", position: "posição", meaning: "significado", kind: "tipo", role_id: "cargo", person_id: "pessoa",
  min: "mínimo", required: "obrigatória", locked: "travada", note: "nota", form: "formulário", value: "valor", company: "empresa",
  employee_id: "matrícula", icon: "ícone", timezone: "fuso", scope: "escopo", work_window: "janela", location_id: "local",
  template_id: "modelo", version_id: "versão", state_note: "observação", revision: "revisão", snapshot_sha256: "formulário congelado",
  number: "número", ad_object_guid: "vínculo AD", retention_class: "classe de retenção", answered_by: "respondida por",
  system_key: "chave do sistema", required_when_item: "condição", required_when_values: "valores da condição",
  source_sha256: "pacote de origem", import_source: "origem da importação", required_when_line: "linha da condição",
  role_ids: "cargos", max_window: "prazo máximo da janela", holds_equipment: "prende o equipamento",
}
/** Labels for columns the database prints raw (its `else c`), used only on screen. */
const SCREEN_LABEL: Record<string, string> = {
  state: "estado", hold_reason: "motivo da parada", hold_by: "parada por", hold_at: "parada em", resumed_reason: "motivo da retomada",
  resumed_by: "retomada por", resumed_at: "retomada em", author_id: "autor", asset_id: "ativo", from_id: "de", to_id: "para",
  item_id: "item", family: "família", list_id: "lista", stage_id: "etapa", slot_a: "assinatura A", slot_b: "assinatura B",
  file_name: "arquivo", sha256: "SHA-256", preview_sha256: "miniatura", width: "largura", height: "altura", duration_ms: "duração",
  captured_by: "capturado por", rev: "revisão", reason: "motivo", permit_id: "PT",
  slot: "assinatura", pessoa: "pessoa", motivo: "motivo", fim: "fim da janela", erro: "código", mensagem: "mensagem", arquivo: "arquivo", tipo: "tipo",
}
export const fieldLabel = (field: string): string => AUDIT_FIELD_LABEL[field] ?? SCREEN_LABEL[field] ?? field

/** Permit states as the database names them in sentences (ptw.state_label). */
export const STATE_LABEL: Record<string, string> = {
  rascunho: "Rascunho", em_analise: "Em análise", devolvida: "Devolvida", emitida: "Emitida", ativa: "Ativa", suspensa: "Suspensa",
  entregue: "Entregue", encerrada: "Encerrada", cancelada: "Cancelada", expirada: "Expirada",
}

/** Per table: insert/update/delete actions, sentence label and the column that identifies the event. */
export const ROW_SPEC: Record<AuditTable, [string, string, string, string, string]> = {
  unit: ["cadastro.unidade.criada", "cadastro.unidade.alterada", "cadastro.unidade.removida", "Unidade", "id"],
  type_def: ["cadastro.tipo.criado", "cadastro.tipo.alterado", "cadastro.tipo.removido", "Tipo", "id"],
  location: ["cadastro.local.criado", "cadastro.local.alterado", "cadastro.local.removido", "Local", "id"],
  asset: ["cadastro.ativo.criado", "cadastro.ativo.alterado", "cadastro.ativo.removido", "Ativo", "id"],
  asset_location: ["cadastro.ativo.local.incluido", "cadastro.ativo.local.alterado", "cadastro.ativo.local.removido", "Local do ativo", "asset_id"],
  asset_relation: ["cadastro.ativo.relacao.criada", "cadastro.ativo.relacao.alterada", "cadastro.ativo.relacao.removida", "Relação entre ativos", "id"],
  person: ["cadastro.pessoa.criada", "cadastro.pessoa.alterada", "cadastro.pessoa.removida", "Pessoa", "id"],
  person_role: ["cadastro.cargo.concedido", "cadastro.cargo.alterado", "cadastro.cargo.revogado", "Cargo", "id"],
  option_list: ["cadastro.lista.criada", "cadastro.lista.alterada", "cadastro.lista.removida", "Lista", "id"],
  option_item: ["cadastro.lista.item.criado", "cadastro.lista.item.alterado", "cadastro.lista.item.removido", "Item de lista", "id"],
  template: ["modelo.criado", "modelo.alterado", "modelo.removido", "Modelo", "id"],
  template_version: ["modelo.versao.criada", "modelo.versao.alterada", "modelo.versao.removida", "Versão", "id"],
  version_location_type: ["modelo.versao.escopo.incluido", "modelo.versao.escopo.alterado", "modelo.versao.escopo.removido", "Tipo de local aceito", "version_id"],
  version_asset_type: ["modelo.versao.escopo.incluido", "modelo.versao.escopo.alterado", "modelo.versao.escopo.removido", "Tipo de ativo aceito", "version_id"],
  version_work_type: ["modelo.versao.escopo.incluido", "modelo.versao.escopo.alterado", "modelo.versao.escopo.removido", "Tipo de trabalho", "version_id"],
  stage: ["modelo.etapa.criada", "modelo.etapa.alterada", "modelo.etapa.removida", "Etapa", "id"],
  sign_slot: ["modelo.assinatura.criada", "modelo.assinatura.alterada", "modelo.assinatura.removida", "Assinatura do modelo", "id"],
  separation: ["modelo.separacao.criada", "modelo.separacao.alterada", "modelo.separacao.removida", "Separação", "version_id"],
  permit: ["pt.criada", "pt.alterada", "pt.removida", "PT", "id"],
  permit_asset: ["pt.ativo.incluido", "pt.ativo.alterado", "pt.ativo.removido", "Ativo da PT", "asset_id"],
  permit_team: ["pt.equipe.incluida", "pt.equipe.alterada", "pt.equipe.removida", "Equipe", "person_id"],
  permit_answer: ["pt.resposta", "pt.resposta", "pt.resposta.removida", "Resposta", "permit_id"],
  attachment: ["pt.anexo.incluido", "pt.anexo.alterado", "pt.anexo.removido", "Anexo", "id"],
  permit_revision: ["pt.revisao", "pt.revisao", "pt.revisao", "Revisão", "permit_id"],
}

/** Derived or control columns never enter the diff (ptw.audit_strip). */
const STRIP = ["unit_id", "search", "updated_at", "row_version", "path", "holds", "num", "object_key", "type_fam", "role_fam", "kind_fam", "answered_at", "created_at", "captured_at", "stored_at", "snapshot_at", "activated_at"]
function strip(table: AuditTable, r: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === undefined || STRIP.includes(k) || (k === "revision" && table !== "permit")) continue
    out[k] = v
  }
  return out
}

/** jsonb_strip_nulls: drops null object members at every depth (nulls inside lists stay). */
export function stripNulls(v: Json): Json {
  if (Array.isArray(v)) return v.map(stripNulls)
  if (v && typeof v === "object") {
    const out: JsonObject = {}
    for (const [k, x] of Object.entries(v)) if (x !== null && x !== undefined) out[k] = stripNulls(x)
    return out
  }
  return v
}
const same = (a: Json | undefined, b: Json | undefined) => canonicalJson(a ?? null) === canonicalJson(b ?? null)
const str = (v: Json | undefined): string | null => (v === null || v === undefined ? null : typeof v === "string" ? v : canonicalJson(v))
const verbOf = (action: string) => action.split(".").pop()!.replace("incluid", "incluíd")

/** What a row write needs from elsewhere (the trigger reads it from other tables). */
export interface RowLookups { permitRevision(permitId: string): number | undefined; assetCode(assetId: string): string | undefined; personName(personId: string): string | undefined }

const FIXED_TEXT = ["pt.estado", "pt.parada", "pt.retomada", "pt.parada.removida", "pt.prorrogada", "modelo.versao.ativada", "modelo.versao.arquivada"]

/**
 * The event the database's row trigger (ptw.audit_row) writes for one insert (no `before`), update or
 * delete (no `after`) of a table row; null when nothing changed. Same action, text and data.
 */
export function rowEvent(table: AuditTable, before: Row | undefined, after: Row | undefined, ctx: AuditCtx, look: RowLookups): AuditDraft | null {
  if (!before && !after) return null
  const [insAct, updAct, delAct, lbl, idc] = ROW_SPEC[table]
  const op = !before ? "INSERT" : !after ? "DELETE" : "UPDATE"
  const r = (after ?? before)!
  const o = before && strip(table, before), n = after && strip(table, after)
  let dOld: JsonObject | null = null, dNew: JsonObject | null = null, act: string, ch: string[] = []
  if (op === "UPDATE") {
    ch = Object.keys(n!).filter((k) => !same(o![k], n![k])).sort()
    if (!ch.length) return null
    dOld = Object.fromEntries(ch.map((k) => [k, o![k] ?? null]))
    dNew = Object.fromEntries(ch.map((k) => [k, n![k]]))
    act = updAct
  } else if (op === "INSERT") {
    const { id: _id, ...rest } = stripNulls(n!) as JsonObject
    void _id
    dNew = rest; act = insAct
  } else {
    const { id: _id, ...rest } = stripNulls(o!) as JsonObject
    void _id
    dOld = rest; act = delAct
  }
  if (table === "template_version") {
    const formHash = (d: JsonObject | null) => { if (d && "form" in d) d.form = { sha256: sha256Hex(canonicalJson(d.form)) } }
    const sourceHash = (d: JsonObject | null) => { if (d && "import_source" in d) d.import_source = { sha256: sha256Hex(canonicalJson(d.import_source)) } }
    formHash(dOld); formHash(dNew); sourceHash(dOld); sourceHash(dNew)
  }

  const eid = str(r[idc])
  const pid = table === "permit" ? str(r.id) : str(r.permit_id)
  const aid = table === "asset" ? str(r.id) : table === "asset_relation" ? str(r.from_id) : str(r.asset_id)
  let nm = str(r.code) ?? str(r.name) ?? str(r.label) ?? str(r.meaning) ?? str(r.item_id) ?? str(r.file_name)
  if (idc === "asset_id") nm = (aid && look.assetCode(aid)) ?? null
  else if (idc === "person_id" || table === "person_role") nm = (str(r.person_id) && look.personName(str(r.person_id)!)) ?? null

  let rv: number | null = null
  if (table === "permit") rv = r.revision as number
  else if (table === "permit_revision") rv = r.rev as number
  else if (pid) rv = look.permitRevision(pid) ?? null

  let txt = `${lbl} ${verbOf(act)}${nm !== null ? `: ${nm}` : ""}`
  if (table === "permit" && op === "INSERT") {
    txt = "Rascunho criado"
  } else if (table === "permit" && op === "UPDATE") {
    if (dNew && "state" in dNew) {
      act = "pt.estado"
      txt = `${STATE_LABEL[str(before!.state) ?? ""]} → ${STATE_LABEL[str(after!.state) ?? ""]}${after!.state_note != null ? `: ${str(after!.state_note)}` : ""}`
    } else if (dNew && "hold_reason" in dNew && after!.hold_reason != null) {
      act = "pt.parada"; txt = `Parada: ${str(after!.hold_reason)}`
    } else if (dNew && "resumed_reason" in dNew && after!.resumed_reason != null) {
      act = "pt.retomada"; txt = `Retomada: ${str(after!.resumed_reason)}`
    } else if (dNew && "hold_reason" in dNew) {
      act = "pt.parada.removida"; txt = "Parada removida"
    } else {
      act = "pt.alterada"
    }
  } else if (table === "template_version" && op === "UPDATE" && dNew && "status" in dNew) {
    const st = str(after!.status)
    act = st === "ativa" ? "modelo.versao.ativada" : st === "arquivada" ? "modelo.versao.arquivada" : "modelo.versao.alterada"
    txt = `Versão ${str(after!.number)} ${verbOf(act)}`
  } else if (table === "template_version") {
    txt = `Versão ${str(r.number)} ${verbOf(act)}`
  } else if (table === "person" && op === "UPDATE" && ch.every((c) => ["login", "enabled", "account_expires", "ad_object_guid"].includes(c))) {
    act = "cadastro.conta.alterada"; txt = `Conta alterada: ${nm}`
  } else if (table === "permit_answer") {
    txt = `${op === "DELETE" ? "Resposta removida: " : "Respondeu: "}${nm}`
  } else if (table === "permit_revision") {
    txt = `Nova revisão ${str(r.rev)}: ${str(r.reason)}`
  }
  if (op === "UPDATE" && !FIXED_TEXT.includes(act)) txt += ` (${ch.map((c) => AUDIT_FIELD_LABEL[c] ?? c).join(", ")})`

  const data = stripNulls({ de: dOld, para: dNew }) as JsonObject
  return { ...ctxPart(ctx), action: act, ok: true, permit: pid, rev: rv, asset: aid, entity: table, entityId: eid, text: txt, data }
}

type SigLike = { id: string; permitId: string; rev: number; slotId: string; personId: string; delegationId?: string | null; representedPersonId?: string | null }
/**
 * A signature (ptw.signature_audit): the actor is who signed. With `voidedReason`, its annulment
 * (actor = the session). Text "Assinou: <significado>" / "Assinatura anulada (<significado>): motivo".
 */
export function signatureEvent(sig: SigLike, meaning: string, voidedReason: string | null, ctx: AuditCtx): AuditDraft {
  const base = { ...ctxPart(ctx), ok: true, permit: sig.permitId, rev: sig.rev, asset: null, entity: "signature", entityId: sig.id }
  if (voidedReason === null) {
    return { ...base, actor: sig.personId, action: "pt.assinatura", text: `Assinou: ${meaning}`, data: { slot: sig.slotId, pessoa: sig.personId, ...(sig.delegationId ? { delegacao: sig.delegationId, representado: sig.representedPersonId ?? null } : {}) } }
  }
  return { ...base, action: "pt.assinatura.anulada", text: `Assinatura anulada (${meaning}): ${voidedReason}`, data: { slot: sig.slotId, pessoa: sig.personId, motivo: voidedReason } }
}

/**
 * Prorrogar (ptw.permit_extend): the permit row's update of the window's end is written by the row
 * trigger as "pt.prorrogada" (the permit_extension row has no event of its own). `text` = "Janela
 * prorrogada: até DD/MM HH:MM → até DD/MM HH:MM · motivo" (the plant's wall time); data =
 * {"de": {"fim"}, "para": {"fim"}, "motivo"}; entity = the permit.
 */
export function extensionEvent(x: { id: string; permitId: string; revision: number; oldEnd: string; newEnd: string; reason: string }, text: string, ctx: AuditCtx): AuditDraft {
  return {
    ...ctxPart(ctx), action: "pt.prorrogada", ok: true, permit: x.permitId, rev: x.revision, asset: null, entity: "permit", entityId: x.permitId,
    text, data: { de: { fim: rowTs(x.oldEnd) }, para: { fim: rowTs(x.newEnd) }, motivo: x.reason },
  }
}

/** A denied attempt (ptw.audit_denied): the attempted action, "Negado (CÓDIGO): mensagem", ok = false. */
export function deniedEvent(action: string, err: RuleError, permit: { id: string; revision: number } | null, ctx: AuditCtx, data: JsonObject = {}): AuditDraft {
  const code = denyCode5(err.code)
  return {
    ...ctxPart(ctx), action, ok: false, permit: permit?.id ?? null, rev: permit?.revision ?? null, asset: null,
    entity: permit ? "permit" : null, entityId: permit?.id ?? null, text: `Negado (${code}): ${err.message}`,
    data: { ...data, erro: code, mensagem: err.message },
  }
}

/** A sensitive read (ptw.audit_access): "acesso.pt.aberta", "acesso.anexo.visto/baixado", "acesso.exportacao" (reason required), "acesso.auditoria.busca/evento". */
export function accessEvent(
  action: string,
  o: { permit?: { id: string; revision: number }; attachment?: { id: string; permitId: string; fileName: string; kind: string; sha256: string }; reason?: string; data?: JsonObject },
  ctx: AuditCtx,
): AuditDraft {
  if (!/^acesso(\.[a-z_]+)+$/.test(action)) throw new Error(`Acesso: a ação começa com "acesso." (${action})`)
  if (action.startsWith("acesso.exportacao") && !o.reason?.trim()) throw new Error("Exportação exige motivo")
  let d: JsonObject = { ...(o.data ?? {}) }
  const permitId = o.permit?.id ?? o.attachment?.permitId ?? null
  if (o.attachment) d = { ...d, arquivo: o.attachment.fileName, tipo: o.attachment.kind, sha256: o.attachment.sha256 }
  if (o.reason !== undefined && o.reason !== null) d = { ...d, motivo: o.reason }
  const fname = o.attachment?.fileName
  const text =
    action === "acesso.pt.aberta" ? "Abriu a PT"
      : action === "acesso.anexo.visto" ? `Viu o anexo ${fname}`
        : action === "acesso.anexo.baixado" ? `Baixou o anexo ${fname}`
          : action.startsWith("acesso.exportacao") ? `Exportou: ${o.reason}`
            : action === "acesso.auditoria.busca" ? "Consultou a auditoria"
              : action === "acesso.auditoria.evento" ? "Abriu um evento da auditoria"
                : `Acesso: ${action}`
  return {
    ...ctxPart(ctx), action, ok: true, permit: permitId, rev: o.permit?.revision ?? null, asset: null,
    entity: o.attachment ? "attachment" : permitId ? "permit" : null, entityId: o.attachment?.id ?? permitId, text, data: d,
  }
}

/** Session and account (ptw.audit_log): "sessao.*" or "conta.*", ok or failed, about a person. */
export function sessionEvent(action: string, ok: boolean, text: string, personId: string | null, ctx: AuditCtx, data: JsonObject = {}): AuditDraft {
  if (!/^(sessao|conta)(\.[a-z_]+)+$/.test(action) || !text) throw new Error(`Evento de sessão inválido: ${action}`)
  return {
    ...ctxPart(ctx), actor: personId ?? ctx.actorId, action, ok, permit: null, rev: null, asset: null,
    entity: personId ? "person" : null, entityId: personId, text, data,
  }
}

/** The system itself (ptw.audit_system): no person, no role, auth "sistema". */
export function systemEvent(action: string, text: string, at: string, data: JsonObject = {}): AuditDraft {
  if (!/^sistema(\.[a-z_]+)+$/.test(action) || !text) throw new Error(`Evento do sistema inválido: ${action}`)
  return { at, actor: null, role: null, auth: "sistema", client: null, request: null, reason: null, action, ok: true, permit: null, rev: null, asset: null, entity: null, entityId: null, text, data }
}

/**
 * Negação na trilha (A6, obrigação 2 do README): um `PTWnn` desfaz a transação inteira, inclusive o
 * que ela gravaria na trilha. Por isso a recusa é gravada em OUTRA transação, com `set_context` de
 * novo e `ptw.audit_denied(ação tentada, código, mensagem, pt, dados)`.
 */
import type { FastifyRequest } from "fastify"
import { isUuid } from "../db.js"
import type { ApiError } from "./apiError.js"

/**
 * Ação tentada por operação, igual à `deniedAction` do app (`permit/reducer.ts`). As rotas de
 * cadastro e modelos informam a sua em `OpOptions.deniedAction` (a ação da escrita).
 */
export const DENIED_ACTION: Record<string, string> = {
  signPermit: "pt.assinatura",
  submitPermit: "pt.estado",
  returnPermit: "pt.estado",
  updatePermit: "pt.alterada",
  createPermit: "pt.criada",
  putPermitAnswer: "pt.resposta",
  removePermitAnswer: "pt.resposta",
  stopPermit: "pt.parada",
  resumePermit: "pt.retomada",
  extendPermit: "pt.prorrogada",
  createAttachment: "pt.anexo.incluido",
  getPermit: "acesso.pt.aberta",
  recordPermitAccess: "acesso.pt.aberta",
  getAttachmentContent: "acesso.anexo.baixado",
  listAuditEvents: "acesso.auditoria.busca",
  getAuditEvent: "acesso.auditoria.evento",
  createAuditExport: "acesso.exportacao",
  confirmTemplateImport: "modelo.importado",
  activateTemplateVersion: "modelo.versao.ativada",
  devLogin: "sessao.entrada",
  login: "sessao.entrada",
  logout: "sessao.saida",
}

/** `getPermitHistory` → `api.get_permit_history` (o formato de ação que o banco aceita). */
const fallbackAction = (operationId: string): string => "api." + operationId.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()).replace(/[^a-z_]/g, "")

export function deniedActionOf(req: FastifyRequest): string {
  const op = req.ptw.op
  if (!op) return "api.desconhecida"
  if (op.operationId === "getAttachmentContent" && (req.query as { mode?: string }).mode === "visto") return "acesso.anexo.visto"
  return req.server.ptw.registered.get(op.operationId)?.deniedAction ?? DENIED_ACTION[op.operationId] ?? fallbackAction(op.operationId)
}

function permitCandidate(req: FastifyRequest): string | null {
  const op = req.ptw.op
  if (!op) return null
  const custom = req.server.ptw.registered.get(op.operationId)?.deniedPermit
  if (custom) return custom(req)
  if (!op.path.startsWith("/permits/{id}")) return null
  const id = (req.params as Record<string, unknown> | undefined)?.id
  return isUuid(id) ? id : null
}

/** Grava a negação. Nunca troca o erro original: se a trilha falhar, fica no log. */
export async function recordDenial(req: FastifyRequest, e: ApiError): Promise<void> {
  const state = req.ptw
  if (state.unitId === null) return
  const candidate = permitCandidate(req)
  const data = JSON.stringify({ operacao: state.op?.operationId ?? null, metodo: req.method, status: e.status })
  try {
    await req.server.ptw.db.withContext(
      {
        unitId: state.unitId,
        personId: state.session?.personId ?? null,
        auth: state.session?.auth ?? "sessao",
        client: state.client,
        requestId: state.requestId,
      },
      async (tx) => {
        let permit: string | null = null
        if (candidate !== null) {
          // audit_denied recusa PT que não existe na unidade: confere antes.
          const found = await tx`select 1 from ptw.permit where unit_id = ptw.current_unit() and id = ${candidate}::uuid`
          if (found.length > 0) permit = candidate
        }
        await tx`select ptw.audit_denied(${deniedActionOf(req)}::text, ${e.code}::text, ${e.message}::text, ${permit}::uuid, ${data}::jsonb)`
      },
    )
  } catch (err) {
    req.log.error({ err, code: e.code }, "negação não gravada na trilha")
  }
}

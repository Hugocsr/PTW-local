/**
 * Quem está na sessão. O cookie só aponta para a sessão (`ptw.api_session`); a cada requisição a
 * conta é conferida de novo no banco, na mesma transação: conta desativada ou vencida derruba a
 * sessão na hora (`401 PTA02`).
 */
import type { FastifyRequest } from "fastify"
import { pta } from "../errors/apiError.js"
import { accountProblem, accountState } from "./person.js"
import { csrfOf, hashToken, readSessionCookie } from "./cookie.js"
import type { SessionRecord } from "./store.js"
import { groupSources, grantView } from "./access.js"
import type { GrantSource } from "../shared/core/governance.js"

/** De quanto em quanto tempo a última atividade da sessão é regravada. */

/**
 * Preenche `req.ptw.session`. Com `required`, a falta de sessão válida é `401 PTA02`.
 * Sem `required` (entrada de desenvolvimento), só reconhece a sessão que já existe, para encerrá-la.
 */
export async function authenticate(req: FastifyRequest, required: boolean): Promise<void> {
  const app = req.server.ptw
  const token = readSessionCookie(req.headers.cookie)
  req.ptw.cookieToken = token
  if (token === null) {
    if (!required) return
    const e = pta.unauthorized()
    // Perguntar "há sessão?" sem cookie é a abertura do app, não uma tentativa: não vai para a trilha.
    if (req.ptw.op?.operationId === "getSession") e.audited = true
    throw e
  }
  const now = app.now()
  const hash = hashToken(token)
  const unitId = req.ptw.unitId as string
  const found = await app.db.withContext<{ rec: SessionRecord | null; problem: string | null; groups?: GrantSource[] }>(
    { unitId, personId: null, auth: "sessao", client: req.ptw.client, requestId: req.ptw.requestId },
    async (tx) => {
      const rec = await app.sessions.get(tx, hash)
      if (!rec || rec.endedAt !== null || rec.unitId !== unitId) {
        return { rec: null, problem: "Sessão expirada: entre de novo" }
      }
      if (rec.expiresAt.getTime() <= now.getTime() || now.getTime()-rec.seenAt.getTime() >= app.config.sessionIdleMs) {
        if (await app.sessions.end(tx,hash,now)) await tx`select ptw.audit_log('sessao.expirada',true,'Sessão expirada','{}'::jsonb,${rec.personId}::uuid)`
        return { rec:null, problem:"Sessão expirada: entre de novo" }
      }
      if (!required) return { rec, problem: null }
      const state = await accountState(tx, rec.personId)
      const problem = state === null ? "Pessoa removida do cadastro" : accountProblem(state, now)
      if (problem !== null) {
        if (await app.sessions.end(tx, hash, now)) await tx`select ptw.audit_log('sessao.expirada',true,'Sessão encerrada: conta indisponível','{}'::jsonb,${rec.personId}::uuid)`
        return { rec: null, problem: `${problem}: sessão encerrada` }
      }
      return { rec, problem: null, groups: await groupSources(tx, unitId, rec.personId) }
    },
  )
  if (found.rec === null) {
    if (!required) return
    throw pta.unauthorized(found.problem ?? undefined)
  }
  const rec = found.rec
  req.ptw.session = {
    hash,
    csrfToken: csrfOf(token),
    unitId: rec.unitId,
    personId: rec.personId,
    auth: rec.auth,
    ...grantView(rec.grants, found.groups ?? []),
    directoryGrants: rec.grants,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
  }
}

/**
 * Sessão: LDAP com TLS e grupos, entrada de desenvolvimento, atividade e saída.
 * Entrada (ok ou falha) e saída ficam na trilha por `ptw.audit_log`.
 */
import type { FastifyRequest } from "fastify"
import { createHash } from "node:crypto"
import { defineRoutes } from "../app.js"
import type { Schemas } from "../contract/types.js"
import { withCtx, type Tx } from "../db.js"
import { pta } from "../errors/apiError.js"
import type { AppState } from "../http/state.js"
import { clearedCookie, csrfOf, hashToken, newToken, sessionCookie } from "../session/cookie.js"
import { accountProblem, loadPerson, loadUnit } from "../session/person.js"
import { directoryLogin, type Grant } from "../session/ldap.js"
import { groupSources, grantView } from "../session/access.js"

type SessionBody = Schemas["Session"]

/** Entrada de desenvolvimento: permissões administrativas completas, explicitamente habilitada. */
const ALL_GRANTS: SessionBody["grants"] = ["cadastro", "modelos", "auditoria", "exportacao"]

async function sessionBody(tx: Tx, state: AppState, s: { personId: string; auth: SessionBody["auth"]; grants: Grant[]; expiresAt: Date; csrfToken: string }): Promise<SessionBody> {
  const person = await loadPerson(tx, { id: s.personId })
  const unit = await loadUnit(tx)
  if (!person || !unit) throw pta.unauthorized("Pessoa ou unidade da sessão não existe mais")
  // SPEC 002: as do diretório (s.grants) mais as dos perfis dos grupos da pessoa.
  const view = grantView(s.grants, await groupSources(tx, unit.id, s.personId))
  const clock = await tx<{ now: Date }[]>`select clock_timestamp() as now`
  return {
    person,
    unit,
    auth: s.auth,
    grants: view.grants,
    grantSources: view.grantSources,
    expiresAt: s.expiresAt.toISOString(),
    now: (clock[0]?.now ?? state.now()).toISOString(),
    csrfToken: s.csrfToken,
    devLogin: state.config.devLogin,
  }
}

const baseCtx = (req: FastifyRequest) => ({ unitId: req.ptw.unitId as string, client: req.ptw.client, requestId: req.ptw.requestId })

export default defineRoutes((api) => {
  const { state } = api

  api.op("listDevPeople", (req) => withCtx(req, async (tx) => ({
    items: await tx<{ id: string; name: string; login: string }[]>`
      select id, name, login from ptw.person
       where unit_id = ptw.current_unit() and status = 'ativo' and enabled and login is not null
         and (account_expires is null or account_expires > now())
       order by lower(name), id`,
  })), { enabled: () => state.config.devLogin })

  api.op("getSession", (req) => {
    const s = req.ptw.session!
    return withCtx(req, (tx) => sessionBody(tx, state, { ...s, grants: s.directoryGrants }))
  })

  api.op("sessionActivity", async (req, reply) => {
    await withCtx(req, (tx) => state.sessions.touch(tx, req.ptw.session!.hash, state.now()))
    return reply.code(204).send()
  })

  api.op("login", async (req, reply) => {
    const cfg = state.config.ldap
    if (!cfg) throw pta.unavailable()
    const login = req.body.login.toLowerCase()
    const bucket = "login:" + createHash("sha256").update(login).digest("hex")
    // req.ip é a conexão do Caddy; X-Forwarded-For só é aceito do proxy configurado no Fastify.
    const ip = "ip:" + createHash("sha256").update(req.ip).digest("hex")
    const context = { ...baseCtx(req), personId:null, auth:"ldap" as const }
    const retry = !state.config.loginLimit ? 0 : await state.db.withContext(context, async (tx) => {
      const a = await tx<{wait:number}[]>`select ptw.login_reserve(${ip}::text) as wait`
      if (a[0]!.wait) return a[0]!.wait
      const b = await tx<{wait:number}[]>`select ptw.login_reserve(${bucket}::text) as wait`
      return b[0]!.wait
    })
    if (retry) {
      await state.db.withContext(context, (tx) => tx`select ptw.audit_log('sessao.entrada',false,'Entrada bloqueada por tentativas',${JSON.stringify({login,metodo:"ldap",espera:retry})}::jsonb)`)
      const err=pta.tooMany(retry); err.audited=true; throw err
    }
    let identity: Awaited<ReturnType<typeof directoryLogin>>
    try { identity = await directoryLogin(cfg,login,req.body.password) }
    catch (err) {
      await state.db.withContext(context, (tx) => tx`select ptw.audit_log('sessao.entrada', false, 'Entrada LDAP recusada', ${JSON.stringify({login,metodo:"ldap"})}::jsonb)`)
      if (err && typeof err === "object" && "audited" in err) err.audited = true
      throw err
    }
    const now = state.now(), token = newToken()
    const expiresAt = new Date(now.getTime()+state.config.sessionTtlMs)
    const body = await state.db.withContext(context, async (tx) => {
      await tx`select id from ptw.person where unit_id=ptw.current_unit() and lower(login)=${login} for update`
      const person = await loadPerson(tx,{login})
      if (!person || accountProblem(person,now) || (person.adObjectGuid && person.adObjectGuid !== identity.guid)) {
        await tx`select ptw.audit_log('sessao.entrada',false,'Pessoa não habilitada ou identidade divergente',${JSON.stringify({login,metodo:"ldap"})}::jsonb,${person?.id ?? null}::uuid)`
        return null
      }
      await tx`select ptw.set_context(${req.ptw.unitId}::uuid,${person.id}::uuid,null,'ldap',${req.ptw.client}::text,${req.ptw.requestId}::text)`
      if (!person.adObjectGuid) await tx`update ptw.person set ad_object_guid=${identity.guid}::uuid where unit_id=ptw.current_unit() and id=${person.id}::uuid`
      const prev = req.ptw.session
      if (prev && await state.sessions.end(tx,prev.hash,now)) await tx`select ptw.audit_log('sessao.saida',true,'Saiu (nova entrada)', '{}'::jsonb, ${prev.personId}::uuid)`
      await tx`select ptw.login_succeeded(${bucket}::text)`
      const access = grantView(identity.grants, await groupSources(tx, req.ptw.unitId!, person.id))
      await tx`select ptw.audit_log('sessao.entrada',true,'Entrou (LDAP)',${JSON.stringify({metodo:"ldap",permissoes:access.grants,diretorio:identity.grants,grupos:access.grantSources.filter((g) => g.from === "grupo")})}::jsonb,${person.id}::uuid)`
      await state.sessions.create(tx,{hash:hashToken(token),unitId:req.ptw.unitId!,personId:person.id,auth:"ldap",grants:identity.grants,client:req.ptw.client,createdAt:now,expiresAt})
      return sessionBody(tx,state,{personId:person.id,auth:"ldap",grants:identity.grants,expiresAt,csrfToken:csrfOf(token)})
    })
    if (!body) { const err = pta.forbidden("Conta sem acesso ao PTW"); err.audited=true; throw err }
    reply.header("set-cookie",sessionCookie(token,state.config.sessionTtlMs/1000))
    return body
  })

  api.op(
    "devLogin",
    async (req, reply) => {
      const now = state.now()
      const login = req.body.login
      const found = await state.db.withContext({ ...baseCtx(req), personId: null, auth: "sessao" }, async (tx) => {
        const person = await loadPerson(tx, { login })
        const problem = person ? accountProblem(person, now) : "Login não encontrado"
        if (problem !== null) {
          // A falha fica na trilha como entrada recusada (e a transação é confirmada).
          await tx`select ptw.audit_log('sessao.entrada', false, ${"Entrada recusada: " + problem}::text,
                     ${JSON.stringify({ login, metodo: "desenvolvimento" })}::jsonb, ${person?.id ?? null}::uuid)`
        }
        return { person, problem }
      })
      if (found.problem !== null || !found.person) {
        const e = pta.unauthorized(found.problem ?? "Login não encontrado")
        e.audited = true
        throw e
      }

      // Troca de pessoa: a sessão anterior sai antes.
      const prev = req.ptw.session
      if (prev) {
        await state.db.withContext({ ...baseCtx(req), personId: prev.personId, auth: prev.auth },
          async (tx) => {
            await tx`select ptw.audit_log('sessao.saida', true, 'Saiu (troca de pessoa)'::text, '{}'::jsonb)`
            await state.sessions.end(tx, prev.hash, now)
          })
      }

      const token = newToken()
      const expiresAt = new Date(now.getTime() + state.config.sessionTtlMs)
      const personId = found.person.id
      const body = await state.db.withContext({ ...baseCtx(req), personId, auth: "sessao" }, async (tx) => {
        await tx`select ptw.audit_log('sessao.entrada', true, 'Entrou (entrada de desenvolvimento)'::text,
                   ${JSON.stringify({ metodo: "desenvolvimento" })}::jsonb)`
        // A sessão nasce na mesma transação da entrada: ou as duas, ou nenhuma.
        await state.sessions.create(tx, { hash: hashToken(token), unitId: req.ptw.unitId as string, personId, auth: "sessao", grants: ALL_GRANTS, client: req.ptw.client, createdAt: now, expiresAt })
        return sessionBody(tx, state, { personId, auth: "sessao", grants: ALL_GRANTS, expiresAt, csrfToken: csrfOf(token) })
      })
      reply.header("set-cookie", sessionCookie(token, state.config.sessionTtlMs / 1000))
      return body
    },
    { enabled: () => state.config.devLogin },
  )

  api.op("logout", async (req, reply) => {
    const s = req.ptw.session!
    await withCtx(req, async (tx) => {
      await tx`select ptw.audit_log('sessao.saida', true, 'Saiu'::text, '{}'::jsonb)`
      await state.sessions.end(tx, s.hash, state.now())
    })
    reply.header("set-cookie", clearedCookie())
    return reply.code(204).send()
  })
})

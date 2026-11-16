/**
 * PT (F1-05): Quadro, Minha área, a PT inteira, o Histórico, as respostas e os atos. Cada ato chama a
 * sua função do banco (L1–L4); a resposta de toda escrita é a PT como ficou (`PermitDetail`), lida
 * na mesma transação, com `ETag: "<rowVersion>"`.
 */
import type { FastifyReply } from "fastify"
import { defineRoutes, type OpRequest } from "../../app.js"
import { withCtx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { createDraft, extend, lockRevision, mustExist, putAnswer, reasonAct, removeAnswer, sign, signingRole, submit, updateDraft, type ReasonAct } from "../../repo/permits/acts.js"
import { countBoard, listBoard, listMine, loadDetail, permitHistory, recordOpen, resolvePermitId, type PermitDetail } from "../../repo/permits/read.js"
import { iso, permitIdOf, personOf } from "../../repo/permits/sql.js"

const etag = (d: PermitDetail) => d.permit.rowVersion
const unitOf = (req: { ptw: { unitId: string | null } }): string => {
  if (req.ptw.unitId === null) throw pta.unexpected(undefined, "unidade não resolvida")
  return req.ptw.unitId
}

/** O `{id}` de leitura: uuid ou número da PT. 404 se não existe na unidade. */
const idOrNumber = (req: { params: unknown }): string => String((req.params as { id?: unknown }).id ?? "")

export default defineRoutes((api) => {
  // ------------------------------------------------------------ leitura
  api.op("listPermits", (req) => withCtx(req, (tx) => listBoard(tx, unitOf(req), personOf(req), req.query)))
  api.op("countPermits", (req) => withCtx(req, (tx) => countBoard(tx, unitOf(req), personOf(req), req.query)))
  api.op("listMyPermits", (req) => withCtx(req, (tx) => listMine(tx, unitOf(req), personOf(req), req.query)))

  api.op("getPermit", async (req, reply) => {
    const out = await withCtx(req, async (tx) => {
      const id = await resolvePermitId(tx, idOrNumber(req))
      if (id === null) throw pta.notFound()
      const d = await loadDetail(tx, id)
      // Cada abertura é um evento (D5), na mesma transação da leitura.
      await recordOpen(tx, id)
      return d
    })
    setEtag(reply, etag(out))
    return out
  })

  api.op("recordPermitAccess", async (req, reply) => {
    await withCtx(req, async (tx) => {
      const id = await resolvePermitId(tx, idOrNumber(req))
      if (id === null) throw pta.notFound()
      await recordOpen(tx, id)
    })
    return reply.code(204).send()
  })

  api.op("getPermitHistory", (req) =>
    withCtx(req, async (tx) => {
      const id = await resolvePermitId(tx, idOrNumber(req))
      if (id === null) throw pta.notFound()
      return permitHistory(tx, id, req.query)
    }),
  )

  // ------------------------------------------------------------ rascunho
  api.op("createPermit", (req, reply) =>
    idempotent(req, reply, async (tx) => loadDetail(tx, await createDraft(tx, personOf(req), req.body)), { status: 201, etag }),
  )

  api.op("updatePermit", async (req, reply) => {
    const rev = requireIfMatch(req)
    const id = permitIdOf(req)
    const out = await withCtx(req, async (tx) => {
      await updateDraft(tx, id, rev, req.body)
      return loadDetail(tx, id)
    })
    setEtag(reply, etag(out))
    return out
  })

  // ------------------------------------------------------------ respostas
  api.op("putPermitAnswer", async (req) => {
    const id = permitIdOf(req)
    const itemId = req.params.itemId
    const r = await withCtx(req, async (tx) => {
      await mustExist(tx, id)
      return putAnswer(tx, id, itemId, req.body)
    })
    return { itemId, value: r.value as never, answeredBy: r.answered_by, answeredAt: iso(r.answered_at) }
  })

  api.op("removePermitAnswer", async (req, reply) => {
    const id = permitIdOf(req)
    await withCtx(req, async (tx) => {
      await mustExist(tx, id)
      await removeAnswer(tx, id, req.params.itemId)
    })
    return reply.code(204).send()
  })

  // ------------------------------------------------------------ atos
  api.op("submitPermit", (req, reply) => {
    const rev = requireIfMatch(req)
    const id = permitIdOf(req)
    return idempotent(
      req,
      reply,
      async (tx) => {
        await lockRevision(tx, id, rev)
        await submit(tx, id)
        return loadDetail(tx, id)
      },
      { etag },
    )
  })

  api.op("signPermit", async (req, reply) => {
    const id = permitIdOf(req)
    // A4: o cargo da assinatura que a pessoa tem vai no contexto (o evento pt.assinatura grava).
    const roleId = await withCtx(req, (tx) => signingRole(tx, personOf(req), req.body.slotId))
    return idempotent(
      req,
      reply,
      async (tx) => {
        await mustExist(tx, id)
        await sign(tx, id, req.body)
        return loadDetail(tx, id)
      },
      { etag, roleId },
    )
  })

  const withReason = (act: ReasonAct, ifMatch: boolean) => (req: OpRequest<"returnPermit">, reply: FastifyReply) => {
    const rev = ifMatch ? requireIfMatch(req) : null
    const id = permitIdOf(req)
    const reason = req.body.reason
    const write = async (tx: Parameters<Parameters<typeof withCtx>[1]>[0]) => {
      if (rev === null) await mustExist(tx, id)
      else await lockRevision(tx, id, rev)
      await reasonAct(tx, act, id, reason)
      return loadDetail(tx, id)
    }
    // Parar aceita Idempotency-Key (o app guarda a parada e reenvia); os outros, só If-Match.
    return idempotent(req, reply, write, { etag, reason })
  }
  api.op("returnPermit", withReason("return", true))
  api.op("discardPermit", withReason("discard", true) as never, { deniedAction: "pt.estado" })
  api.op("stopPermit", withReason("stop", false) as never)
  api.op("resumePermit", withReason("resume", true) as never)

  api.op("extendPermit", (req, reply) => {
    const rev = requireIfMatch(req)
    const id = permitIdOf(req)
    return idempotent(
      req,
      reply,
      async (tx) => {
        await lockRevision(tx, id, rev)
        await extend(tx, id, req.body)
        return loadDetail(tx, id)
      },
      { etag, reason: req.body.reason },
    )
  })
})

import { defineRoutes } from "../app.js"
import { withCtx } from "../db.js"
import { idempotent } from "../http/idempotency.js"
import { requireIfMatch } from "../http/ifMatch.js"
import { createDelegation, listDelegations, revokeDelegation, updateDelegation } from "../repo/delegations.js"

export default defineRoutes((api) => {
  api.op("listDelegations", (req) => withCtx(req, (tx) => listDelegations(tx, req.ptw.session!.grants.includes("cadastro"))))
  api.op("createDelegation", (req, reply) => idempotent(req, reply, (tx) => createDelegation(tx, req.body), { status: 201, etag: (d) => d.revision }), { deniedAction: "delegacao.criada" })
  api.op("updateDelegation", (req, reply) => idempotent(req, reply, (tx) => updateDelegation(tx, req.params.id, requireIfMatch(req), req.body), { etag: (d) => d.revision }), { deniedAction: "delegacao.alterada" })
  api.op("revokeDelegation", (req, reply) => idempotent(req, reply, (tx) => revokeDelegation(tx, req.params.id, requireIfMatch(req), req.body.reason), { etag: (d) => d.revision }), { deniedAction: "delegacao.revogada" })
})

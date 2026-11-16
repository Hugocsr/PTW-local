import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { idempotent } from "../../http/idempotency.js"
import { pathId } from "../../repo/registry/sql.js"
import { createType, getType, listTypes, removeType, updateType } from "../../repo/registry/unitTypes.js"

export default defineRoutes((api) => {
  api.op("listTypes", (req) => withCtx(req, (tx) => listTypes(tx, req.query)))
  api.op("createType", (req, reply) => idempotent(req, reply, (tx) => createType(tx, req.body), { status: 201 }), { deniedAction: "cadastro.tipo.criado" })
  api.op("getType", (req) => withCtx(req, (tx) => getType(tx, pathId(req))))
  api.op("updateType", (req) => withCtx(req, (tx) => updateType(tx, pathId(req), req.body)), { deniedAction: "cadastro.tipo.alterado" })
  api.op(
    "removeType",
    async (req, reply) => {
      await withCtx(req, (tx) => removeType(tx, pathId(req)))
      return reply.code(204).send()
    },
    { deniedAction: "cadastro.tipo.removido" },
  )
})

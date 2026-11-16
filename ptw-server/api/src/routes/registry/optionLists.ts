import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { createOptionList, getOptionList, listOptionLists, removeOptionList, updateOptionList } from "../../repo/registry/optionLists.js"
import { pathId } from "../../repo/registry/sql.js"

export default defineRoutes((api) => {
  api.op("listOptionLists", (req) => withCtx(req, (tx) => listOptionLists(tx, req.query)))
  api.op("createOptionList", (req, reply) => idempotent(req, reply, (tx) => createOptionList(tx, req.body), { status: 201, etag: (b) => b.revision }), { deniedAction: "cadastro.lista.criada" })
  api.op("getOptionList", async (req, reply) => {
    const out = await withCtx(req, (tx) => getOptionList(tx, pathId(req)))
    setEtag(reply, out.revision)
    return out
  })
  api.op(
    "updateOptionList",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updateOptionList(tx, pathId(req), rev, req.body))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "cadastro.lista.alterada" },
  )
  api.op(
    "removeOptionList",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      await withCtx(req, (tx) => removeOptionList(tx, pathId(req), rev))
      return reply.code(204).send()
    },
    { deniedAction: "cadastro.lista.removida" },
  )
})

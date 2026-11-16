import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { createPerson, getPerson, listPeople, updatePerson } from "../../repo/registry/people.js"
import { pathId } from "../../repo/registry/sql.js"

export default defineRoutes((api) => {
  api.op("listPeople", (req) => withCtx(req, (tx) => listPeople(tx, req.query)))
  api.op("createPerson", (req, reply) => idempotent(req, reply, (tx) => createPerson(tx, req.body), { status: 201, etag: (b) => b.revision }), { deniedAction: "cadastro.pessoa.criada" })
  api.op("getPerson", async (req, reply) => {
    const out = await withCtx(req, (tx) => getPerson(tx, pathId(req)))
    setEtag(reply, out.revision)
    return out
  })
  api.op(
    "updatePerson",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updatePerson(tx, pathId(req), rev, req.body))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "cadastro.pessoa.alterada" },
  )
})

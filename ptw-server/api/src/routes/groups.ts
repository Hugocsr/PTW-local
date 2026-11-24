import { defineRoutes } from "../app.js"
import { withCtx } from "../db.js"
import { pta } from "../errors/apiError.js"
import { requireIfMatch, setEtag } from "../http/ifMatch.js"
import { idempotent } from "../http/idempotency.js"
import { listGroups, saveGroup } from "../repo/groups.js"
import { groupProblems } from "../shared/core/governance.js"

export default defineRoutes((api) => {
  api.op("listPersonGroups", (req) => withCtx(req, listGroups))
  api.op("createPersonGroup", (req, reply) => {
    const problems = groupProblems(req.body)
    if (problems.length) throw pta.badRequest("Grupo inválido", problems.join("; "))
    return idempotent(req, reply, (tx) => saveGroup(tx, req.body, null), { status: 201, etag: (x) => x.revision })
  }, { deniedAction: "cadastro.grupo.criado" })
  api.op("updatePersonGroup", async (req, reply) => {
    if (req.params.id !== req.body.id) throw pta.badRequest("O grupo do endereço difere do corpo")
    const problems = groupProblems(req.body)
    if (problems.length) throw pta.badRequest("Grupo inválido", problems.join("; "))
    const x = await withCtx(req, (tx) => saveGroup(tx, req.body, requireIfMatch(req)))
    setEtag(reply, x.revision)
    return x
  }, { deniedAction: "cadastro.grupo.alterado" })
})

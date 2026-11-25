import { defineRoutes } from "../app.js"
import { withCtx } from "../db.js"
import { pta } from "../errors/apiError.js"
import { requireIfMatch, setEtag } from "../http/ifMatch.js"
import { idempotent } from "../http/idempotency.js"
import { listGroups, listProfiles, personAccess, saveGroup, saveProfile } from "../repo/groups.js"
import { groupProblems, profileProblems } from "../shared/core/governance.js"

export default defineRoutes((api) => {
  api.op("listPersonGroups", (req) => withCtx(req, listGroups))
  api.op("createPersonGroup", (req, reply) => {
    const problems = groupProblems(req.body)
    if (problems.length) throw pta.badRequest("Grupo inválido", problems.join("; "))
    return idempotent(req, reply, (tx) => saveGroup(tx, req.body, null, req.ptw.session), { status: 201, etag: (x) => x.revision })
  }, { deniedAction: "cadastro.grupo.criado" })
  api.op("updatePersonGroup", async (req, reply) => {
    if (req.params.id !== req.body.id) throw pta.badRequest("O grupo do endereço difere do corpo")
    const problems = groupProblems(req.body)
    if (problems.length) throw pta.badRequest("Grupo inválido", problems.join("; "))
    const x = await withCtx(req, (tx) => saveGroup(tx, req.body, requireIfMatch(req), req.ptw.session))
    setEtag(reply, x.revision)
    return x
  }, { deniedAction: "cadastro.grupo.alterado" })

  // Perfis de acesso (SPEC 002): leitura para quem está na sessão; gravar exige cadastro (tag).
  api.op("listAccessProfiles", (req) => withCtx(req, listProfiles))
  api.op("createAccessProfile", (req, reply) => {
    const problems = profileProblems(req.body)
    if (problems.length) throw pta.badRequest("Perfil inválido", problems.join("; "))
    return idempotent(req, reply, (tx) => saveProfile(tx, req.body, null, req.ptw.session), { status: 201, etag: (x) => x.revision })
  }, { deniedAction: "cadastro.perfil.criado" })
  api.op("updateAccessProfile", async (req, reply) => {
    if (req.params.id !== req.body.id) throw pta.badRequest("O perfil do endereço difere do corpo")
    const problems = profileProblems(req.body)
    if (problems.length) throw pta.badRequest("Perfil inválido", problems.join("; "))
    const x = await withCtx(req, (tx) => saveProfile(tx, req.body, requireIfMatch(req), req.ptw.session))
    setEtag(reply, x.revision)
    return x
  }, { deniedAction: "cadastro.perfil.alterado" })
  api.op("getPersonAccess", (req) => {
    const s = req.ptw.session!
    if (s.personId !== req.params.id && !s.grants.includes("cadastro")) throw pta.forbidden()
    return withCtx(req, (tx) => personAccess(tx, req.params.id))
  })
})

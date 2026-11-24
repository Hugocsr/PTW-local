import { createHash } from "node:crypto"
import { defineRoutes } from "../app.js"
import { withCtx } from "../db.js"
import { pta } from "../errors/apiError.js"
import { requireIfMatch, setEtag } from "../http/ifMatch.js"
import { brandPng } from "../http/brandPng.js"
import { getAppearance, putAppearance, putAppearanceAsset, getAppearanceAsset } from "../repo/appearance.js"
import { appearanceProblems } from "../shared/core/appearance.js"

export default defineRoutes((api) => {
  api.op("getPublicAppearance", async (req) => {
    const x = await withCtx(req, getAppearance, { statementTimeoutMs: 800, retries: 0 })
    return { brand: x.brand }
  })
  api.op("getAppearance", async (req, reply) => {
    const x = await withCtx(req, getAppearance)
    setEtag(reply, x.revision)
    return x
  })
  api.op("putAppearance", async (req, reply) => {
    const brand = req.body.brand
    if (brand !== null) {
      const problems = appearanceProblems(brand)
      if (problems.length) throw pta.badRequest("Identidade visual inválida", problems.join("; "))
    }
    const x = await withCtx(req, (tx) => putAppearance(tx, brand, requireIfMatch(req)))
    setEtag(reply, x.revision)
    return x
  }, { deniedAction: "identidade.publicada" })
  api.op("putAppearanceAsset", async (req) => {
    const bytes = brandPng(req.body.base64), hash = createHash("sha256").update(bytes).digest("hex")
    await withCtx(req, (tx) => putAppearanceAsset(tx, hash, bytes))
    return { file: `${hash}.png` }
  }, { bodyLimit: 360000, deniedAction: "identidade.imagem.incluida" })
  api.op("getAppearanceAsset", async (req, reply) => {
    const bytes = await withCtx(req, (tx) => getAppearanceAsset(tx, req.params.file), { statementTimeoutMs: 800, retries: 0 })
    reply.header("x-content-type-options", "nosniff")
    return reply.type("image/png").send(bytes)
  })
})

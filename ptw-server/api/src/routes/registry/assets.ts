import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { createAsset, getAssetDetail, listAssets, listHolds, updateAsset } from "../../repo/registry/assets.js"
import { createRelation, listRelations, removeRelation } from "../../repo/registry/relations.js"
import { pathId } from "../../repo/registry/sql.js"

export default defineRoutes((api) => {
  api.op("listAssets", (req) => withCtx(req, (tx) => listAssets(tx, req.query)))
  api.op("createAsset", (req, reply) => idempotent(req, reply, (tx) => createAsset(tx, req.body), { status: 201, etag: (b) => b.revision }), { deniedAction: "cadastro.ativo.criado" })
  api.op("getAsset", async (req, reply) => {
    const out = await withCtx(req, (tx) => getAssetDetail(tx, pathId(req)))
    setEtag(reply, out.asset.revision)
    return out
  })
  api.op(
    "updateAsset",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updateAsset(tx, pathId(req), rev, req.body))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "cadastro.ativo.alterado" },
  )

  api.op("listAssetRelations", (req) => withCtx(req, (tx) => listRelations(tx, req.query)))
  api.op("createAssetRelation", (req, reply) => idempotent(req, reply, (tx) => createRelation(tx, req.body), { status: 201 }), { deniedAction: "cadastro.ativo.relacao.criada" })
  api.op(
    "removeAssetRelation",
    async (req, reply) => {
      await withCtx(req, (tx) => removeRelation(tx, pathId(req)))
      return reply.code(204).send()
    },
    { deniedAction: "cadastro.ativo.relacao.removida" },
  )

  api.op("listEquipmentHolds", (req) => withCtx(req, (tx) => listHolds(tx, req.query.assetId, req.query.exceptPermitId)))
})

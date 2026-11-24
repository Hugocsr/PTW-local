import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { createLocation, getLocation, listLocations, updateLocation } from "../../repo/registry/locations.js"
import { pathId } from "../../repo/registry/sql.js"
import { locationAssetCounts } from "../../repo/registry/locationCounts.js"

export default defineRoutes((api) => {
  api.op("locationAssetCounts", (req, reply) => {
    reply.header("Cache-Control", "no-store")
    return withCtx(req, tx => locationAssetCounts(tx, req.query.locationIds))
  })
  api.op("listLocations", (req) => withCtx(req, (tx) => listLocations(tx, req.query)))
  api.op("createLocation", (req, reply) => idempotent(req, reply, (tx) => createLocation(tx, req.body), { status: 201, etag: (b) => b.revision }), { deniedAction: "cadastro.local.criado" })
  api.op("getLocation", async (req, reply) => {
    const out = await withCtx(req, (tx) => getLocation(tx, pathId(req)))
    setEtag(reply, out.revision)
    return out
  })
  api.op(
    "updateLocation",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updateLocation(tx, pathId(req), rev, req.body))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "cadastro.local.alterado" },
  )
})

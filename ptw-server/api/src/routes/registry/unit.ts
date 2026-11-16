import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { getUnit } from "../../repo/registry/unitTypes.js"

export default defineRoutes((api) => {
  api.op("getUnit", (req) => withCtx(req, (tx) => getUnit(tx)))
})

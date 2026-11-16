import { Readable } from "node:stream"
import { defineRoutes } from "../app.js"
import { withCtx } from "../db.js"
import { pta } from "../errors/apiError.js"
import { idempotent } from "../http/idempotency.js"
import { chain, createExport, facets, getEvent, getExport, listEvents, listExports, verify } from "../repo/audit.js"

export default defineRoutes((api) => {
  api.op("listAuditEvents", req => withCtx(req, tx => listEvents(tx, req.query)))
  api.op("getAuditEvent", req => withCtx(req, tx => getEvent(tx, req.params.seq)))
  api.op("getAuditFacets", req => withCtx(req, tx => facets(tx, req.query)))
  api.op("getAuditChain", req => withCtx(req, chain))
  api.op("verifyAuditChain", req => withCtx(req, verify, { statementTimeoutMs: 60_000 }))
  api.op("listAuditExports", req => withCtx(req, tx => listExports(tx, req.query)))
  api.op("createAuditExport", (req, reply) => idempotent(req, reply, tx => createExport(tx, req.body), { status: 201, statementTimeoutMs: 60_000 }))
  api.op("downloadAuditExportManifest", async (req, reply) => {
    const out = await withCtx(req, async tx => {
      const found = await getExport(tx, req.params.id)
      if (found.manifest === null) throw pta.notFound("Manifesto guardado fora do servidor")
      await tx`select ptw.audit_access('acesso.exportacao.manifesto', p_reason => ${found.item.reason}::text, p_data => ${JSON.stringify({ exportacao: req.params.id })}::jsonb)`
      return found
    })
    reply.type("application/json").header("content-disposition", `attachment; filename="${out.item.fileName}.manifesto.json"`)
    return reply.send(out.manifest)
  })
  api.op("downloadAuditExportEvents", async (req, reply) => {
    const out = await withCtx(req, async tx => {
      const found = await getExport(tx, req.params.id)
      await tx`select ptw.audit_access('acesso.exportacao.eventos', p_reason => ${found.item.reason}::text, p_data => ${JSON.stringify({ exportacao: req.params.id })}::jsonb)`
      return found.item
    })
    async function* lines() {
      for (let first = out.firstSeq; first <= out.lastSeq; first += 500) {
        const last = Math.min(first + 499, out.lastSeq)
        const rows = await withCtx(req, tx => tx<{ line: string }[]>`select ptw.audit_export_lines(ptw.current_unit(), ${first}, ${last}) as line`)
        if (rows.length !== last - first + 1) throw new Error("Exportação incompleta")
        for (const row of rows) yield row.line + "\n"
      }
    }
    reply.type("application/x-ndjson").header("content-disposition", `attachment; filename="${out.fileName}.jsonl"`)
    return reply.send(Readable.from(lines()))
  })
})

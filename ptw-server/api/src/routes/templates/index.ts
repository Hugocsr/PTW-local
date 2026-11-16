/**
 * Modelos de PT (F1-04): modelos, versões (rascunho editável, ativação), importação do pacote
 * `ptw.modelo/1` (prévia + confirmação com token) e exportação. Cada escrita é uma transação; a
 * trilha dos filhos (etapas, assinaturas, separações, escopo) é gravada pelos gatilhos do banco.
 */
import { defineRoutes } from "../../app.js"
import { withCtx } from "../../db.js"
import { pta } from "../../errors/apiError.js"
import { idempotent } from "../../http/idempotency.js"
import { requireIfMatch, setEtag } from "../../http/ifMatch.js"
import { confirmImport, exportPackage, previewImport, recordExport } from "../../repo/templates/import.js"
import { getTemplate, getVersion, listTemplates } from "../../repo/templates/read.js"
import { pathId } from "../../repo/templates/sql.js"
import {
  activateVersion, copyFromVersion, createTemplate, insertVersion, removeTemplate, removeVersion, updateTemplate, updateVersion, type VersionInput,
} from "../../repo/templates/write.js"

const unitOf = (req: { ptw: { unitId: string | null } }): string => {
  if (req.ptw.unitId === null) throw pta.unexpected(undefined, "unidade não resolvida")
  return req.ptw.unitId
}
const personOf = (req: { ptw: { session: { personId: string | null } | null } }): string | null => req.ptw.session?.personId ?? null

/** Nome do arquivo de exportação: o do modelo, sem o que o sistema de arquivos recusa. */
const fileName = (name: string): string => `${[...name].map((c) => (c.charCodeAt(0) < 32 || "\\/:*?\"<>|".includes(c) ? "_" : c)).join("").trim().slice(0, 100) || "modelo"}.ptw-modelo.json`

export default defineRoutes((api) => {
  api.op("listTemplates", (req) => withCtx(req, (tx) => listTemplates(tx, req.query)))

  api.op(
    "createTemplate",
    (req, reply) => idempotent(req, reply, (tx) => createTemplate(tx, req.body as never), { status: 201, etag: (t) => t.revision }),
    { deniedAction: "modelo.criado" },
  )

  api.op("previewTemplateImport", (req) =>
    withCtx(req, (tx) => previewImport(tx, req.body, { unit: unitOf(req), person: personOf(req) })),
  )

  api.op(
    "confirmTemplateImport",
    (req, reply) =>
      idempotent(req, reply, (tx) => confirmImport(tx, req.body, { unit: unitOf(req), person: personOf(req) }), {
        status: 201,
        etag: (c) => c.template.revision,
      }),
    { deniedAction: "modelo.importado" },
  )

  api.op("getTemplate", async (req, reply) => {
    const out = await withCtx(req, (tx) => getTemplate(tx, pathId(req)))
    setEtag(reply, out.revision)
    return out
  })

  api.op(
    "updateTemplate",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updateTemplate(tx, pathId(req), rev, req.body))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "modelo.alterado" },
  )

  api.op(
    "removeTemplate",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      await withCtx(req, (tx) => removeTemplate(tx, pathId(req), rev))
      return reply.code(204).send()
    },
    { deniedAction: "modelo.removido" },
  )

  api.op(
    "exportTemplate",
    async (req, reply) => {
      const reason = req.ptw.reason
      if (reason === null || reason.trim() === "") throw pta.badRequest("Informe o motivo da exportação", "cabeçalho X-Ptw-Reason")
      const id = pathId(req)
      const out = await withCtx(req, async (tx) => {
        const r = await exportPackage(tx, id, req.query.versionId)
        await recordExport(tx, reason, { modelo: r.name, ...(r.version ? { versao: r.version.number, versaoId: r.version.id } : {}) })
        return r
      })
      const name = fileName(out.name)
      reply.header("content-disposition", `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      return out.pkg
    },
    { deniedAction: "acesso.exportacao.modelo" },
  )

  api.op(
    "createTemplateVersion",
    (req, reply) =>
      idempotent(
        req,
        reply,
        (tx) => {
          const templateId = pathId(req)
          const body = req.body as { copyFrom?: string; id?: string } & VersionInput
          if (body.copyFrom !== undefined) return copyFromVersion(tx, templateId, body.copyFrom, body.id)
          return insertVersion(tx, templateId, body).then((vid) => getVersion(tx, templateId, vid))
        },
        { status: 201, etag: (v) => v.revision },
      ),
    { deniedAction: "modelo.versao.criada" },
  )

  api.op("getTemplateVersion", async (req, reply) => {
    const out = await withCtx(req, (tx) => getVersion(tx, pathId(req), pathId(req, "versionId")))
    setEtag(reply, out.revision)
    return out
  })

  api.op(
    "updateTemplateVersion",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => updateVersion(tx, pathId(req), pathId(req, "versionId"), rev, req.body as VersionInput))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "modelo.versao.alterada" },
  )

  api.op(
    "removeTemplateVersion",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      await withCtx(req, (tx) => removeVersion(tx, pathId(req), pathId(req, "versionId"), rev))
      return reply.code(204).send()
    },
    { deniedAction: "modelo.versao.removida" },
  )

  api.op(
    "activateTemplateVersion",
    async (req, reply) => {
      const rev = requireIfMatch(req)
      const out = await withCtx(req, (tx) => activateVersion(tx, pathId(req), pathId(req, "versionId"), rev))
      setEtag(reply, out.revision)
      return out
    },
    { deniedAction: "modelo.versao.ativada" },
  )
})

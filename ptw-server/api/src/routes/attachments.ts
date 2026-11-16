import { createHash, randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { defineRoutes } from "../app.js"
import type { Schemas } from "../contract/types.js"
import { withCtx, type Tx } from "../db.js"
import { ApiError, pta } from "../errors/apiError.js"
import { idempotent } from "../http/idempotency.js"
import { S3 } from "../storage/s3.js"

const LIMIT = 2_147_483_648
async function blob(tx: Tx, sha: string): Promise<(Schemas["Blob"] & { key: string }) | null> {
  const r = await tx<{ sha256: string; size: string; mime: string; stored_at: Date; object_key: string }[]>`
    select encode(sha256, 'hex') as sha256, size, mime, stored_at, object_key
    from ptw.blob where unit_id = ptw.current_unit() and sha256 = decode(${sha}, 'hex')`
  const b = r[0]
  return b ? { sha256: b.sha256, size: Number(b.size), mime: b.mime, storedAt: b.stored_at.toISOString(), key: b.object_key } : null
}
function publicBlob(b: Schemas["Blob"]): Schemas["Blob"] { return { sha256: b.sha256, size: b.size, mime: b.mime, storedAt: b.storedAt } }
async function attachment(tx: Tx, id: string): Promise<Schemas["PermitAttachment"]> {
  const rows = await tx<{ item: Schemas["PermitAttachment"] }[]>`
    select jsonb_build_object('id', id, 'permitId', permit_id, 'itemId', item_id, 'kind', kind,
      'sha256', encode(sha256, 'hex'), 'fileName', file_name, 'previewSha256', encode(preview_sha256, 'hex'),
      'width', width, 'height', height, 'durationMs', duration_ms, 'capturedBy', captured_by, 'capturedAt', captured_at) as item
    from ptw.attachment where unit_id = ptw.current_unit() and id = ${id}::uuid`
  if (!rows[0]) throw pta.notFound()
  return rows[0].item
}
const disposition = (name: string, mode: string) => {
  const safe = [...name].map(c => c.charCodeAt(0) < 32 || c === '"' || c === "\\" ? "_" : c).join("")
  return `${mode}; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`
}

export default defineRoutes((api) => {
  let storage: S3 | undefined
  const s3 = () => storage ??= new S3(api.config.storageUrl)

  api.op("hasBlob", async (req, reply) => {
    const b = await withCtx(req, tx => blob(tx, req.params.sha256))
    if (!b) return reply.code(404).send()
    return reply.header("content-length", b.size).header("content-type", b.mime).code(200).send()
  })
  api.op("putBlob", async (req, reply) => {
    const size = Number(req.headers["content-length"])
    if (size > LIMIT) throw pta.tooLarge()
    const mime = (req.ptw.uploadMime ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase()
    if (!/^(image|video|application|text)\/[a-z0-9.+-]{1,100}$/.test(mime)) throw pta.badRequest("Tipo de arquivo inválido")
    const sha = req.params.sha256
    const existing = await withCtx(req, tx => blob(tx, sha))
    const temporary = `${req.ptw.unitId}/tmp/${randomUUID()}`
    const finalKey = `${req.ptw.unitId}/${sha.slice(0, 2)}/${sha}`
    const hash = createHash("sha256")
    let received = 0, failure: ApiError | undefined
    async function* checked() {
      for await (const data of req.body as unknown as Readable) {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as Uint8Array)
        received += chunk.length
        if (received > LIMIT || received > size) { failure = received > LIMIT ? pta.tooLarge() : pta.blobMismatch(); throw failure }
        hash.update(chunk)
        yield chunk
      }
      if (received !== size) { failure = pta.blobMismatch(); throw failure }
    }
    try {
      if (existing) { for await (const chunk of checked()) { void chunk /* Confere também uma repetição. */ } }
      else await s3().put(temporary, Readable.from(checked(), { objectMode: false, highWaterMark: 64 * 1024 }), size, mime)
      if (hash.digest("hex") !== sha) throw pta.blobMismatch()
      if (existing) return publicBlob(existing)
      await s3().copy(temporary, finalKey)
      const saved = await withCtx(req, async tx => {
        await tx`insert into ptw.blob (unit_id, sha256, size, mime)
          values (ptw.current_unit(), decode(${sha}, 'hex'), ${size}, ${mime}) on conflict do nothing`
        return (await blob(tx, sha))!
      })
      reply.code(201)
      return publicBlob(saved)
    } catch (err) { throw failure ?? err }
    finally {
      if (!existing) await s3().remove(temporary).catch(err => req.log.error({ err }, "Limpeza do upload temporário falhou"))
    }
  }, { bodyLimit: LIMIT, deniedAction: "arquivo.incluido" })
  api.op("createAttachment", (req, reply) => idempotent(req, reply, async tx => {
    const b = req.body
    const id = b.id ?? randomUUID()
    await tx`insert into ptw.attachment (unit_id, id, permit_id, item_id, kind, sha256, file_name, preview_sha256, width, height, duration_ms, captured_by)
      values (ptw.current_unit(), ${id}::uuid, ${req.params.id}::uuid, ${b.itemId}, ${b.kind}, decode(${b.sha256}, 'hex'), ${b.fileName},
        decode(${b.previewSha256 ?? null}, 'hex'), ${b.width ?? null}, ${b.height ?? null}, ${b.durationMs ?? null}, ptw.current_person())`
    return attachment(tx, id)
  }, { status: 201 }), { deniedAction: "pt.anexo.incluido" })
  api.op("getAttachment", req => withCtx(req, tx => attachment(tx, req.params.id)))

  for (const op of ["getAttachmentContent", "getAttachmentPreview"] as const) api.op(op, async (req, reply) => {
    const preview = op === "getAttachmentPreview"
    const mode = "mode" in req.query ? req.query.mode : "visto"
    const { a, b } = await withCtx(req, async tx => {
      const a = await attachment(tx, req.params.id)
      const sha = preview ? a.previewSha256 : a.sha256
      if (!sha) throw pta.notFound()
      const b = await blob(tx, sha)
      if (!b) throw pta.notFound()
      // O commit deste evento acontece antes de buscar o conteúdo e antes do primeiro byte.
      if (!preview) await tx`select ptw.audit_access(${mode === "baixado" ? "acesso.anexo.baixado" : "acesso.anexo.visto"}, p_attachment => ${a.id!}::uuid)`
      return { a, b }
    })
    const range = req.headers.range
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) throw new ApiError(416, "PTA05", "Faixa de bytes inválida")
    const response = await s3().request("GET", b.key, range && !preview ? { range } : {})
    if (response.status === 416) { await response.body?.cancel(); throw new ApiError(416, "PTA05", "Faixa de bytes fora do arquivo") }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw pta.unavailable() }
    // Conteúdo ativo enviado por uma pessoa (HTML, SVG, JavaScript) nunca executa na origem do app.
    const inlineSafe = /^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(b.mime) || b.mime.startsWith("video/") || b.mime === "application/pdf" || b.mime === "text/plain"
    reply.code(response.status).type(inlineSafe ? b.mime : "application/octet-stream").header("accept-ranges", "bytes")
      .header("content-disposition", disposition(a.fileName, mode === "baixado" || !inlineSafe ? "attachment" : "inline"))
      .header("content-security-policy", "sandbox; default-src 'none'")
    for (const key of ["content-length", "content-range"]) { const val = response.headers.get(key); if (val) reply.header(key, val) }
    return reply.send(Readable.fromWeb(response.body as never))
  })
})

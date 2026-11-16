/** S3 interno, assinado. Os corpos atravessam em fluxo; nunca se carrega um arquivo inteiro. */
import { readFileSync } from "node:fs"
import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http"
import { request as httpsRequest } from "node:https"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { AwsV4Signer } from "aws4fetch"
import { pta } from "../errors/apiError.js"

export class S3 {
  readonly bucket = "ptw-arquivos"
  private readonly key: string
  private readonly secret: string
  constructor(private readonly endpoint: string) {
    this.key = readFileSync(process.env.PTW_S3_KEY_FILE ?? "/run/secrets/s3_api_key", "utf8").trim()
    this.secret = readFileSync(process.env.PTW_S3_SECRET_FILE ?? "/run/secrets/s3_api_secret", "utf8").trim()
  }
  async request(method: string, key: string, headers: Record<string, string> = {}, body?: Readable): Promise<Response> {
    const url = `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`
    const signed = await new AwsV4Signer({ url, method, headers, service: "s3", region: process.env.PTW_S3_REGION ?? "us-east-1",
      accessKeyId: this.key, secretAccessKey: this.secret }).sign()
    try {
      // pipe conserva a contrapressão e evita as cópias/filas do adaptador fetch no upload.
      let req!: ClientRequest
      const incoming = new Promise<IncomingMessage>((resolve, reject) => {
        req = (url.startsWith("https:") ? httpsRequest : httpRequest)(url, {
          method, headers: Object.fromEntries(signed.headers), signal: AbortSignal.timeout(300_000),
        }, resolve)
        req.on("error", reject)
      })
      const sent = body ? pipeline(body, req) : Promise.resolve(req.end())
      const [res] = await Promise.all([incoming, sent])
      const responseHeaders = new Headers()
      for (const [key, value] of Object.entries(res.headers)) {
        if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value)
      }
      const empty = method === "HEAD" || [204, 304].includes(res.statusCode!)
      if (empty) res.resume()
      return new Response(empty ? null : Readable.toWeb(res, { strategy: {
        highWaterMark: 64 * 1024, size: chunk => chunk.byteLength,
      } }) as ReadableStream<Uint8Array>, { status: res.statusCode!, headers: responseHeaders })
    } catch (err) { throw pta.unavailable(err) }
  }
  async put(key: string, body: Readable, size: number, mime: string) {
    const r = await this.request("PUT", key, { "content-length": String(size), "content-type": mime }, body)
    await r.body?.cancel()
    if (!r.ok) throw pta.unavailable(new Error(`S3 PUT: ${r.status}`))
  }
  async copy(from: string, to: string) {
    const r = await this.request("PUT", to, { "x-amz-copy-source": `/${this.bucket}/${from}`, "content-length": "0" })
    const text = await r.text()
    if (!r.ok || text.includes("<Error>")) throw pta.unavailable(new Error(`S3 COPY: ${r.status}`))
  }
  async remove(key: string) {
    const r = await this.request("DELETE", key)
    await r.body?.cancel()
    if (!r.ok && r.status !== 404) throw pta.unavailable(new Error(`S3 DELETE: ${r.status}`))
  }
}

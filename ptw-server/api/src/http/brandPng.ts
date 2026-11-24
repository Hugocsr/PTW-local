import { pta } from "../errors/apiError.js"

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Accepts bounded PNG streams, with valid chunks/checksums and no trailing/polyglot payload. */
export function brandPng(base64: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw pta.badRequest("Imagem PNG inválida")
  const b = Buffer.from(base64, "base64")
  if (b.length > 262144) throw pta.tooLarge()
  const invalid = () => { throw pta.badRequest("Use PNG válido de até 256 KiB e 2048 × 2048 pixels") }
  if (b.length < 45 || b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return invalid()
  let at = 8, image = false, end = false, header = false
  while (at + 12 <= b.length) {
    const size = b.readUInt32BE(at), type = b.toString("ascii", at + 4, at + 8)
    if (at + size + 12 > b.length || crc32(b.subarray(at + 4, at + size + 8)) !== b.readUInt32BE(at + size + 8)) return invalid()
    if (!header) {
      if (type !== "IHDR" || size !== 13) return invalid()
      const w = b.readUInt32BE(at + 8), h = b.readUInt32BE(at + 12)
      if (!w || !h || w > 2048 || h > 2048) return invalid()
      header = true
    } else if (type === "IHDR") return invalid()
    if (type === "IDAT") image = true
    at += size + 12
    if (type === "IEND") { end = size === 0 && at === b.length; break }
  }
  if (!end || !image) return invalid()
  return b
}

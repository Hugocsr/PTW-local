import jsQR from "jsqr"

/** The asset tag is 1–64 characters (the registry's rule). */
const CODE_MAX = 64

/**
 * SPEC 019: the asset tag a scanned text carries. Two forms are read: the plain tag (what the label prints) and a
 * system link ending in `#ativo/<tag>`. Any other link (a PT's QR, a web site) and multi-line text are not an asset.
 */
export function parseAssetCode(text: string): string | null {
  const t = text.trim()
  if (!t || /[\r\n]/.test(t)) return null
  const link = /^https?:\/\/\S+#ativo\/(.+)$/i.exec(t)
  if (link) {
    try { return clean(decodeURIComponent(link[1]!)) } catch { return null }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null
  return clean(t)
}

function clean(s: string): string | null {
  const c = s.trim()
  return c.length >= 1 && c.length <= CODE_MAX ? c : null
}

export interface QrDecoder { decode(video: HTMLVideoElement): Promise<string | null> }

interface NativeDetector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type NativeCtor = new (opts: { formats: string[] }) => NativeDetector

/** The browser's own detector where it exists (Chrome, Edge, Android); jsQR on a canvas everywhere else. */
export function makeDecoder(): QrDecoder {
  const Native = (globalThis as { BarcodeDetector?: NativeCtor }).BarcodeDetector
  let native: NativeDetector | null = null
  try { native = Native ? new Native({ formats: ["qr_code"] }) : null } catch { native = null }
  const canvas = document.createElement("canvas")
  return {
    async decode(video) {
      if (!video.videoWidth) return null
      if (native) {
        try { return (await native.detect(video))[0]?.rawValue ?? null } catch { /* falls back below */ }
      }
      const scale = Math.min(1, 640 / video.videoWidth)
      canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null
    },
  }
}

/** Why the camera did not open, in words for the person. */
export function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ""
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "A câmera só abre em conexão segura (https)."
  if (name === "NotAllowedError" || name === "SecurityError") return "O acesso à câmera foi negado. Libere a câmera nas permissões do navegador."
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Este dispositivo não tem câmera disponível."
  return "Não foi possível usar a câmera."
}

import qrcode from "qrcode-generator"

/**
 * A QR code as one SVG path on a square grid of `size` modules (quiet zone included). Level M: a printed
 * sheet that got dirty or folded still reads.
 */
export function qrPath(text: string, quiet = 2): { d: string; size: number } {
  const qr = qrcode(0, "M")
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ""
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  return { d, size: n + quiet * 2 }
}

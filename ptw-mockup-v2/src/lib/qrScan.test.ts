import jsQR from "jsqr"
import qrcode from "qrcode-generator"
import { describe, expect, it } from "vitest"

/** SPEC 019: the label the app prints is read back by the reader the app ships. */
describe("QR do ativo", () => {
  it("o QR gerado com o código é lido de volta com o mesmo texto", () => {
    const q = qrcode(0, "M"); q.addData("CCM-L2-01"); q.make()
    const n = q.getModuleCount(), quiet = 4, px = 6, size = (n + quiet * 2) * px
    const data = new Uint8ClampedArray(size * size * 4).fill(255)
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c))
      for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) { const i = (((r + quiet) * px + y) * size + (c + quiet) * px + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
    expect(jsQR(data, size, size)?.data).toBe("CCM-L2-01")
  })
})

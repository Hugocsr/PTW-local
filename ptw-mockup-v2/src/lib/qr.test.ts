import { describe, expect, it } from "vitest"
import { qrPath } from "./qr"

describe("qrPath", () => {
  it("draws a square code with the quiet zone, the same for the same text", () => {
    const a = qrPath("https://ptw.planta.local/#pt/01a1cab9")
    expect(a.size).toBeGreaterThanOrEqual(21 + 4)
    expect(a.d.startsWith("M")).toBe(true)
    expect(qrPath("https://ptw.planta.local/#pt/01a1cab9")).toEqual(a)
    expect(qrPath("outra coisa").d).not.toBe(a.d)
    // The three finder patterns: a dark module at each of the three corners (after the quiet zone).
    const n = a.size - 4
    for (const [c, r] of [[0, 0], [n - 1, 0], [0, n - 1]]) expect(a.d).toContain(`M${c + 2} ${r + 2}h1v1h-1z`)
  })
})

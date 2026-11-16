import { describe, expect, it } from "vitest"
import { windowLeft } from "./permitView"

const W = { windowStart: "2026-11-11T08:00:00-03:00", windowEnd: "2026-11-11T16:00:00-03:00" }
const at = (hhmmss: string) => `2026-11-11T${hhmmss}-03:00`

describe("windowLeft (tom do medidor da janela)", () => {
  it("ok com mais de 60 min e mais de 15 % da janela", () => {
    const w = windowLeft(W, at("10:00:00"))!
    expect(w.tone).toBe("ok")
    expect(w.minutes).toBe(360)
    expect(w.fraction).toBeCloseTo(0.75)
  })
  it("atenção com 60 min ou menos", () => {
    expect(windowLeft(W, at("15:00:00"))!.tone).toBe("attention")
    expect(windowLeft(W, at("15:00:01"))!.tone).toBe("attention")
    expect(windowLeft(W, at("14:59:59"))!.tone).toBe("attention") // 15 % de 8 h = 72 min
  })
  it("atenção com 15 % ou menos mesmo com mais de 60 min", () => {
    const long = { windowStart: "2026-11-11T00:00:00-03:00", windowEnd: "2026-11-14T00:00:00-03:00" } // 72 h; 15 % = 10,8 h
    expect(windowLeft(long, "2026-11-13T15:00:00-03:00")!.tone).toBe("attention") // 9 h left = 12,5 %
    expect(windowLeft(long, "2026-11-13T10:00:00-03:00")!.tone).toBe("ok") // 14 h left = 19 %
  })
  it("o limite de 15 % é inclusivo; o de 60 min também", () => {
    expect(windowLeft(W, at("14:48:00"))!.tone).toBe("attention") // 72 min = 15 %
    expect(windowLeft(W, at("14:47:00"))!.tone).toBe("ok")
    expect(windowLeft(W, at("15:00:00"))!.tone).toBe("attention") // 60 min
  })
  it("no instante do fim ainda não venceu (fim fechado, como workRelease); depois, parar", () => {
    const end = windowLeft(W, at("16:00:00"))!
    expect(end.tone).toBe("attention")
    expect(end.minutes).toBe(0)
    const over = windowLeft(W, at("16:00:01"))!
    expect(over.tone).toBe("stop")
    expect(over.minutes).toBe(0)
    expect(over.fraction).toBe(0)
  })
  it("arredonda os minutos para cima e limita a fração", () => {
    expect(windowLeft(W, at("15:59:30"))!.minutes).toBe(1)
    expect(windowLeft(W, at("07:00:00"))!.fraction).toBe(1)
  })
  it("janela sem duração ou instante ilegível: sem medidor", () => {
    expect(windowLeft({ windowStart: W.windowEnd, windowEnd: W.windowEnd }, at("10:00:00"))).toBeNull()
    expect(windowLeft(W, "ontem")).toBeNull()
  })
})

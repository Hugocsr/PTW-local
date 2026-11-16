import { describe, expect, it, vi } from "vitest"
import { observeHumanActivity } from "./activity"

describe("atividade humana", () => {
  it("ignora eventos programáticos, recebe ponteiro/teclado confiáveis e remove os ouvintes", () => {
    const listeners = new Map<string, EventListener>()
    const target = {
      addEventListener: vi.fn((name: string, listener: EventListener) => { listeners.set(name, listener) }),
      removeEventListener: vi.fn((name: string) => { listeners.delete(name) }),
    }
    const report = vi.fn()
    const stop = observeHumanActivity(target as unknown as Document, report)
    listeners.get("pointerdown")!({ isTrusted: false } as Event)
    listeners.get("keydown")!({ isTrusted: false } as Event)
    expect(report).not.toHaveBeenCalled()
    listeners.get("pointerdown")!({ isTrusted: true } as Event)
    listeners.get("keydown")!({ isTrusted: true } as Event)
    expect(report).toHaveBeenCalledTimes(2)
    stop()
    expect(listeners.size).toBe(0)
  })
})

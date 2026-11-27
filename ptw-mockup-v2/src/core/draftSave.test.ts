import { describe, expect, it } from "vitest"
import { draftMissing, draftReady, draftSnapshot, hasUnsaved, saveLabel, type DraftFields } from "./draftSave"

const base: DraftFields = { templateId: "t", locationId: "l", scope: "Trocar válvula", windowStart: "2026-11-27T08:00:00-03:00", windowEnd: "2026-11-27T10:00:00-03:00", assetIds: ["a2", "a1"], team: { r1: ["p2", "p1"], r2: [] } }

describe("SPEC 014: rascunho salvo sozinho", () => {
  it("só começa com modelo, local e serviço (o que o banco exige)", () => {
    expect(draftReady(base)).toBe(true)
    expect(draftReady({ ...base, templateId: "" })).toBe(false)
    expect(draftReady({ ...base, locationId: "" })).toBe(false)
    expect(draftReady({ ...base, scope: "   " })).toBe(false)
    expect(draftMissing({ templateId: "", locationId: "", scope: "" })).toBe("o modelo")
    expect(draftMissing({ templateId: "t", locationId: "", scope: "" })).toBe("o local")
    expect(draftMissing({ templateId: "t", locationId: "l", scope: " " })).toBe("o serviço")
    expect(draftMissing(base)).toBe("")
  })

  it("o retrato ignora a ordem dos ativos e da equipe, os espaços do serviço e os cargos vazios", () => {
    const same = { ...base, scope: "  Trocar válvula ", assetIds: ["a1", "a2"], team: { r1: ["p1", "p2"] } }
    expect(draftSnapshot(same)).toBe(draftSnapshot(base))
    expect(draftSnapshot({ ...base, windowEnd: "2026-11-27T11:00:00-03:00" })).not.toBe(draftSnapshot(base))
    expect(draftSnapshot({ ...base, assetIds: ["a1"] })).not.toBe(draftSnapshot(base))
    expect(draftSnapshot({ ...base, team: { r1: ["p1"] } })).not.toBe(draftSnapshot(base))
  })

  it("o indicador diz o que acontece, curto", () => {
    expect(saveLabel({ kind: "saved", at: "14:03" })).toBe("Salvo às 14:03")
    expect(saveLabel({ kind: "saving" })).toBe("Salvando…")
    expect(saveLabel({ kind: "waiting" })).toBe("Alterações pendentes…")
    expect(saveLabel({ kind: "offline" })).toContain("Sem conexão")
    expect(saveLabel({ kind: "error", message: "PTA06" })).toBe("Não foi possível salvar: PTA06")
    expect(saveLabel({ kind: "incomplete" }, "o local")).toBe("Escolha o local para o rascunho começar a ser salvo")
    expect(saveLabel({ kind: "idle" })).toBe("")
  })

  it("sair perde algo quando há pendência, falha, ou nada foi salvo e a pessoa digitou", () => {
    expect(hasUnsaved("saved", true)).toBe(false)
    expect(hasUnsaved("idle", false)).toBe(false)
    expect(hasUnsaved("waiting", false)).toBe(true)
    expect(hasUnsaved("saving", false)).toBe(true)
    expect(hasUnsaved("error", false)).toBe(true)
    expect(hasUnsaved("offline", false)).toBe(true)
    expect(hasUnsaved("incomplete", false)).toBe(false)
    expect(hasUnsaved("incomplete", true)).toBe(true)
  })
})

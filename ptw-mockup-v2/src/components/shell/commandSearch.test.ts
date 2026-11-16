import { describe, expect, it } from "vitest"
import { highlight, matches } from "./commandSearch"

describe("command palette search", () => {
  it("ignores case and accents, needs every word", () => {
    expect(matches("Manutenção da bomba P-101", "manutencao bomba")).toBe(true)
    expect(matches("Manutenção da bomba P-101", "manutencao valvula")).toBe(false)
    expect(matches("qualquer", "  ")).toBe(false)
  })
  it("splits into plain and emphasised pieces", () => {
    expect(highlight("Bomba P-101", "bom")).toEqual(["", "Bom", "ba P-101"])
    expect(highlight("Bomba", "x")).toEqual(["Bomba"])
  })
})

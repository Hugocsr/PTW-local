import { describe, expect, it } from "vitest"
import type { FormItem } from "@/registry/types"
import { formBlocks, joinWhens, noticeForChoice, noticeParts, repeatsTitle } from "./formLayout"

const aviso = (id: string, label: string, text = `${label}: texto · prazo máximo: 1 DIA`): FormItem => ({ id, kind: "aviso", label, required: false, text })
const texto = (id: string): FormItem => ({ id, kind: "texto", label: id, required: true, long: false })

describe("formBlocks", () => {
  it("folds a run of 3+ named notices into one reference block", () => {
    const b = formBlocks([aviso("a5", "Classe 5"), aviso("a4", "Classe 4"), aviso("a3", "Classe 3"), texto("t")])
    expect(b.map((x) => x.kind)).toEqual(["notices", "item"])
    expect(b[0].kind === "notices" && b[0].items.map((i) => i.id)).toEqual(["a5", "a4", "a3"])
  })
  it("keeps short runs and generic notices as they are (declarations stay in sight)", () => {
    expect(formBlocks([aviso("a", "Classe 5"), aviso("b", "Classe 4"), texto("t")]).map((x) => x.kind)).toEqual(["item", "item", "item"])
    expect(formBlocks([aviso("a", "Aviso"), aviso("b", "Aviso"), aviso("c", "Aviso")]).map((x) => x.kind)).toEqual(["item", "item", "item"])
  })
  it("does not fold notices that share a label", () => {
    expect(formBlocks([aviso("a", "Nota"), aviso("b", "Nota"), aviso("c", "Outra")]).every((x) => x.kind === "item")).toBe(true)
  })
})

describe("noticeForChoice / noticeParts", () => {
  const items = [aviso("a5", "Classe 5"), aviso("a4", "Classe 4", "Classe 4: Proteção de pessoas · aprovação mínima: Gerente · prazo máximo: 01 DIA"), texto("t")]
  it("finds the notice named like the chosen option, ignoring case and accents", () => {
    expect(noticeForChoice(items, "classe 4")?.id).toBe("a4")
    expect(noticeForChoice(items, "Classe 9")).toBeUndefined()
  })
  it("splits the text and drops the repeated label", () => {
    expect(noticeParts(items[1] as never)).toEqual(["Proteção de pessoas", "aprovação mínima: Gerente", "prazo máximo: 01 DIA"])
  })
})

describe("repeatsTitle / joinWhens", () => {
  it("spots an item titled like its section", () => {
    expect(repeatsTitle({ title: "Itens de verificação" }, { label: "Itens de  verificação" })).toBe(true)
    expect(repeatsTitle({ title: "" }, { label: "" })).toBe(false)
  })
  it("merges 'só para' phrases into one", () => {
    expect(joinWhens(["só para Classe 4", "só para Classe 3", "só para Classe 2 ou Classe 1"])).toBe("só para Classe 4, Classe 3, Classe 2 ou Classe 1")
    expect(joinWhens(["só para A"])).toBe("só para A")
    expect(joinWhens(["só quando “X” for Não", "só para A"])).toBe("só quando “X” for Não; só para A")
  })
})

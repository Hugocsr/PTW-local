import { describe, expect, it } from "vitest"
import { permitTags } from "./permitTags"

const ids = (state: Parameters<typeof permitTags>[0], o: Partial<Parameters<typeof permitTags>[1]> = {}) =>
  permitTags(state, { released: false, serverDown: false, compact: false, titleIsState: true, ...o }).map((t) => t.id)

describe("etiquetas do estado da PT (SPEC 008)", () => {
  it("Encerrada: estado e ciclo concluído, sem 'Trabalho não liberado'", () => {
    expect(ids("encerrada")).toEqual(["estado", "ciclo"])
  })
  it("rascunho, devolvida e cancelada seguem com 'Trabalho não liberado'", () => {
    for (const s of ["rascunho", "em_analise", "devolvida", "emitida", "suspensa", "entregue", "expirada", "cancelada"] as const) expect(ids(s)).toEqual(["nao_liberado"])
  })
  it("liberada: nenhuma etiqueta de 'não liberado'", () => { expect(ids("ativa", { released: true })).toEqual([]) })
  it("título diferente do estado: a etiqueta do estado entra primeiro", () => { expect(ids("ativa", { titleIsState: false })).toEqual(["estado", "nao_liberado"]) })
  it("ativa fora da janela: etiqueta do estado neutra", () => {
    expect(permitTags("ativa", { released: false, serverDown: false, compact: false, titleIsState: false })[0].tone).toBe("neutral")
  })
  it("sem servidor: só 'Trabalho não liberado' (compacto não mostra)", () => {
    expect(ids("ativa", { serverDown: true, titleIsState: false })).toEqual(["nao_liberado"])
    expect(ids("ativa", { serverDown: true, compact: true })).toEqual([])
  })
})

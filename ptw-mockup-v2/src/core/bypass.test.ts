import { describe, expect, it } from "vitest"
import { bypassFacts, bypassGroup } from "./bypass"
import type { FormSpec, OptionList } from "../registry/types"

describe("Desabilitados agora", () => {
  it("só entra PT de versão que não prende o equipamento", () => {
    expect(bypassGroup({ state: "ativa", holdReason: null }, true)).toBeNull()
    expect(bypassGroup({ state: "ativa", holdReason: null }, false)).toBe("vigor")
  })
  it("cada estado no seu grupo; rascunho e finalizadas ficam fora", () => {
    const g = (state: Parameters<typeof bypassGroup>[0]["state"], holdReason: string | null = null) => bypassGroup({ state, holdReason }, false)
    expect(g("em_analise")).toBe("aprovacao")
    expect(g("devolvida")).toBe("aprovacao")
    expect(g("emitida")).toBe("aprovacao")
    expect(g("ativa", "Condição insegura")).toBe("reabilitar")
    expect(g("suspensa")).toBe("reabilitar")
    expect(g("entregue")).toBe("reabilitar")
    expect(g("expirada")).toBe("reabilitar")
    expect(g("rascunho")).toBeNull()
    expect(g("encerrada")).toBeNull()
    expect(g("cancelada")).toBeNull()
  })
  it("fatos: escolha única e texto curto respondidos, na ordem do formulário", () => {
    const lists: OptionList[] = [{ id: "L", name: "Intertravamentos", revision: 1, updatedAt: "", items: [{ id: "i1", label: "IT-CCM-01", active: true }] }]
    const form: FormSpec = { sections: [{ id: "s", title: "Pedido", items: [
      { id: "tag", kind: "marcacao", label: "Tag", required: true, options: [], listId: "L", multiple: false, other: false },
      { id: "classe", kind: "marcacao", label: "Classe", required: true, options: [{ id: "c2", label: "Classe 2" }], multiple: false, other: false },
      { id: "motivo", kind: "texto", label: "Motivo", required: true, long: true },
      { id: "os", kind: "texto", label: "Ordem de serviço", required: false, long: false },
      { id: "vazio", kind: "texto", label: "Sem resposta", required: false, long: false },
    ] }] }
    const answers = { tag: { t: "marcacao" as const, ids: ["i1"] }, classe: { t: "marcacao" as const, ids: ["c2"] }, motivo: { t: "texto" as const, v: "longo" }, os: { t: "texto" as const, v: " OS 1 " } }
    expect(bypassFacts(form, answers, lists)).toEqual([{ label: "Tag", value: "IT-CCM-01" }, { label: "Classe", value: "Classe 2" }, { label: "Ordem de serviço", value: "OS 1" }])
    expect(bypassFacts(form, answers, lists, 1)).toHaveLength(1)
    expect(bypassFacts(undefined, answers, lists)).toEqual([])
  })
})

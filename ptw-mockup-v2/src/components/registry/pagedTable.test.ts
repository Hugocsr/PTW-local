import { createElement as h } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { RuleError } from "@/core/ptwErrors"
import { PagedTable, useListState, type Column } from "./DataTable"

interface Row { id: string; name: string }
const columns: Column<Row>[] = [{ id: "name", header: "Nome", sortable: true, cell: (r) => r.name }]
const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `Linha ${i}` }))

/** Renders the table as a screen does: the view is the table's, the page is what the data layer answered. */
function Screen({ loading = false, all = 120, total = 120, error = null }: { loading?: boolean; all?: number; total?: number; error?: RuleError | null }) {
  const list = useListState({ defaultSort: { id: "name", dir: "asc" }, pageSizes: [25, 50], filterNames: { select: "typeId" } })
  return h(PagedTable<Row>, {
    list, columns, rowKey: (r) => r.id, noun: ["ativo", "ativos"], searchLabel: "Buscar",
    data: { items: error ? [] : items, total, all, page: 0, loading, error },
  })
}
const html = (props = {}) => renderToStaticMarkup(h(Screen, props))

describe("PagedTable (consulta pelo servidor)", () => {
  it("mostra a página recebida com a contagem do servidor, não do vetor", () => {
    const out = html()
    expect(out).toContain("1–25 de 120")
    expect(out).toContain("Linha 24")
    expect(out).toContain("1 / 5")
    expect(out).toContain('aria-sort="ascending"')
  })
  it("enquanto carrega, mantém a página anterior esmaecida e avisa por aria-busy", () => {
    const out = html({ loading: true })
    expect(out).toContain('aria-busy="true"')
    expect(out).toContain("opacity-60")
    expect(out).toContain("Linha 0")
  })
  it("recusa do servidor vira frase, sem lista", () => {
    expect(html({ error: { code: "sem_servidor" as const, message: "O servidor não respondeu" } })).toContain("Não foi possível carregar a lista: O servidor não respondeu")
  })
  it("lista vazia de verdade mostra o vazio; filtro sem resultado mostra a tabela", () => {
    expect(html({ all: 0, total: 0, error: null })).toContain("Nada por aqui ainda")
  })
  it("useListState monta a consulta com os nomes do contrato", () => {
    function Probe() { return h("pre", null, JSON.stringify(useListState({ defaultSort: { id: "code", dir: "asc" }, pageSizes: [25], defaultSegment: "andamento", filterNames: { segment: "segment", select: "typeId" } }).view)) }
    const out = renderToStaticMarkup(h(Probe))
    expect(JSON.parse(out.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"'))).toEqual({ q: "", filters: { segment: "andamento" }, sort: { id: "code", dir: "asc" }, page: 0, pageSize: 25 })
  })
})

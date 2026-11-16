import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { auditArea, auditGroup, eventIso, sha256Hex, verifyChain, type AuditEvent, type AuditGroup } from "@/core/audit"
import { boardRows, type BoardRow } from "@/core/board"
import { byId } from "@/core/indexes"
import { isFinalState, stateRank } from "@/core/permitView"
import { dayOf } from "@/core/time"
import { DataTable, type Column } from "@/components/registry/DataTable"
import { exemplo } from "@/demo/exemplo"
import type { Permit } from "@/permit/types"
import type { Asset } from "@/registry/types"
import { createMemoryPort } from "./memory"
import { assetLocal, assetsUnder, auditPageOf, auditRows, boardLocal, pageOf } from "./memory/query"
import { runAsUndo, type DataPort, type ListView } from "./port"

/** The last four characters of the sample's fixed ids. */
const permitOf = (port: DataPort, tail: string): Permit => port.permits.get().permits.find((p) => p.id.endsWith(tail))!
const personOf = (name: string) => exemplo.registry.people.find((p) => p.name === name)!.id
const slotsOf = (p: Permit) => byId(exemplo.registry.templates, p.templateId)!.versions.find((v) => v.id === p.versionId)!.stages.flatMap((s) => s.slots.map((sl) => sl.id))

/** The first person and slot the rules accept for a signature of this PT (refusals on the way are recorded, as in the app). */
function signSomehow(port: DataPort, permitId: string) {
  const p = port.permits.get().permits.find((x) => x.id === permitId)!
  for (const person of exemplo.registry.people) for (const slotId of slotsOf(p)) {
    const act = port.permits.act({ kind: "sign", permitId, slotId, personId: person.id })
    if (!act.refused) return { act, personId: person.id, slotId }
  }
  throw new Error("ninguém pôde assinar")
}

describe("camada de dados em memória", () => {
  it("começa exatamente no cenário", () => {
    const port = createMemoryPort(exemplo)
    expect(port.mode).toBe("memoria")
    expect(port.whole).toBe(true)
    expect(port.registry.get()).toBe(exemplo.registry)
    expect(port.permits.get()).toBe(exemplo.permits)
    expect(port.audit.get()).toBe(exemplo.audit)
    expect(port.session.get()).toMatchObject({ status: "aberta", personId: exemplo.defaultPerson, now: exemplo.start, today: exemplo.start.slice(0, 10), serverDown: false, isAuditor: false })
  })

  it("um ato aceito muda a PT, entra na trilha e a promessa já vem resolvida com a mesma resposta", async () => {
    const port = createMemoryPort(exemplo)
    const before = permitOf(port, "000c")
    expect(before.state).toBe("em_analise")
    let told = 0
    const off = port.permits.subscribe(() => { told++ })
    const { act, personId } = signSomehow(port, before.id)
    off()
    expect(act.refused).toBeNull()
    expect(await act.done).toBeNull()
    expect(told).toBeGreaterThan(0)
    const sigs = port.permits.get().signatures.filter((s) => s.permitId === before.id && s.personId === personId && !s.voidedAt)
    expect(sigs.length).toBeGreaterThan(exemplo.permits.signatures.filter((s) => s.permitId === before.id && s.personId === personId && !s.voidedAt).length)
    const log = port.audit.get()
    expect(log.length).toBeGreaterThan(exemplo.audit.length)
    expect(log.some((e) => e.seq > exemplo.audit.length && e.action === "pt.assinatura" && e.ok && e.actor === personId)).toBe(true)
    expect(verifyChain(log).ok).toBe(true)
    // The scenario itself is never written.
    expect(exemplo.permits.permits.find((p) => p.id === before.id)).toBe(before)
  })

  it("um ato recusado não muda nada, fica na trilha como negado e a promessa traz a mesma recusa", async () => {
    const port = createMemoryPort(exemplo)
    const p = permitOf(port, "000c")
    const data = port.permits.get()
    // The author never returns his own PT, and a return needs its reason.
    const act = port.permits.act({ kind: "refuse", permitId: p.id, personId: p.authorId, reason: "" })
    expect(act.refused).not.toBeNull()
    expect(await act.done).toBe(act.refused)
    expect(port.permits.get()).toBe(data)
    const last = port.audit.get().at(-1)!
    expect(last.ok).toBe(false)
    expect(last.permit).toBe(p.id)
    expect(verifyChain(port.audit.get()).ok).toBe(true)
  })

  it("servidor fora do ar trava o que salva; Parar continua e é registrado", () => {
    const port = createMemoryPort(exemplo)
    port.session.setServerDown!(true)
    expect(port.session.get().serverDown).toBe(true)
    const logLen = port.audit.get().length
    const analise = permitOf(port, "000c")
    const data = port.permits.get()
    for (const person of exemplo.registry.people) for (const slotId of slotsOf(analise)) {
      expect(port.permits.act({ kind: "sign", permitId: analise.id, slotId, personId: person.id }).refused?.code).toBe("sem_servidor")
    }
    expect(port.registry.write({ kind: "addType", list: "assetTypes", label: "Tipo novo do teste" }).refused).toBeNull()
    expect(port.permits.get()).toBe(data)
    // Nothing reached the trail while the server is down (the registry write is recorded when it is back: it is not a stop).
    expect(port.audit.get().length).toBe(logLen)

    const ativa = permitOf(port, "000a")
    const stopper = exemplo.registry.people.find((person) => !port.permits.act({ kind: "stop", permitId: ativa.id, personId: person.id, reason: "Vazamento" }).refused)
    expect(stopper).toBeDefined()
    expect(permitOf(port, "000a").state).toBe("suspensa")
    expect(port.audit.get().length).toBeGreaterThan(logLen)
    expect(verifyChain(port.audit.get()).ok).toBe(true)
  })

  it("o relógio expira o que passou da janela, sem pessoa, e não expira com o servidor fora", () => {
    const port = createMemoryPort(exemplo)
    expect(permitOf(port, "000a").state).toBe("ativa")
    port.session.setServerDown!(true)
    port.session.advance!(6 * 60)
    expect(permitOf(port, "000a").state).toBe("ativa")
    port.session.setServerDown!(false)
    port.session.advance!(1)
    expect(port.session.get().now).toBe("2026-11-06T20:01:00-03:00")
    expect(permitOf(port, "000a").state).toBe("expirada")
    const ev = port.audit.get().filter((e) => e.permit === permitOf(port, "000a").id).at(-1)!
    expect(ev.actor).toBeNull()
    expect(ev.auth).toBe("sistema")
    expect(verifyChain(port.audit.get()).ok).toBe(true)
  })

  it("start() liga o relógio e devolve como parar; trocar de pessoa e restaurar passam pela sessão", () => {
    let resets = 0
    const port = createMemoryPort(exemplo, { onReset: () => { resets++ } })
    const stop = port.start()
    stop()
    expect(port.session.get().now).toBe(exemplo.start)
    port.session.setPerson(personOf("Marina Costa"))
    expect(port.session.get().personId).toBe(personOf("Marina Costa"))
    expect(port.audit.ctx()).toMatchObject({ actorId: personOf("Marina Costa"), at: exemplo.start, auth: "sessao", reason: null })
    port.session.reset!()
    expect(resets).toBe(1)
  })

  it("cadastro: escrita aceita muda o estado e a trilha; recusada não muda e fica negada; Desfazer sai marcado", async () => {
    const port = createMemoryPort(exemplo)
    const before = port.registry.get()
    const ok = port.registry.write({ kind: "addType", list: "assetTypes", label: "Tipo novo do teste" })
    expect(ok.refused).toBeNull()
    expect(await ok.done).toBeNull()
    const after = port.registry.get()
    expect(after.assetTypes.length).toBe(before.assetTypes.length + 1)
    expect(port.audit.get().length).toBe(exemplo.audit.length + 1)

    const dup = port.registry.write({ kind: "addType", list: "assetTypes", label: "Tipo novo do teste" })
    expect(dup.refused?.code).toBe("23505")
    expect(await dup.done).toBe(dup.refused)
    expect(port.registry.get()).toBe(after)
    expect(port.audit.get().at(-1)!.ok).toBe(false)

    const added = after.assetTypes.at(-1)!
    runAsUndo(() => { expect(port.registry.write({ kind: "removeType", list: "assetTypes", id: added.id }).refused).toBeNull() })
    const undo = port.audit.get().at(-1)!
    expect(undo.action.endsWith(".desfeito")).toBe(true)
    expect(undo.reason).toBe("Desfazer")
    expect(port.audit.ctx().reason).toBeNull()
    expect(verifyChain(port.audit.get()).ok).toBe(true)
  })

  it("a leitura repetida em seguida é uma leitura só", () => {
    const port = createMemoryPort(exemplo)
    const p = permitOf(port, "000a")
    const read = (): Parameters<DataPort["audit"]["record"]>[0] => [{ ...port.audit.get()[0], at: port.audit.ctx().at, action: "acesso.pt.aberta", actor: port.audit.ctx().actorId, permit: p.id, text: "Abriu a PT", data: {}, ok: true }]
    const n = port.audit.get().length
    port.audit.record(read())
    port.audit.record(read())
    expect(port.audit.get().length).toBe(n + 1)
  })

  it("exportação: JSONL e manifesto conferem com o que fica na trilha", async () => {
    const port = createMemoryPort(exemplo)
    const out = await port.audit.exportAll("Auditoria interna")
    if ("code" in out) throw new Error(out.message)
    expect(out.events).toBe(exemplo.audit.length)
    expect(out.jsonl.split("\n").length - 1).toBe(exemplo.audit.length)
    const note = port.audit.get().at(-1)!
    expect(note.action).toBe("acesso.exportacao")
    expect(note.text).toBe("Exportou: Auditoria interna")
    expect(note.data).toMatchObject({ motivo: "Auditoria interna", arquivo_sha256: sha256Hex(new TextEncoder().encode(out.jsonl)), manifesto_sha256: sha256Hex(out.manifest) })
    expect(JSON.parse(out.manifest)).toMatchObject({ formato: "ptw-auditoria/2", eventos: exemplo.audit.length, motivo: "Auditoria interna" })
    expect(await port.audit.verify()).toMatchObject({ ok: true, count: exemplo.audit.length + 1 })
  })

  it("carrega uma PT pelo id ou pelo número", async () => {
    const port = createMemoryPort(exemplo)
    const p = permitOf(port, "000a")
    expect(await port.permits.load(p.id)).toBe(p)
    expect(await port.permits.load(p.number!)).toBe(p)
    expect(await port.permits.load("nada")).toBeNull()
  })
})

/* ---------- the lists: same rows, same order as the DataTable ---------- */

/** The ids of the rows a `DataTable` shows on its first render with these props. */
function tableIds<T>(props: Omit<Parameters<typeof DataTable<T>>[0], "columns" | "searchLabel" | "noun"> & { sorts: Record<string, (a: T, b: T) => number> }): string[] {
  const { sorts, ...rest } = props
  const columns: Column<T>[] = [
    { id: "k", header: "k", cell: (r) => createElement("i", { "data-k": rest.rowKey(r) }) },
    ...Object.entries(sorts).map(([id, sort]): Column<T> => ({ id, header: id, sort, cell: () => null })),
  ]
  const html = renderToStaticMarkup(createElement(DataTable<T>, { ...rest, columns, searchLabel: "Buscar", noun: ["linha", "linhas"] }))
  return [...html.matchAll(/data-k="([^"]+)"/g)].map((m) => m[1])
}

describe("consultas em memória = DataTable de hoje (cenário exemplo)", () => {
  const { registry, permits } = exemplo
  const marina = personOf("Marina Costa")
  const rowsFor = (personId: string) => boardRows({ permits: permits.permits, signatures: permits.signatures, people: registry.people, locations: registry.locations, templates: registry.templates, personId, today: exemplo.start.slice(0, 10), now: exemplo.start })

  // The Quadro's table as `QuadroView` builds it today (segments, comparators, sizes), by the column ids of the screen.
  const SEGMENTS: Record<string, (r: BoardRow) => boolean> = {
    minhas: (r) => r.mine,
    andamento: (r) => !isFinalState(r.p.state) && r.p.state !== "rascunho",
    preparacao: (r) => ["rascunho", "em_analise", "devolvida", "emitida"].includes(r.p.state),
    campo: (r) => ["ativa", "suspensa", "entregue"].includes(r.p.state),
    finalizadas: (r) => isFinalState(r.p.state),
  }
  const name = (p: Permit) => p.number ?? "PT sem número"
  const locCode = (p: Permit) => byId(registry.locations, p.locationId)?.code ?? p.locationId
  const collator = new Intl.Collator("pt-BR")
  const quadroSorts: Record<string, (a: BoardRow, b: BoardRow) => number> = {
    pt: (a, b) => (name(a.p) < name(b.p) ? -1 : name(a.p) > name(b.p) ? 1 : 0),
    state: (a, b) => stateRank(a.p.state) - stateRank(b.p.state),
    loc: (a, b) => collator.compare(locCode(a.p), locCode(b.p)),
    model: (a, b) => collator.compare(a.tpl.name, b.tpl.name),
    window: (a, b) => Date.parse(a.p.windowStart) - Date.parse(b.p.windowStart),
  }
  const CONTRACT: Record<string, string> = { pt: "number", state: "state", loc: "location", model: "template", window: "windowStart" }
  const quadroFilter = { label: "Filtrar por situação", options: Object.keys(SEGMENTS).map((value) => ({ value, label: value })), test: (r: BoardRow, v: string) => SEGMENTS[v](r) }

  // Exhaustive cross-product over the fixture; allow the constrained Docker build time to complete it.
  it("Quadro: todo segmento × toda ordem × duas pessoas", { timeout: 30_000 }, () => {
    let compared = 0
    for (const personId of [exemplo.defaultPerson, marina]) {
      const rows = rowsFor(personId)
      const local = boardLocal(registry.assets, registry.locations)
      for (const segment of [undefined, ...Object.keys(SEGMENTS)]) for (const col of [null, ...Object.keys(quadroSorts)]) for (const dir of ["asc", "desc"] as const) for (const size of [25, 3]) {
        const want = tableIds<BoardRow>({
          rows, rowKey: (r) => r.p.id, searchText: local.searchText, filter: quadroFilter, sorts: quadroSorts,
          defaultSegment: segment, defaultSort: col ? { id: col, dir } : undefined, pageSizes: [size],
        })
        const view: ListView = { q: "", filters: segment ? { segment } : {}, sort: col ? { id: CONTRACT[col], dir } : null, page: 0, pageSize: size }
        const got = pageOf(rows, view, local)
        expect(got.items.map((r) => r.p.id), `${segment} ${col} ${dir} ${size}`).toEqual(want)
        expect(got.all).toBe(rows.length)
        compared++
      }
    }
    expect(compared).toBe(2 * 6 * 6 * 2 * 2)
  })

  it("Quadro: a abertura da tela (Em andamento, por estado, 25 por página) e as páginas seguintes", () => {
    const rows = rowsFor(exemplo.defaultPerson)
    const local = boardLocal(registry.assets, registry.locations)
    const view: ListView = { q: "", filters: { segment: "andamento" }, sort: { id: "state", dir: "asc" }, page: 0, pageSize: 25 }
    const all = pageOf(rows, view, local)
    expect(all.items.length).toBeGreaterThan(3)
    expect(all.total).toBe(rows.filter(SEGMENTS.andamento).length)
    // Pages of 3 put together are the same list; a page past the end is the last one.
    const paged = [0, 1, 2, 3, 4].flatMap((page) => pageOf(rows, { ...view, page, pageSize: 3 }, local).items).slice(0, all.total)
    expect(paged.slice(0, all.total).map((r) => r.p.id).slice(0, all.items.length)).toEqual(all.items.map((r) => r.p.id).slice(0, paged.length))
    const lastPage = Math.ceil(all.total / 3) - 1
    expect(pageOf(rows, { ...view, page: 99, pageSize: 3 }, local)).toEqual(pageOf(rows, { ...view, page: lastPage, pageSize: 3 }, local))
    // Another person's draft is not on the board.
    expect(rowsFor(marina).some((r) => r.p.state === "rascunho")).toBe(false)
  })

  it("Quadro: a busca lê o mesmo texto da tela (número, ativo, local, escopo, próximo, modelo), sem caixa", () => {
    const rows = rowsFor(exemplo.defaultPerson)
    const local = boardLocal(registry.assets, registry.locations)
    const text = (r: BoardRow) => {
      const codes = r.p.assetIds.map((id) => byId(registry.assets, id)?.code ?? id)
      return [name(r.p), codes.length > 1 ? `${codes[0]} +${codes.length - 1}` : codes[0], locCode(r.p), r.p.scope, r.next, r.tpl.name].join(" ")
    }
    for (const r of rows) expect(local.searchText(r)).toBe(text(r))
    for (const q of ["00010", "  pt-un01 ", rows[0].tpl.name.slice(0, 5).toUpperCase(), rows[0].p.scope.slice(0, 6), "zzz não existe"]) {
      const want = rows.filter((r) => text(r).toLocaleLowerCase("pt-BR").includes(q.trim().toLocaleLowerCase("pt-BR"))).map((r) => r.p.id)
      expect(pageOf(rows, { q, sort: null, page: 0, pageSize: 100 }, local).items.map((r) => r.p.id), q).toEqual(want)
    }
  })

  it("Ativos: toda ordem × filtro de tipo, como a tabela de hoje", () => {
    const local = assetLocal(registry.locations)
    const sorts: Record<string, (a: Asset, b: Asset) => number> = {
      code: (a, b) => a.code.localeCompare(b.code, "pt-BR"),
      name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    }
    const typeFilter = { label: "Filtrar por tipo", options: registry.assetTypes.map((t) => ({ value: t.id, label: t.label })), test: (a: Asset, v: string) => a.typeId === v }
    for (const typeId of [undefined, ...registry.assetTypes.map((t) => t.id)]) for (const col of ["code", "name"]) for (const dir of ["asc", "desc"] as const) {
      // The table has no starting value for its select filter: the type is compared through the segment filter, which runs the same test.
      const want = tableIds<Asset>({ rows: registry.assets, rowKey: (a) => a.id, searchText: local.searchText, filter: typeFilter, defaultSegment: typeId, sorts, defaultSort: { id: col, dir }, pageSizes: [25] })
      const got = pageOf(registry.assets, { q: "", filters: typeId ? { typeId } : {}, sort: { id: col, dir }, page: 0, pageSize: 25 }, local)
      expect(got.items.map((a) => a.id), `${typeId} ${col} ${dir}`).toEqual(want)
    }
    // The screen's opening view: by tag, 25 per page, all 15 assets.
    expect(pageOf(registry.assets, { q: "", sort: { id: "code", dir: "asc" }, page: 0, pageSize: 25 }, local).total).toBe(registry.assets.length)
  })

  it("Ativos de um local: os do local e de tudo abaixo dele, na ordem do cadastro", () => {
    for (const loc of registry.locations) {
      const under = new Set<string>([loc.id])
      for (let grew = true; grew;) { grew = false; for (const l of registry.locations) if (l.parentId && under.has(l.parentId) && !under.has(l.id)) { under.add(l.id); grew = true } }
      const want = registry.assets.filter((a) => a.locationIds.some((x) => under.has(x))).map((a) => a.id)
      expect(assetsUnder(registry.assets, registry.locations, loc.id).map((a) => a.id)).toEqual(want)
      expect(pageOf(registry.assets, { q: "", filters: { locationId: loc.id }, sort: null, page: 0, pageSize: 1000 }, assetLocal(registry.locations)).items.map((a) => a.id)).toEqual(want)
    }
  })

  it("Auditoria: o filtro da tela (grupos, PT, período, pessoa, área, busca), do mais novo para o mais antigo", () => {
    const log = exemplo.audit
    const today = exemplo.start.slice(0, 10)
    const text = (e: AuditEvent) => `${e.seq} ${e.text} ${e.action} ${e.ok ? "Registrado" : "Negado"} ${e.reason ?? ""}`
    // `AuditView`'s own filter, as it is written there (ALL = no filter; SYSTEM = events with no person).
    const screen = (f: { groups: AuditGroup[]; pt: string; from: string; person: string | null | undefined; area: string; q: string }) => {
      const needle = f.q.trim().toLocaleLowerCase("pt-BR")
      return log.filter((e) => {
        if (!f.groups.includes(auditGroup(e))) return false
        if (f.pt && e.permit !== f.pt) return false
        if (f.from && dayOf(eventIso(e)) < f.from) return false
        if (f.person !== undefined && (f.person === null ? e.actor !== null : e.actor !== f.person)) return false
        if (f.area && auditArea(e.action) !== f.area) return false
        if (needle && !text(e).toLocaleLowerCase("pt-BR").includes(needle)) return false
        return true
      }).reverse()
    }
    const pt = permits.permits.find((p) => p.id.endsWith("000a"))!.id
    const cases = [
      { groups: ["alteracao", "negada"] as AuditGroup[], pt: "", from: "", person: undefined, area: "", q: "" },
      { groups: ["alteracao", "negada", "acesso", "sessao"] as AuditGroup[], pt: "", from: "", person: undefined, area: "", q: "" },
      { groups: ["alteracao", "negada", "acesso"] as AuditGroup[], pt, from: "", person: undefined, area: "", q: "" },
      { groups: ["alteracao", "negada"] as AuditGroup[], pt: "", from: today, person: undefined, area: "", q: "" },
      { groups: ["alteracao", "negada"] as AuditGroup[], pt: "", from: "2026-10-31", person: marina, area: "pt", q: "" },
      { groups: ["alteracao", "negada", "acesso", "sessao"] as AuditGroup[], pt: "", from: "", person: null, area: "", q: "" },
      { groups: ["alteracao", "negada"] as AuditGroup[], pt: "", from: "", person: undefined, area: "cadastro", q: "  BOMBA " },
      { groups: ["negada"] as AuditGroup[], pt: "", from: "", person: undefined, area: "", q: "negado" },
    ]
    let some = 0
    for (const c of cases) {
      const want = screen(c)
      const got = auditRows(log, { groups: c.groups, permitId: c.pt || undefined, from: c.from || undefined, actorId: c.person, area: c.area || undefined, q: c.q }, text)
      expect(got.map((e) => e.seq), JSON.stringify(c)).toEqual(want.map((e) => e.seq))
      some += got.length
      // "Mostrar mais": the first 50, then the next page by cursor, put together are the list.
      const first = auditPageOf(got, undefined, 50)
      expect(first.items).toEqual(want.slice(0, 50))
      expect(first.matched).toBe(want.length)
      const second = first.nextBefore === null ? [] : auditPageOf(got, first.nextBefore, 500).items
      expect([...first.items, ...second]).toEqual(want)
    }
    expect(some).toBeGreaterThan(100)
  })

  it("as consultas da porta respondem com as mesmas funções", async () => {
    const port = createMemoryPort(exemplo)
    const view: ListView = { q: "", filters: { segment: "andamento" }, sort: { id: "state", dir: "asc" }, page: 0, pageSize: 25 }
    const board = await port.queries.permitBoard(view)
    expect(board.items.map((r) => r.p.id)).toEqual(pageOf(rowsFor(exemplo.defaultPerson), view, boardLocal(registry.assets, registry.locations)).items.map((r) => r.p.id))
    const assets = await port.queries.assets({ q: "bomba", sort: { id: "code", dir: "asc" }, page: 0, pageSize: 10 })
    expect(assets.all).toBe(registry.assets.length)
    expect(assets.items.every((a) => assetLocal(registry.locations).searchText(a).toLocaleLowerCase("pt-BR").includes("bomba"))).toBe(true)
    const audit = await port.queries.auditEvents({ groups: ["alteracao", "negada"], limit: 50 })
    expect(audit.items.length).toBe(50)
    expect(audit.items[0].seq).toBeGreaterThan(audit.items[49].seq)
    expect(audit.nextBefore).toBe(audit.items[49].seq)
    const facets = await port.queries.auditFacets()
    expect(facets.total).toBe(exemplo.audit.length)
    expect(facets.areas).toContain("pt")
    expect(port.queries.changed.get()).toBe(0)
  })
})

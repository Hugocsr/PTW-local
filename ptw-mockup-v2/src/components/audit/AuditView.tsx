import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRightIcon, CircleAlertIcon, CopyIcon, DownloadIcon, ShieldAlertIcon, ShieldCheckIcon, ShieldIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ListToolbar, Page, PageHeader, PageSection, PropertyList } from "@/components/shell/Page"
import { StatusBadge, TONE_TEXT } from "@/components/shell/Status"
import { TOGGLE_ON } from "@/components/registry/common"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAudit } from "@/audit/store"
import { usePermits } from "@/permit/store"
import { useAuditFacets, useAuditPage, useData } from "@/data/hooks"
import { useCell } from "@/data/context"
import {
  accessEvent, auditArea, eventHash, eventIso, fullDateTime, GENESIS,
  type AuditEvent, type ChainCheck, type AuditGroup, type AuthMethod, type Json, type JsonObject,
} from "@/core/audit"
import { dmHms } from "@/core/time"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { cn } from "@/lib/utils"
import { AREA_LABEL, auditLook, ENTITY_LABEL } from "./look"
import { useEventReader, type EventReader } from "./reader"

const GROUPS: { value: AuditGroup; label: string }[] = [
  { value: "alteracao", label: "Alterações" },
  { value: "acesso", label: "Acessos" },
  { value: "sessao", label: "Sessão e sistema" },
  { value: "negada", label: "Negadas" },
]
/** Reads would drown the list: changes and denials by default. */
const DEFAULT_GROUPS: AuditGroup[] = ["alteracao", "negada"]
const ALL = "all"
const PAGE = 50
const SYSTEM = "__sistema"

/** Where an event's record lives in the app, by table. */
const RECORD_HREF: Record<string, { href: string; label: string }> = {}
const link = (tables: string[], href: string, label: string) => tables.forEach((t) => { RECORD_HREF[t] = { href, label } })
link(["location"], "#locais", "Abrir Locais")
link(["asset", "asset_location", "asset_relation"], "#ativos", "Abrir Ativos")
link(["person", "person_role"], "#pessoas", "Abrir Usuários")
link(["type_def"], "#catalogos/tipos-local", "Abrir Catálogos")
link(["option_list", "option_item"], "#catalogos", "Abrir Catálogos")
link(["template", "template_version", "version_location_type", "version_asset_type", "version_work_type", "stage", "sign_slot", "separation"], "#modelos", "Abrir Modelos de PT")

const AUTH_LABEL: Record<AuthMethod, string> = { senha: "Senha", ldap: "LDAP", pin: "PIN", sessao: "Sessão", emergencia: "Emergência", servico: "Serviço", sistema: "Sistema" }
const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`
const dayShift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const obj = (x: Json | undefined): JsonObject | null => (x && typeof x === "object" && !Array.isArray(x) ? x : null)
/** Name kept in the row itself (a removed record keeps it in "de"). */
function nameInData(e: AuditEvent): string | undefined {
  for (const side of [obj(e.data.para), obj(e.data.de)]) {
    const n = side && (side.code ?? side.name ?? side.label ?? side.meaning ?? side.item_id ?? side.file_name)
    if (typeof n === "string") return n
  }
  return typeof e.data.arquivo === "string" ? e.data.arquivo : undefined
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Auditoria (model B, Lista‑detalhe): the unit's whole audit chain, newest first. Toolbar: search ·
 * groups (Alterações, Acessos, Sessão e sistema, Negadas) · período · pessoa · área. From xl the
 * event opens beside the table; below xl it is its own screen with "← Auditoria".
 * Events keep the database's raw data (ids, "de/para"); names are read now, like v_audit.
 * `permitFilter` comes from `#auditoria/pt/<id>` (the PT Histórico's "Ver na auditoria").
 */
export function AuditView({ permitFilter }: { permitFilter?: string }) {
  const { log, record, ctx } = useAudit()
  const { state } = useRegistry()
  const sim = useSim()
  const data = useData()
  const { whole } = data
  const { permits: cachedPermits } = usePermits()
  const facets = useAuditFacets()
  // Verified just after the screen paints (a long chain costs one SHA-256 per event the first time;
  // later checks only hash the new events): the badge says "Verificando" until then. With the server, it recomputes the chain there when something changed.
  const changed = useCell(data.queries.changed)
  const [verified, setVerified] = useState<{ key: unknown; check: ChainCheck } | null>(null)
  const chainKey = whole ? log : changed
  useEffect(() => {
    let live = true
    const t = setTimeout(() => { data.audit.verify().then((check) => { if (live) setVerified({ key: chainKey, check }) }, () => {}) }, 0)
    return () => { live = false; clearTimeout(t) }
  }, [chainKey, data.audit])
  const check = verified?.key === chainKey ? verified.check : null
  const reader = useEventReader()
  const { names, who, ptName } = reader

  const [q, setQ] = useState("")
  const [groups, setGroups] = useState<AuditGroup[]>(permitFilter ? ["alteracao", "negada", "acesso"] : DEFAULT_GROUPS)
  const [period, setPeriod] = useState(ALL)
  const [person, setPerson] = useState(ALL)
  const [area, setArea] = useState(ALL)
  const [pt, setPt] = useState(permitFilter ?? "")
  const [shown, setShown] = useState(PAGE)
  const [picked, setSelected] = useState<number | null>(null)
  const [opened, setOpened] = useState(false)
  const [exporting, setExporting] = useState(false)
  // With the server, the search waits for a pause in the typing before it asks.
  const [waited, setWaited] = useState(q)
  useEffect(() => {
    if (whole) return
    const t = setTimeout(() => setWaited(q), 300)
    return () => clearTimeout(t)
  }, [whole, q])

  const target = useCallback((e: AuditEvent): string => {
    if (e.permit) return ptName(e.permit)
    const byId = (e.entityId && names(e.entityId)) || (e.asset && names(e.asset))
    if (byId) return byId
    const inData = nameInData(e)
    if (inData) return inData
    // A relation between assets is named by its two ends.
    const rel = obj(e.data.para) ?? obj(e.data.de)
    if (rel && typeof rel.from_id === "string" && typeof rel.to_id === "string") return `${names(rel.from_id) ?? "ativo removido"} → ${names(rel.to_id) ?? "ativo removido"}`
    if (e.entity) return ENTITY_LABEL[e.entity] ?? e.entity
    if (e.action.startsWith("acesso.auditoria") || e.action.startsWith("acesso.exportacao")) return "Auditoria"
    return e.action.startsWith("sistema.") ? "Sistema" : "—"
  }, [names, ptName])

  // The search also finds an asset by its name (the row shows its tag).
  const assetById = useMemo(() => new Map(state.assets.map((a) => [a.id, a])), [state.assets])
  /** What the search reads of one event while the whole chain is in memory (the server searches the text, PT number and asset tag itself). */
  const text = useCallback((e: AuditEvent) => {
    const a = assetById.get(e.asset ?? e.entityId ?? "")
    return `${e.seq} ${reader.title(e)} ${e.action} ${target(e)} ${a ? `${a.code} ${a.name}` : ""} ${e.ok ? "Registrado" : "Negado"} ${who(e.actor)} ${e.reason ?? ""} ${reader.lines(e).join(" ")}`
  }, [reader, target, assetById, who])

  // The server asks for text only inside a period.
  const from = period === "hoje" ? sim.today : period === "7d" ? dayShift(sim.today, -6) : !whole && q.trim() ? dayShift(sim.today, -90) : undefined
  const asked = useMemo(() => ({
    groups, permitId: pt || undefined, from,
    actorId: person === ALL ? undefined : person === SYSTEM ? null : person,
    area: area === ALL ? undefined : area,
    q: whole ? q : waited,
    limit: whole ? shown : Math.min(shown, 500),
  }), [groups, pt, from, person, area, q, waited, whole, shown])
  const found = useAuditPage(asked, text)
  const rows = found.items
  const matched = found.matched ?? rows.length

  // Events name their PTs and assets: the ones this page shows are brought into the cache when the server has them.
  const tried = useRef(new Set<string>())
  useEffect(() => {
    if (whole) return
    const have = new Set(cachedPermits.map((p) => p.id))
    for (const e of rows) if (e.permit && !have.has(e.permit) && !tried.current.has(e.permit)) { tried.current.add(e.permit); void data.permits.load(e.permit) }
  }, [whole, rows, cachedPermits, data.permits])

  const filtering = q.trim() !== "" || period !== ALL || person !== ALL || area !== ALL || !!pt || groups.join() !== DEFAULT_GROUPS.join()
  const clear = () => { setQ(""); setPeriod(ALL); setPerson(ALL); setArea(ALL); setPt(""); setGroups(DEFAULT_GROUPS); setShown(PAGE) }

  // One audit note per committed search (acesso.auditoria.busca): after the person stops typing or changing filters for a moment.
  const lastNoted = useRef<string | null>(null)
  useEffect(() => {
    const parts = [
      q.trim() && `“${q.trim()}”`,
      pt && `PT ${ptName(pt)}`,
      period !== ALL && (period === "hoje" ? "hoje" : "últimos 7 dias"),
      person !== ALL && `pessoa ${who(person === SYSTEM ? null : person)}`,
      area !== ALL && `área ${AREA_LABEL[area] ?? area}`,
      groups.join() !== DEFAULT_GROUPS.join() && `grupos ${GROUPS.filter((g) => groups.includes(g.value)).map((g) => g.label.toLowerCase()).join(", ") || "nenhum"}`,
    ].filter(Boolean) as string[]
    const key = parts.join(" · ")
    if (!key) { lastNoted.current = null; return }
    if (key === lastNoted.current) return
    const t = setTimeout(() => {
      lastNoted.current = key
      record([accessEvent("acesso.auditoria.busca", { data: { busca: key } }, ctx())])
    }, 1200)
    return () => clearTimeout(t)
  }, [q, pt, period, person, area, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  /** ptw-auditoria/2: JSONL + manifest, checkable with ptw-server/tools/ptw_verifica.py. */
  const exportAll = async (reason: string) => {
    const r = await data.audit.exportAll(reason)
    if ("code" in r) { toast.error("Não foi possível exportar a auditoria", { description: r.message }); return false }
    download(`${r.baseName}.jsonl`, r.jsonl, "application/x-ndjson")
    download(`${r.baseName}.manifesto.json`, r.manifest, "application/json")
    toast.success("Auditoria exportada", { description: `${r.events} eventos · JSONL e manifesto` })
    return true
  }

  // Like every list (Quadro, Ativos): the table has the full width; an event opens in a side sheet only when picked.
  const selected = opened ? picked : null
  const ev = selected !== null ? rows.find((e) => e.seq === selected) ?? log.find((e) => e.seq === selected) ?? null : null
  const pick = (seq: number) => {
    if (seq !== picked) record([accessEvent("acesso.auditoria.evento", { data: { seq } }, ctx())])
    setSelected(seq); setOpened(true)
  }
  const showDetail = opened && !!ev
  // Who acted and which areas there are, over the whole trail (the server's facets when it is not whole).
  const people = useMemo(() => { const ids = new Set(facets.actorIds); return state.people.filter((p) => ids.has(p.id)) }, [facets.actorIds, state.people])
  const areas = facets.areas

  // The rows render once per change of the list or the selection, not on every clock tick.
  const body = useMemo(() => rows.map((e) => {
                    const { tone, icon: Icon } = auditLook(e)
                    const on = e.seq === selected
                    const tgt = target(e)
                    return (
                      <TableRow key={e.seq} data-state={on ? "selected" : undefined} className="cursor-pointer" onClick={() => pick(e.seq)}>
                        <TableCell className="tabular-nums">
                          <span className="flex items-baseline gap-2"><span>{dmHms(eventIso(e))}</span><span className="type-meta max-sm:hidden">#{e.seq}</span></span>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <button type="button" aria-current={on || undefined} onClick={(x) => { x.stopPropagation(); pick(e.seq) }}
                            className={cn("flex min-h-11 w-full items-center gap-2 text-left focus-visible:underline focus-visible:outline-none md:min-h-8", on && "font-semibold")}>
                            <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
                            <span className="flex min-w-0 flex-col">
                              <span className="break-words">{reader.title(e)}</span>
                              <span className="type-meta md:hidden">{who(e.actor)}</span>
                              <span className="type-meta break-words lg:hidden">{tgt}</span>
                              {!e.ok && <span className={cn("type-meta font-medium sm:hidden", TONE_TEXT.stop)}>Negado</span>}
                            </span>
                          </button>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{who(e.actor)}</TableCell>
                        <TableCell className={cn("hidden max-w-72 lg:table-cell", e.permit && !reader.isDraft(e.permit) ? "whitespace-nowrap" : "whitespace-normal break-words")}>{tgt}</TableCell>
                        <TableCell className="hidden sm:table-cell">{e.ok ? <span className="text-muted-foreground">Registrado</span> : <span className={cn("flex items-center gap-1 font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="size-4" aria-hidden />Negado</span>}</TableCell>
                      </TableRow>
                    )
                  }), [rows, selected, picked, reader]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = !check ? <StatusBadge tone="neutral" icon={ShieldIcon}>Verificando a cadeia</StatusBadge>
    : check.ok ? <StatusBadge tone="ok" icon={ShieldCheckIcon}>Cadeia íntegra</StatusBadge>
    : <StatusBadge tone="stop" icon={ShieldAlertIcon}>Cadeia quebrada no evento #{check.firstBroken}</StatusBadge>

  return (
    <Page>
      <div>
        <PageHeader title="Auditoria" count={facets.total}
          meta={<>{status}<span>Nada é alterado nem apagado</span></>}
          actions={sim.canExport ? { primary: { label: "Exportar", icon: DownloadIcon, onClick: () => setExporting(true), disabled: sim.serverDown } } : undefined} />
      </div>
      <ExportDialog open={exporting} count={facets.total} onClose={() => setExporting(false)} onExport={exportAll} />

      {facets.total === 0 && !facets.loading ? (
        <Empty className="items-start text-left"><EmptyHeader className="items-start text-left"><EmptyTitle>Nenhum evento registrado</EmptyTitle><EmptyDescription>Cada alteração, acesso e tentativa negada aparece aqui.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="min-w-0">
          <div className="min-w-0">
            <ListToolbar
              search={{ value: q, onChange: (v) => { setQ(v); setShown(PAGE) }, label: "Buscar na auditoria", placeholder: "Buscar texto, pessoa, alvo ou nº" }}
              filtering={filtering}
              onClear={clear}
              count={{ shown: matched, total: facets.total, noun: ["evento", "eventos"] }}
              filtersBelow
              filters={<div className="flex min-w-0 flex-wrap items-center gap-2">
                <ToggleGroup type="multiple" variant="outline" value={groups} aria-label="Grupos de eventos" className="flex-wrap justify-start @3xl:flex-nowrap"
                  onValueChange={(v) => { setGroups(GROUPS.map((g) => g.value).filter((g) => (v as AuditGroup[]).includes(g))); setShown(PAGE) }}>
                  {GROUPS.map((g) => <ToggleGroupItem key={g.value} value={g.value} className={cn("min-h-11 md:min-h-9", TOGGLE_ON)}>{g.label}</ToggleGroupItem>)}
                </ToggleGroup>
                <span aria-hidden className="mx-1 hidden h-5 w-px bg-border @3xl:block" />
                <FilterSelect label="Período" value={period} onChange={(v) => { setPeriod(v); setShown(PAGE) }} options={[{ value: ALL, label: "Todo o período" }, { value: "hoje", label: "Hoje" }, { value: "7d", label: "Últimos 7 dias" }]} />
                <FilterSelect label="Pessoa" value={person} onChange={(v) => { setPerson(v); setShown(PAGE) }} options={[{ value: ALL, label: "Todas as pessoas" }, ...people.map((p) => ({ value: p.id, label: p.name })), { value: SYSTEM, label: "Sistema" }]} />
                <FilterSelect label="Área" value={area} onChange={(v) => { setArea(v); setShown(PAGE) }} options={[{ value: ALL, label: "Todas as áreas" }, ...areas.map((a) => ({ value: a, label: AREA_LABEL[a] ?? a }))]} />
                {pt && (
                  <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => { setPt(""); window.history.replaceState(window.history.state, "", "#auditoria") }} aria-label={`Remover filtro da ${ptName(pt)}`}>
                    <span className={cn(!reader.isDraft(pt) && "type-data")}>{ptName(pt)}</span><XIcon data-icon="inline-end" />
                  </Button>
                )}
              </div>}
            >
              <div aria-busy={found.loading || undefined} className={cn("min-w-0 transition-opacity", found.loading && "opacity-60")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead className="hidden md:table-cell">Pessoa</TableHead>
                    <TableHead className="hidden lg:table-cell">Alvo</TableHead>
                    <TableHead className="hidden sm:table-cell">Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-24 whitespace-normal text-muted-foreground">Nenhum evento com esses filtros.</TableCell></TableRow>
                  ) : body}
                </TableBody>
              </Table>
              </div>
              {found.nextBefore !== null && shown < (whole ? Infinity : 500) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="type-meta tabular-nums">1–{rows.length} de {matched}</span>
                  <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais {Math.min(PAGE, matched - rows.length)}</Button>
                </div>
              )}
            </ListToolbar>
          </div>

          <Sheet open={showDetail} onOpenChange={(o) => { if (!o) setOpened(false) }}>
            <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto p-6 sm:max-w-md">
              <SheetTitle className="sr-only">Evento da auditoria</SheetTitle>
              <SheetDescription className="sr-only">Detalhe do evento escolhido na lista.</SheetDescription>
              {ev && <EventDetail e={ev} prev={log.find((x) => x.seq === ev.seq - 1)} reader={reader} unitName={state.units.find((u) => u.id === ev.unit)?.name} target={target(ev)} />}
            </SheetContent>
          </Sheet>
        </div>
      )}
    </Page>
  )
}

/** Exportar asks why (the database requires a reason for every export). Bottom sheet on a phone. */
function ExportDialog({ open, count, onClose, onExport }: { open: boolean; count: number; onClose: () => void; onExport: (reason: string) => Promise<boolean> }) {
  const mobile = useIsMobile()
  const onOpenChange = (o: boolean) => { if (!o) onClose() }
  const body = open && <ExportForm count={count} onClose={onClose} onExport={onExport} />
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-dvh overflow-y-auto">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">{body}</div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-md">{body}</DialogContent>
    </Dialog>
  )
}

function ExportForm({ count, onClose, onExport }: { count: number; onClose: () => void; onExport: (reason: string) => Promise<boolean> }) {
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const ok = reason.trim().length > 0
  return (
    <form className="flex flex-col gap-4" onSubmit={async (x) => { x.preventDefault(); if (!ok || saving) return; setSaving(true); try { if (await onExport(reason.trim())) onClose() } finally { setSaving(false) } }}>
      <DialogHeader className="pr-10">
        <DialogTitle>Exportar auditoria</DialogTitle>
        <DialogDescription>{count} eventos em JSONL, com manifesto. A exportação também fica registrada.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="export-reason">Motivo da exportação</Label>
        <Input id="export-reason" value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Ex.: auditoria interna de novembro" autoComplete="off" maxLength={500} className="min-h-11 md:min-h-9" />
      </div>
      <div className="flex flex-col gap-3">
        {!ok && <p id="export-help" className="type-meta">Escreva o motivo para exportar</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse md:flex-row md:items-center md:justify-end">
          <Button type="button" variant="outline" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="min-h-11 w-full md:min-h-9 md:w-auto" disabled={!ok || saving} aria-describedby={!ok ? "export-help" : undefined}>{saving ? "Exportando…" : "Exportar"}</Button>
        </DialogFooter>
      </div>
    </form>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-h-11 w-full md:min-h-9 @3xl:w-40" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  )
}

function HashLine({ value, name }: { value: string; name: string }) {
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => toast.success(`${name} copiado`), () => toast.error("Não foi possível copiar"))
  }
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate type-data" title={value}>{shortHash(value)}</span>
      <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-8" aria-label={`Copiar ${name.toLowerCase()}`} onClick={copy}><CopyIcon /></Button>
    </span>
  )
}

/** One event, read-only: facts, what changed (before → after), its other data and its link in the chain. */
function EventDetail({ e, prev, reader, unitName, target }: {
  e: AuditEvent; prev: AuditEvent | undefined; reader: EventReader; unitName: string | undefined; target: string
}) {
  const { who, ptName } = reader
  const { tone, icon: Icon } = auditLook(e)
  const { hash: _h, ...body } = e
  void _h
  const linkOk = eventHash(body) === e.hash && (prev ? e.prev === prev.hash : e.seq !== 1 || e.prev === GENESIS)
  const rec = e.entity ? RECORD_HREF[e.entity] : undefined
  const area = auditArea(e.action)
  const changes = reader.lines(e)
  const data = [...reader.data(e), { field: "__action", label: "Código da ação", after: e.action }]
  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={cn("mt-1 size-5 shrink-0", TONE_TEXT[tone])} aria-hidden />
          <h2 className="min-w-0 type-title break-words">{reader.title(e)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta">
          {e.ok ? <StatusBadge tone="neutral">Registrado</StatusBadge> : <StatusBadge tone="stop" icon={CircleAlertIcon}>Negado</StatusBadge>}
          <span className="tabular-nums">Evento #{e.seq}</span>
        </div>
      </header>

      <PageSection title="Evento">
        <PropertyList items={[
          { label: "Hora", value: <span className="tabular-nums">{fullDateTime(eventIso(e))}</span> },
          { label: "Pessoa", value: who(e.actor) },
          ...(e.role ? [{ label: "Cargo usado", value: who(e.role) }] : []),
          ...(e.auth ? [{ label: "Acesso por", value: AUTH_LABEL[e.auth] ?? e.auth }] : []),
          ...(e.reason ? [{ label: "Motivo", value: <span className="break-words">{e.reason}</span> }] : []),
          { label: "Área", value: AREA_LABEL[area] ?? area },
          // A PT's event: its target is the PT itself, as a link (revision kept beside the number).
          {
            label: "Alvo", value: (
              <span className="flex flex-col items-start">
                {e.permit ? (
                  <Button asChild variant="link" className="h-auto min-h-11 justify-start px-0 text-left whitespace-normal md:min-h-9">
                    <a href={`#pt/${e.permit}/historico`}>{ptName(e.permit)}{e.rev && !reader.isDraft(e.permit) ? ` · r${e.rev}` : ""}<ArrowRightIcon data-icon="inline-end" /></a>
                  </Button>
                ) : <span className="break-words">{target}</span>}
                {e.entity && <span className="type-meta">{ENTITY_LABEL[e.entity] ?? e.entity}</span>}
              </span>
            ),
          },
          ...(rec ? [{ label: "Registro", value: <Button asChild variant="link" className="h-auto min-h-11 justify-start px-0 md:min-h-9"><a href={rec.href}>{rec.label}<ArrowRightIcon data-icon="inline-end" /></a></Button> }] : []),
        ]} />
      </PageSection>

      {changes.length > 0 && (
        <PageSection title="Alterações">
          <ul className="flex flex-col gap-1 type-body">
            {changes.map((c) => <li key={c} className="break-words">{c}</li>)}
          </ul>
        </PageSection>
      )}

      <PageSection title="Dados">
        <ul className="flex flex-col divide-y border-y">
          {data.map((c) => (
            <li key={c.field} className="flex flex-col gap-0.5 py-2">
              <span className="type-meta">{c.label}</span>
              {c.before !== undefined ? (
                <span className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 type-body">
                  <span className="type-meta">Antes</span><span className="break-words text-muted-foreground">{c.before}</span>
                  <span className="type-meta">Depois</span><span className="break-words">{c.after}</span>
                </span>
              ) : <span className="break-words type-body">{c.after}</span>}
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title="Integridade">
        <PropertyList items={[
          { label: "Elo", value: linkOk ? <StatusBadge tone="ok" icon={ShieldCheckIcon}>Confere</StatusBadge> : <StatusBadge tone="stop" icon={ShieldAlertIcon}>Não confere</StatusBadge> },
          { label: "Código de verificação", value: <HashLine value={e.hash} name="Código de verificação" /> },
          { label: "Código do evento anterior", value: <HashLine value={e.prev} name="Código do evento anterior" /> },
          { label: "Unidade", value: unitName ?? "Unidade removida" },

        ]} />
      </PageSection>
    </>
  )
}

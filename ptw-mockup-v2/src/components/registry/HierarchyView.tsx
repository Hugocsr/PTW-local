import { useCallback, useMemo, useState, type ReactNode } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { runAsUndo } from "@/audit/store"
import { ArrowRightIcon, BanIcon, CircleAlertIcon, CircleCheckIcon, CircleXIcon, CornerDownRightIcon, PencilIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Page, PageHeader, PageSection, PropertyList } from "@/components/shell/Page"
import { cn } from "@/lib/utils"
import type { Asset } from "@/registry/types"
import { byId, locationPath as pathIds } from "@/core/indexes"
import { fmtDate, label, newId, useRegistry } from "@/registry/store"
import type { Location, Status } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "@/components/work/state"
import { navigate } from "@/components/work/nav"
import { TONE_TEXT } from "@/components/shell/Status"
import { assetIcon, Flags, LockedReason, TypeLine, locationIcon, PersonAvatar, useRecordBack } from "./common"
import { DataTable, type Column } from "./DataTable"
import { useAssetSearch, useData, useLocationAssets } from "@/data/hooks"
import { FormDialog, SelectField, STATUS_OPTIONS, TextField, splitAliases } from "./forms"
import { LocationAssetCount, LocationCounts } from "./LocationCounts"

const open = (id: string) => navigate(`locais/${id}`)

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" })
/** Levels shown as indentation in the table; deeper ones keep the last indent (the path column tells the rest). */
const MAX_INDENT = 6

interface Row { l: Location; depth: number; parents: string; rank: number; assets: number }


/**
 * Locais: one table with every place, in hierarchy order (children right under their parent, indented by
 * level; sorting by another column drops the order, the "Dentro de" column keeps the path). A row opens
 * the place's own page (`#locais/<id>`). Paginated, so thousands of places cost one page of DOM.
 */
export function HierarchyView() {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown
  const { locations, locationTypes } = state
  // API counts include sublocations and never infer a zero from a partially loaded asset cache.
  const { whole } = useData()
  const assets = state.assets
  const [creating, setCreating] = useState(false)
  const wrapPage = useCallback((items: Row[], children: ReactNode) => <LocationCounts ids={items.map(r => r.l.id)}>{children}</LocationCounts>, [])

  const rows = useMemo<Row[]>(() => {
    // Hierarchy order: depth-first, siblings by name.
    const kids = new Map<string | null, Location[]>()
    for (const l of locations) { const k = l.parentId && byId(locations, l.parentId) ? l.parentId : null; const xs = kids.get(k); if (xs) xs.push(l); else kids.set(k, [l]) }
    const rank = new Map<string, number>()
    const stack: Location[] = (kids.get(null) ?? []).slice().sort((a, b) => collator.compare(b.name, a.name))
    while (stack.length) {
      const l = stack.pop()!
      rank.set(l.id, rank.size)
      for (const k of (kids.get(l.id) ?? []).slice().sort((a, b) => collator.compare(b.name, a.name))) stack.push(k)
    }
    // Assets per place, counting sublocais; an asset in two places under the same parent counts once there.
    const count = new Map<string, number>()
    for (const a of whole ? assets : []) {
      const seen = new Set<string>()
      for (const lid of a.locationIds) for (const x of pathIds(locations, lid)) seen.add(x)
      for (const x of seen) count.set(x, (count.get(x) ?? 0) + 1)
    }
    return locations.map((l) => {
      const ids = pathIds(locations, l.id)
      return {
        l, depth: ids.length - 1, rank: rank.get(l.id) ?? 0, assets: count.get(l.id) ?? 0,
        parents: ids.slice(1).reverse().map((x) => byId(locations, x)?.name ?? "").join(" › "),
      }
    })
  }, [locations, assets, whole])

  const searchText = useCallback((r: Row) => [r.l.name, r.l.code, ...r.l.aliases, r.parents].join(" "), [])
  const columns = useMemo<Column<Row>[]>(() => [
    {
      id: "name", header: "Local", className: "whitespace-normal md:py-1", sort: (a, b) => a.rank - b.rank,
      cell: (r) => {
        const Icon = locationIcon(locationTypes.find((t) => t.id === r.l.typeId))
        const inactive = r.l.status === "inativo"
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); open(r.l.id) }} style={{ paddingLeft: Math.min(r.depth, MAX_INDENT) * 16 }}
            className={cn("flex min-h-11 w-full items-center gap-2 text-left focus-visible:underline focus-visible:outline-none md:min-h-9", inactive && "text-muted-foreground")}>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className={cn("break-words", inactive && "line-through")}>{r.l.name}</span>
              <span className="type-data type-meta sm:hidden">{r.l.code}</span>
            </span>
          </button>
        )
      },
    },
    { id: "code", header: "Código", className: "hidden sm:table-cell", sort: (a, b) => collator.compare(a.l.code, b.l.code), cell: (r) => <span className="type-data">{r.l.code}</span> },
    { id: "type", header: "Tipo", className: "hidden md:table-cell", sort: (a, b) => collator.compare(label(locationTypes, a.l.typeId), label(locationTypes, b.l.typeId)), cell: (r) => label(locationTypes, r.l.typeId) },
    { id: "in", header: "Dentro de", className: "hidden min-w-40 whitespace-normal lg:table-cell", sort: (a, b) => collator.compare(a.parents, b.parents), cell: (r) => <span className="type-meta">{r.parents || "Raiz"}</span> },
    { id: "assets", header: "Ativos", align: "right" as const, className: "hidden sm:table-cell", ...(whole ? { sort: (a: Row, b: Row) => a.assets - b.assets } : {}), cell: (r: Row) => whole ? r.assets : <LocationAssetCount id={r.l.id} /> },
    {
      id: "status", header: "Situação", className: "whitespace-normal",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-x-2">
          {r.l.status === "ativo" && <span className="type-meta">Ativo</span>}
          <Flags origin={r.l.origin} status={r.l.status} compact />
        </span>
      ),
    },
  ], [locationTypes, whole])

  return (
    <Page>
      <PageHeader title="Locais" count={locations.length}
        actions={sim.canEditRegistry ? { primary: { label: "Novo local", icon: PlusIcon, disabled: down, onClick: () => setCreating(true) } } : undefined} />
      {down && <DownBanner now={sim.now} />}
      <DataTable<Row>
        wrapPage={wrapPage}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.l.id}
        noun={["local", "locais"]}
        searchLabel="Buscar por nome, código, apelido ou caminho"
        searchText={searchText}
        onRowClick={(r) => open(r.l.id)}
        defaultSort={{ id: "name", dir: "asc" }}
        selectFilter={{ label: "Filtrar por tipo", allLabel: "Todos os tipos", options: locationTypes.map((t) => ({ value: t.id, label: t.label })), test: (r, v) => r.l.typeId === v }}
        filter={{ label: "Filtrar por situação", options: [{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }, { value: "em_revisao", label: "Em revisão" }], test: (r, v) => r.l.status === v }}
        pageSizes={[25, 50, 100]}
        stateKey="locais"
        empty={<Empty><EmptyHeader><EmptyTitle>Nenhum local cadastrado</EmptyTitle></EmptyHeader></Empty>}
      />
      {creating && (
        <LocationDialog parentId={null} existing={null} now={now()} onClose={() => setCreating(false)}
          onSaved={async (l) => {
            if (!await upsert("locations", l)) return
            toast.success("Local criado", { description: l.name })
            setCreating(false)
          }} />
      )}
    </Page>
  )
}

/** The page of one place (`#locais/<id>`): cadastro, sublocais, assets, cargos. */
export function LocationDetailView({ id }: { id: string }) {
  const { state, upsert, update, now } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown
  const { locations, locationTypes, people, roleTypes } = state
  const back = useRecordBack("locais")
  const [dialog, setDialog] = useState<{ mode: "edit" } | { mode: "add" } | null>(null)
  const loc = byId(locations, id)

  const subs = useMemo(() => locations.filter((l) => l.parentId === id).sort((a, b) => collator.compare(a.name, b.name)), [locations, id])
  // The assets of this place and everything under it: from the registry in memory, one page asked of the server otherwise.
  const linked = useLocationAssets(id)
  const path = useMemo(() => pathIds(locations, id).slice().reverse(), [locations, id])
  const roles = useMemo(() => people.flatMap((p) => p.roles
    .filter((r) => r.scopeLocationId && path.includes(r.scopeLocationId))
    .map((r) => ({ key: r.id, personId: p.id, person: p.name, role: label(roleTypes, r.roleId), until: r.validUntil }))), [people, roleTypes, path])

  if (!loc) {
    return <Page><PageHeader back={back} title="Local não encontrado" meta="O endereço não corresponde a nenhum local." /></Page>
  }
  const typeIcon = locationIcon(locationTypes.find((t) => t.id === loc.typeId))
  const fromAD = loc.origin === "ad"
  const setStatus = (status: Status) => update<Location>("locations", loc.id, (l) => ({ ...l, status }))
  const deactivate = async () => {
    const before = loc.status
    if (!await setStatus("inativo")) return
    toast("Local inativado", { description: loc.name, action: { label: "Desfazer", onClick: () => runAsUndo(() => setStatus(before)) } })
  }
  const parents = path.slice(0, -1).map((x) => byId(locations, x)).filter((l): l is Location => !!l)

  return (
    <Page>
      <PageHeader back={back} title={loc.name}
        meta={<><span className="type-data">{loc.code}</span><Badge variant="outline">{label(locationTypes, loc.typeId)}</Badge><Flags origin={loc.origin} status={loc.status} /></>}
        actions={fromAD || !sim.canEditRegistry ? undefined : {
          primary: { label: "Editar", icon: PencilIcon, disabled: down, onClick: () => setDialog({ mode: "edit" }) },
          menu: loc.status === "inativo"
            ? [{ label: "Reativar", icon: RotateCcwIcon, disabled: down, onClick: async () => { if (await setStatus("ativo")) toast.success("Local reativado", { description: loc.name }) } }]
            : [{ label: "Inativar", icon: BanIcon, disabled: down, confirm: { what: loc.name, detail: "O local deixa de receber novos vínculos. Pode ser reativado." }, onClick: deactivate }],
        }} />
      {down && <DownBanner now={sim.now} />}

      <PageSection title="Cadastro">
        <PropertyList items={[
          { label: "Tipo", value: <TypeLine icon={typeIcon} text={label(locationTypes, loc.typeId)} /> },
          { label: "Código", value: <span className="type-data">{loc.code}</span> },
          { label: "Apelidos", value: loc.aliases.length ? <span className="flex flex-wrap gap-1">{loc.aliases.map((a) => <Badge key={a} variant="outline">{a}</Badge>)}</span> : "—" },
          { label: "Situação", value: loc.status === "ativo" ? "Ativo" : loc.status === "inativo" ? "Inativo" : "Em revisão" },
          {
            label: "Dentro de",
            value: parents.length === 0 ? "Local raiz" : (
              <span className="-ml-2 flex flex-wrap items-center gap-x-1">
                {parents.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    {i > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />}
                    <Button variant="ghost" className="min-h-11 px-2 md:min-h-9" onClick={() => open(p.id)}>{p.name}</Button>
                  </span>
                ))}
              </span>
            ),
          },
        ]} />
      </PageSection>

      <PageSection title="Sublocais" action={
        fromAD || !sim.canEditRegistry ? undefined : <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={down} onClick={() => setDialog({ mode: "add" })}><PlusIcon data-icon="inline-start" />Sublocal</Button>
      }>
        {subs.length === 0 ? <p className="type-meta">Nenhum sublocal.</p> : (
          <ul className="flex flex-col divide-y border-y">
            {subs.map((s) => {
              const SI = locationIcon(locationTypes.find((t) => t.id === s.typeId))
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => open(s.id)} className="flex min-h-11 w-full items-center gap-2 py-1 text-left hover:bg-accent/50 focus-visible:underline focus-visible:outline-none md:min-h-9">
                    <SI className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn("min-w-0 flex-1 break-words", s.status === "inativo" && "text-muted-foreground line-through")}>{s.name}</span>
                    <span className="type-data type-meta">{s.code}</span>
                    <Flags origin={s.origin} status={s.status} compact />
                    <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PageSection>

      <AssetsList loc={loc} linked={linked.items} total={linked.total} loading={linked.loading} error={linked.error?.message} />

      <PageSection title="Cargos" action={undefined}>
        {roles.length === 0 ? <p className="type-meta">Nenhum cargo com escopo neste local.</p> : (
          <ul className="flex flex-col divide-y border-y">
            {roles.map((r) => (
              <li key={r.key} className="flex items-center gap-2 py-2">
                <PersonAvatar name={r.person} className="size-8 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  {/* The cargo is changed on the person's page: the name is the way there. */}
                  <a href={`#pessoas/${r.personId}`} className="w-fit type-body font-medium hover:underline focus-visible:underline focus-visible:outline-none">{r.person}</a>
                  <span className="type-meta">{r.role}</span>
                </span>
                <Validity until={r.until} today={sim.today} />
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {dialog && (
        <LocationDialog
          parentId={dialog.mode === "edit" ? loc.parentId : loc.id}
          existing={dialog.mode === "edit" ? loc : null}
          now={now()}
          onClose={() => setDialog(null)}
          onSaved={async (l, isNew) => {
            if (!await upsert("locations", l)) return
            toast.success(`${l.parentId && isNew ? "Sublocal criado" : isNew ? "Local criado" : "Local atualizado"}`, { description: l.name })
            setDialog(null)
          }}
        />
      )}
    </Page>
  )
}

/** Days before the end date when a cargo starts to show "vence em breve". */
const SOON_DAYS = 30

/** A cargo's validity: in words with an icon, never colour alone. ok = valid, attention = ends soon, stop = expired. */
export function Validity({ until, today }: { until: string; today: string }) {
  if (until < today) {
    return <span className={cn("inline-flex items-center gap-1 type-body whitespace-nowrap", TONE_TEXT.stop)}><CircleXIcon className="size-3.5 shrink-0" aria-hidden />Vencido · {fmtDate(until)}</span>
  }
  const days = Math.round((Date.parse(until) - Date.parse(today)) / 86_400_000)
  if (days <= SOON_DAYS) {
    return <span className={cn("inline-flex items-center gap-1 type-body whitespace-nowrap", TONE_TEXT.attention)}><CircleAlertIcon className="size-3.5 shrink-0" aria-hidden />Vence em breve · {fmtDate(until)}</span>
  }
  return <span className={cn("inline-flex items-center gap-1 type-body whitespace-nowrap", TONE_TEXT.ok)}><CircleCheckIcon className="size-3.5 shrink-0" aria-hidden />Válido até {fmtDate(until)}</span>
}

function LocationDialog({
  parentId, existing, onClose, onSaved, now,
}: {
  parentId: string | null
  existing: Location | null
  onClose: () => void
  onSaved: (l: Location, isNew: boolean) => Promise<void>
  now: string
}) {
  const { state } = useRegistry()
  const [name, setName] = useState(existing?.name ?? "")
  const [code, setCode] = useState(existing?.code ?? "")
  const [typeId, setTypeId] = useState(existing?.typeId ?? "")
  const [aliases, setAliases] = useState(existing?.aliases.join(", ") ?? "")
  const [status, setStatus] = useState<Status>(existing?.status ?? "ativo")
  const parent = byId(state.locations, parentId ?? "")
  const codeTaken = state.locations.some((l) => l.code.toLowerCase() === code.trim().toLowerCase() && l.id !== existing?.id)
  const codeLong = code.trim().length > 64, nameLong = name.trim().length > 200
  const fromAD = existing?.origin === "ad"
  const parents = parent ? pathIds(state.locations, parent.id).reverse().map((x) => byId(state.locations, x)?.name).join(" › ") : null

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? existing.name : parent ? `Novo sublocal em ${parent.name}` : "Novo local"}
      meta={existing ? (parents ? `Em ${parents}` : "Local raiz") : undefined}
      description="Local da hierarquia."
      valid={!fromAD && !!name.trim() && !!code.trim() && !!typeId && !codeTaken && !codeLong && !nameLong}
      missing={[!typeId && "Tipo", !name.trim() && "Nome", !code.trim() && "Código"].filter((x): x is string => !!x)}
      onSubmit={() =>
        onSaved(
          existing
            ? { ...existing, name: name.trim(), code: code.trim(), typeId, aliases: splitAliases(aliases), status }
            : {
                id: newId(), unitId: state.units[0].id, revision: 1, updatedAt: now,
                origin: "manual", status, parentId, typeId, code: code.trim(), name: name.trim(), aliases: splitAliases(aliases),
              },
          !existing
        )
      }
    >
      {fromAD && <p className="type-meta">Vem do diretório: edite lá.</p>}
      <SelectField label="Tipo" value={typeId} onChange={setTypeId} options={state.locationTypes.filter((t) => t.active || t.id === existing?.typeId).map((t) => ({ value: t.id, label: t.label }))} />
      <TextField label="Nome" value={name} onChange={setName} error={nameLong ? "No máximo 200 caracteres." : undefined} />
      <TextField label="Código" value={code} onChange={setCode} error={codeTaken ? "Este código já existe." : codeLong ? "No máximo 64 caracteres." : undefined} />
      <TextField label="Apelidos" value={aliases} onChange={setAliases} placeholder="separados por vírgula" />
      {existing && (
        <SelectField label="Situação" value={status} onChange={(v) => setStatus(v as Status)} options={STATUS_OPTIONS}
          description="Um local não é apagado: inative-o para que não receba novos vínculos." />
      )}
    </FormDialog>
  )
}

const PAGE = 25
const PICK_MAX = 50

/**
 * Ativos of a place: assets linked here can be unlinked (undoable) and more can be linked; assets
 * that reach this place only through a sublocal are listed read-only. An asset keeps at least one place.
 * Long lists show 25 at a time and the picker searches the whole registry but renders 50.
 */
function AssetsList({ loc, linked, total, loading, error }: { loc: Location; linked: Asset[]; total: number; loading: boolean; error?: string }) {
  const { state, update } = useRegistry()
  const { serverDown: down, canEditRegistry } = useSim()
  const [pickOpen, setPickOpen] = useState(false)
  const [q, setQ] = useState("")
  const [shown, setShown] = useState(PAGE)
  const here = useMemo(() => linked.filter((a) => a.locationIds.includes(loc.id)), [linked, loc.id])
  const via = useMemo(() => linked.filter((a) => !a.locationIds.includes(loc.id)), [linked, loc.id])
  const all = useMemo(() => [...here.map((a) => [a, true] as const), ...via.map((a) => [a, false] as const)], [here, via])
  const skipLinked = useCallback((a: Asset) => a.locationIds.includes(loc.id) || a.status === "inativo", [loc.id])
  const free = useAssetSearch(q, PICK_MAX, skipLinked).items
  const setLocs = (id: string, fn: (ids: string[]) => string[]) => update<Asset>("assets", id, (a) => ({ ...a, locationIds: fn(a.locationIds) }))
  const unlink = async (a: Asset) => {
    if (!await setLocs(a.id, (ids) => ids.filter((x) => x !== loc.id))) return
    toast("Ativo desvinculado", { description: `${a.code} · ${loc.name}`, action: { label: "Desfazer", onClick: () => runAsUndo(() => setLocs(a.id, (ids) => (ids.includes(loc.id) ? ids : [...ids, loc.id]))) } })
  }
  const link = async (a: Asset) => {
    if (!await setLocs(a.id, (ids) => [...ids, loc.id])) return
    setPickOpen(false)
    toast.success("Ativo vinculado", { description: `${a.code} · ${loc.name}` })
  }
  const row = (a: Asset, direct: boolean) => {
    const Icon = assetIcon(state.assetTypes.find((t) => t.id === a.typeId))
    return (
      <li key={a.id} className="flex items-center gap-2 py-1">
        <button type="button" onClick={() => navigate(`ativos/${a.id}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left focus-visible:underline focus-visible:outline-none md:min-h-9">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="type-data">{a.code}</span>
            <span className="type-body">{a.name}</span>
            {!direct && <Badge variant="ghost"><CornerDownRightIcon data-icon="inline-start" />Sublocal</Badge>}
          </span>
        </button>
        {canEditRegistry && direct && (a.locationIds.length > 1 ? (
          <Button variant="ghost" className="min-h-11 shrink-0 md:min-h-9" disabled={down} aria-label={`Remover ${a.code} deste local`} onClick={() => unlink(a)}>Remover</Button>
        ) : (
          <LockedReason label={`${a.code} só está neste local`} reason="Este é o único local do ativo: troque o local dele em Ativos para poder remover." />
        ))}
      </li>
    )
  }
  const picker = (
      <Popover open={pickOpen} onOpenChange={(o) => { setPickOpen(o); if (!o) setQ("") }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={down}><PlusIcon data-icon="inline-start" />Adicionar ativo</Button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] p-1">
          <Command shouldFilter={false}>
            <CommandInput value={q} onValueChange={setQ} placeholder="Buscar por tag ou nome" aria-label="Buscar ativo para vincular" className="h-full" />
            <CommandList>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              <CommandGroup>
                {free.map((a) => (
                  <CommandItem key={a.id} value={a.id} onSelect={() => link(a)} className="min-h-11 md:min-h-9">
                    <AssetIcon id={a.id} /><span className="type-data">{a.code}</span><span className="type-meta">· {a.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
  )
  return (
    <PageSection title="Ativos" action={canEditRegistry && picker}>
    <div className="flex flex-col gap-3">
      {loading ? <p role="status" className="type-meta">Carregando ativos…</p> : error ? <p role="alert" className="type-meta">Não foi possível carregar: {error}</p> : all.length === 0 ? <p className="type-meta">Nenhum ativo neste local nem nos sublocais.</p> : (
        <>
          <ul className="flex flex-col divide-y border-y">{all.slice(0, shown).map(([a, direct]) => row(a, direct))}</ul>
          {all.length > shown && <Button variant="ghost" className="min-h-11 w-fit md:min-h-9" onClick={() => setShown((n) => n + PAGE)}>Mostrar mais ({all.length - shown})</Button>}
          {total > linked.length && <p className="type-meta">Mostrando os primeiros {linked.length} de {total} ativos. Use a busca em Ativos para encontrar outro.</p>}
        </>
      )}
    </div>
    </PageSection>
  )
}

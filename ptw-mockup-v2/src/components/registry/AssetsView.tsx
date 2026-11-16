import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { ArrowLeftIcon, ArrowRightIcon, BanIcon, FileTextIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"
import { label, locationPath, newId, useRegistry } from "@/registry/store"
import { byId, locationPath as pathIds } from "@/core/indexes"
import { isOpen } from "@/core/equipmentLock"
import { usePermits } from "@/permit/store"
import type { Permit } from "@/permit/types"
import { runAsUndo } from "@/audit/store"
import type { Asset, Location, Status } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner, PermitStateBadge } from "@/components/work/state"
import { openPermit, navigate } from "@/components/work/nav"
import { permitShort } from "@/core/permitFormat"
import { TONE_TEXT } from "@/components/shell/Status"
import { Page, PageHeader, PageSection, PropertyList } from "@/components/shell/Page"
import { assetIcon, Flags, TypeLine, locationIcon, useRecordBack } from "./common"
import { PagedTable, useListState, type Column } from "./DataTable"
import { useAssetPage, useData, useEquipmentHolds } from "@/data/hooks"
import type { ListLocal } from "@/data/port"
import { FormDialog, SelectField, STATUS_OPTIONS, TextField, splitAliases } from "./forms"
import { PickList } from "./PickList"

/**
 * Header of the record open beside its list (model B, DESIGN.md): "← <list>" on phones only (the detail is
 * its own screen there), media + title + "Editar" on the right, one meta line with the badges.
 * `edit` absent = the record is read-only here (from the directory).
 */
export function RecordHeader({ back, media, title, mono, meta, edit }: {
  back: { label: string; onClick: () => void }
  media?: ReactNode
  title: ReactNode
  mono?: boolean
  meta?: ReactNode
  edit?: { disabled?: boolean; onClick: () => void }
}) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground hover:text-foreground" onClick={back.onClick}>
        <ArrowLeftIcon data-icon="inline-start" />{back.label}
      </Button>
      <div className="flex min-w-0 items-start gap-3">
        {media}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-h-11 min-w-0 items-center md:min-h-9">
            <h1 className={cn(mono ? "type-data-title" : "type-title", "min-w-0 break-words")}>{title}</h1>
          </div>
          {meta && <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 type-meta">{meta}</div>}
        </div>
        {edit && (
          <Button className="h-11 shrink-0 md:h-9" disabled={edit.disabled} onClick={edit.onClick}>
            <PencilIcon data-icon="inline-start" />Editar
          </Button>
        )}
      </div>
    </header>
  )
}

/** The place and its parents as text, "Prédio › Linha 02 › Bomba" (cached by the core per locations array). */
function pathText(locs: Location[], id: string) {
  return pathIds(locs, id).slice().reverse().map((x) => byId(locs, x)?.name ?? "").join(" › ")
}

const open = (id: string) => navigate(`ativos/${id}`)
const DEFAULT_SORT = { id: "code", dir: "asc" } as const
const PAGE_SIZES = [25, 50, 100]
const NOUN: [string, string] = ["ativo", "ativos"]
const rowKey = (a: Asset) => a.id
const onRowClick = (a: Asset) => open(a.id)

/**
 * Ativos: one table with every asset; a row opens the asset's own page (`#ativos/<id>`), like a PT from the Quadro.
 * Search, type filter and pagination live in DataTable, so 20 000 rows cost one page of DOM.
 */
export function AssetsView() {
  const { state, upsert, now } = useRegistry()
  const { permits } = usePermits()
  const sim = useSim()
  const down = sim.serverDown
  const { assetTypes, locations } = state
  const { whole } = useData()
  const [dialog, setDialog] = useState(false)
  // The view is the table's; the page of assets comes from the data layer (computed here in memory, asked of the server otherwise).
  const list = useListState({ stateKey: "ativos", defaultSort: DEFAULT_SORT, pageSizes: PAGE_SIZES, filterNames: { select: "typeId" }, debounceMs: whole ? 0 : 300 })
  // Only "Tipo" sorts here besides tag and name, and only where the registry is whole: the server orders by tag and name.
  const local = useMemo<Partial<ListLocal<Asset>>>(() => ({ sorts: { type: (a, b) => label(assetTypes, a.typeId).localeCompare(label(assetTypes, b.typeId), "pt-BR") } }), [assetTypes])
  const page = useAssetPage(list.view, local)
  const holds = useEquipmentHolds(page.items.map((a) => a.id))

  // Open PT per asset (the first), one pass over the permits. Only the memory cache knows every open PT: the contract has no such field yet.
  const openPt = useMemo(() => {
    const m = new Map<string, Permit>()
    if (whole) for (const p of permits) if (isOpen(p)) for (const a of p.assetIds) if (!m.has(a)) m.set(a, p)
    return m
  }, [permits, whole])
  const selectFilter = useMemo(() => ({ label: "Filtrar por tipo", allLabel: "Todos os tipos", options: assetTypes.map((t) => ({ value: t.id, label: t.label })) }), [assetTypes])
  const typeById = useMemo(() => new Map(assetTypes.map((t) => [t.id, t])), [assetTypes])
  const places = useCallback((a: Asset) => a.locationIds.map((id) => pathText(locations, id)), [locations])

  const columns = useMemo<Column<Asset>[]>(() => [
    {
      id: "code", header: "Ativo", className: "whitespace-normal", sortable: true,
      cell: (a: Asset) => {
        const AI = assetIcon(typeById.get(a.typeId))
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); open(a.id) }}
            className="flex min-h-11 w-full items-center gap-2 text-left focus-visible:underline focus-visible:outline-none md:min-h-9">
            <AI className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="type-data">{a.code}</span>
              <span className="type-meta md:hidden">{a.name}</span>
            </span>
          </button>
        )
      },
    },
    { id: "name", header: "Nome", className: "hidden min-w-40 whitespace-normal md:table-cell", sortable: true, cell: (a) => a.name },
    { id: "type", header: "Tipo", className: "hidden sm:table-cell", sortable: whole, cell: (a) => label(assetTypes, a.typeId) },
    {
      id: "loc", header: "Local", className: "hidden min-w-40 whitespace-normal lg:table-cell",
      cell: (a) => (
        <span className="flex flex-col">
          {places(a).slice(0, 2).map((p, i) => <span key={i} className="type-meta">{p}</span>)}
          {a.locationIds.length > 2 && <span className="type-meta">+{a.locationIds.length - 2}</span>}
        </span>
      ),
    },
    {
      id: "status", header: "Situação", className: "whitespace-normal",
      cell: (a) => (
        <span className="flex flex-wrap items-center gap-x-2">
          {a.status === "ativo" && <span className="type-meta">Ativo</span>}
          <Flags origin={a.origin} status={a.status} compact />
        </span>
      ),
    },
    {
      id: "pt", header: "PT aberta", className: "hidden sm:table-cell",
      cell: (a: Asset) => {
        const p = openPt.get(a.id)
        const held = holds.items.find((h) => h.assetId === a.id)
        return !whole ? <span className="type-meta">{holds.loading ? "Consultando…" : holds.error ? "Não verificável" : held ? <button type="button" className="min-h-11 type-data hover:underline md:min-h-9" onClick={(e) => { e.stopPropagation(); openPermit(held.permitId) }}>{held.number ?? "PT sem número"}</button> : "—"}</span> : p
          ? <span className="inline-flex items-center gap-1 type-data whitespace-nowrap"><FileTextIcon className="size-3.5 text-muted-foreground" aria-hidden />{permitShort(p)}</span>
          : <span className="type-meta">—</span>
      },
    },
  ], [typeById, assetTypes, places, openPt, whole, holds])

  return (
    <Page>
      <PageHeader title="Ativos" count={page.all}
        actions={sim.canEditRegistry ? { primary: { label: "Novo ativo", icon: PlusIcon, disabled: down, onClick: () => setDialog(true) } } : undefined} />
      {down && <DownBanner now={sim.now} />}
      <PagedTable<Asset>
        list={list}
        data={page}
        columns={columns}
        selectFilter={selectFilter}
        rowKey={rowKey}
        noun={NOUN}
        searchLabel="Buscar por tag, nome, apelido ou local"
        onRowClick={onRowClick}
        pageSizes={PAGE_SIZES}
        empty={<Empty><EmptyHeader><EmptyTitle>Nenhum ativo cadastrado</EmptyTitle></EmptyHeader></Empty>}
      />
      {dialog && (
        <AssetDialog existing={null} now={now()} onClose={() => setDialog(false)}
          onSaved={async (a) => {
            if (!await upsert("assets", a)) return
            toast.success("Ativo criado", { description: a.code })
            setDialog(false)
          }} />
      )}
    </Page>
  )
}

/** The page of one asset (`#ativos/<id>`): cadastro, where it is, relations, PTs. */
export function AssetDetailView({ id }: { id: string }) {
  const { state, upsert, update, now, removeRelation, restore } = useRegistry()
  const { permits } = usePermits()
  const sim = useSim()
  const down = sim.serverDown
  const { assets, assetTypes, locations, relations, relationKinds } = state
  const back = useRecordBack("ativos")
  const [dialog, setDialog] = useState(false)
  const [allPts, setAllPts] = useState(false)
  const asset = byId(assets, id)
  const port = useData()
  const holds = useEquipmentHolds([id])
  const [read, setRead] = useState<{ id: string; error: string } | null>(null)
  useEffect(() => {
    if (!port.registry.loadAsset) return
    let live = true
    void port.registry.loadAsset(id).then((r) => { if (live) setRead({ id, error: "message" in r ? r.message : "" }) })
    return () => { live = false }
  }, [id, port])

  const mine = useMemo(() => relations.filter((r) => r.fromId === id || r.toId === id), [relations, id])
  const onIt = useMemo(() => port.whole ? permits.filter((p) => p.assetIds.includes(id)).sort((a, b) => Number(isOpen(b)) - Number(isOpen(a))) : [...new Map(holds.items.map((h) => [h.permitId, { id: h.permitId, number: h.number, state: h.state }])).values()], [permits, id, port.whole, holds.items])

  if (!asset) {
    return <Page><PageHeader back={back} title={read?.id !== id ? "Carregando ativo…" : "Ativo não encontrado"} meta={read?.id === id ? read.error || "O endereço não corresponde a nenhum ativo." : undefined} /></Page>
  }
  const typeIcon = assetIcon(assetTypes.find((t) => t.id === asset.typeId))
  const fromAD = asset.origin === "ad"
  const setStatus = (status: Status) => update<Asset>("assets", asset.id, (a) => ({ ...a, status }))
  const deactivate = async () => {
    const before = asset.status
    if (!await setStatus("inativo")) return
    toast("Ativo inativado", { description: asset.code, action: { label: "Desfazer", onClick: () => runAsUndo(() => setStatus(before)) } })
  }
  const shownPts = allPts ? onIt : onIt.slice(0, 5)

  return (
    <Page>
      <PageHeader back={back} title={asset.code} mono
        meta={<>{asset.name}<Badge variant="outline">{label(assetTypes, asset.typeId)}</Badge><Flags origin={asset.origin} status={asset.status} /></>}
        actions={fromAD || !sim.canEditRegistry ? undefined : {
          primary: { label: "Editar", icon: PencilIcon, disabled: down, onClick: () => setDialog(true) },
          menu: asset.status === "inativo"
            ? [{ label: "Reativar", icon: RotateCcwIcon, disabled: down, onClick: async () => { if (await setStatus("ativo")) toast.success("Ativo reativado", { description: asset.code }) } }]
            : [{ label: "Inativar", icon: BanIcon, disabled: down, confirm: { what: asset.code, detail: "O ativo deixa de receber PTs. Pode ser reativado." }, onClick: deactivate }],
        }} />
      {down && <DownBanner now={sim.now} />}

      <PageSection title="Cadastro">
        <PropertyList items={[
          { label: "Tipo", value: <TypeLine icon={typeIcon} text={label(assetTypes, asset.typeId)} /> },
          { label: "Nome", value: asset.name },
          { label: "Apelidos", value: asset.aliases.length ? <span className="flex flex-wrap gap-1">{asset.aliases.map((a) => <Badge key={a} variant="outline">{a}</Badge>)}</span> : "—" },
          { label: "Situação", value: asset.status === "ativo" ? "Ativo" : asset.status === "inativo" ? "Inativo" : "Em revisão" },
        ]} />
      </PageSection>

      <PageSection title="Onde está">
        <ul className="flex flex-col divide-y border-y">
          {asset.locationIds.map((lid) => {
            const p = pathIds(locations, lid).slice().reverse().map((x) => byId(locations, x)).filter((l): l is Location => !!l)
            return (
              <li key={lid} className="-ml-2 flex flex-wrap items-center gap-x-1 py-0.5 type-body">
                {p.map((l, i) => (
                  <span key={l.id} className="flex items-center gap-1">
                    {i > 0 && <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />}
                    <Button variant="ghost" className={cn("min-h-11 px-2 md:min-h-9", i === p.length - 1 ? "font-medium" : "text-muted-foreground")} onClick={() => navigate(`locais/${l.id}`)}>{l.name}</Button>
                  </span>
                ))}
              </li>
            )
          })}
        </ul>
      </PageSection>

      <PageSection title="Relações" action={sim.canEditRegistry &&
        <AddRelation asset={asset} disabled={down}
          // "é parte de" joins two assets for the equipment lock: the store refuses (with its toast and a
          // denial in the audit) a relation that would put two open PTs on the same equipment.
          onAdd={async (rel) => { const saved = await upsert("relations", rel); if (saved) toast.success("Relação adicionada"); return saved }} />
      }>
        {mine.length === 0 ? <p className="type-meta">Nenhuma relação cadastrada.</p> : (
          <ul className="flex flex-col divide-y border-y">
            {mine.map((r) => {
              const chip = (rid: string) => {
                const a = byId(assets, rid)
                const self = rid === id
                return (
                  <Button variant="ghost" disabled={self} className="min-h-11 bg-surface-well type-data hover:underline disabled:opacity-100 md:min-h-9" onClick={() => open(rid)}>
                    <AssetIcon id={rid} className="size-3.5" />{a?.code}{a?.status === "inativo" && <span className={cn("type-meta", TONE_TEXT.neutral)}>Inativo</span>}
                  </Button>
                )
              }
              return (
                <li key={r.id} className="flex items-center gap-2 py-1">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {chip(r.fromId)}
                    <span className="flex items-center gap-1 type-body whitespace-nowrap"><span className="h-px w-4 bg-border" />{label(relationKinds, r.kindId)}<ArrowRightIcon className="size-3" aria-hidden /></span>
                    {chip(r.toId)}
                  </div>
                  {sim.canEditRegistry && <Button variant="ghost" size="icon" aria-label="Remover relação" className="size-11 shrink-0 md:size-9" disabled={down}
                    onClick={async () => {
                      const at = relations.findIndex((x) => x.id === r.id)
                      if (!await removeRelation(r.id)) return
                      toast("Relação removida", { action: { label: "Desfazer", onClick: () => runAsUndo(() => restore("relations", r, at)) } })
                    }}><XIcon /></Button>}
                </li>
              )
            })}
          </ul>
        )}
      </PageSection>

      <PageSection title="PTs que prendem este equipamento">
        {holds.loading ? <p role="status" className="type-meta">Consultando as PTs…</p> : holds.error ? <p role="alert" className="type-meta">Não foi possível consultar: {holds.error.message}</p> : onIt.length === 0 ? <p className="type-meta">Nenhuma PT prende este equipamento agora.</p> : (
          <>
            <ul className="flex flex-col divide-y border-y">
              {shownPts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => openPermit(p.id)} className="flex min-h-11 w-full items-center gap-3 py-1 text-left hover:bg-accent/50 focus-visible:underline focus-visible:outline-none md:min-h-9">
                    <span className="type-data">{p.number ?? "PT sem número"}</span>
                    <PermitStateBadge state={p.state} />
                    <ArrowRightIcon className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {onIt.length > 5 && <Button variant="ghost" className="min-h-11 w-fit md:min-h-9" onClick={() => setAllPts((v) => !v)}>{allPts ? "Mostrar menos" : `Mostrar todas (${onIt.length})`}</Button>}
          </>
        )}
      </PageSection>

      {dialog && (
        <AssetDialog existing={asset} now={now()} onClose={() => setDialog(false)}
          onSaved={async (a) => {
            if (!await upsert("assets", a)) return
            toast.success("Ativo atualizado", { description: a.code })
            setDialog(false)
          }} />
      )}
    </Page>
  )
}

function AddRelation({ asset, onAdd, disabled }: { asset: Asset; disabled?: boolean; onAdd: (r: { id: string; fromId: string; toId: string; kindId: string }) => Promise<boolean> }) {
  const { state } = useRegistry()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState("")
  const [dir, setDir] = useState("out")
  const [other, setOther] = useState("")
  const fromId = dir === "out" ? asset.id : other, toId = dir === "out" ? other : asset.id
  // The database keeps one relation per (from, to, kind); a relation is never edited, only removed and created.
  const dup = !!kind && !!other && state.relations.some((r) => r.fromId === fromId && r.toId === toId && r.kindId === kind)
  return (
    <>
      <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={disabled} onClick={() => setOpen(true)}><PlusIcon data-icon="inline-start" />Relação</Button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={`Nova relação de ${asset.code}`}
        description="Relação entre dois ativos."
        valid={!!kind && !!other && !dup}
        missing={[!kind && "Tipo de relação", !other && "Outro ativo"].filter((x): x is string => !!x)}
        submitLabel="Adicionar"
        onSubmit={async () => {
          if (!await onAdd({ id: newId(), fromId, toId, kindId: kind })) return
          setKind(""); setOther(""); setOpen(false)
        }}
      >
        <SelectField label="Sentido" value={dir} onChange={setDir} options={[
          { value: "out", label: `${asset.code} → outro ativo` },
          { value: "in", label: `Outro ativo → ${asset.code}` },
        ]} />
        <SelectField label="Tipo de relação" value={kind} onChange={setKind} options={state.relationKinds.filter((k) => k.active).map((k) => ({ value: k.id, label: k.label }))} />
        <SelectField label="Outro ativo" value={other} onChange={setOther} options={state.assets.filter((a) => a.id !== asset.id).map((a) => ({ value: a.id, label: a.code }))}
          error={dup ? "Esta relação já existe." : undefined} />
      </FormDialog>
    </>
  )
}

function AssetDialog({ existing, now, onClose, onSaved }: { existing: Asset | null; now: string; onClose: () => void; onSaved: (a: Asset, isNew: boolean) => Promise<void> }) {
  const { state } = useRegistry()
  const [code, setCode] = useState(existing?.code ?? "")
  const [name, setName] = useState(existing?.name ?? "")
  const [typeId, setTypeId] = useState(existing?.typeId ?? "")
  const [aliases, setAliases] = useState(existing?.aliases.join(", ") ?? "")
  const [status, setStatus] = useState<Status>(existing?.status ?? "ativo")
  const [locs, setLocs] = useState<string[]>(existing?.locationIds ?? [])
  const taken = state.assets.some((a) => a.code.toLowerCase() === code.trim().toLowerCase() && a.id !== existing?.id)
  const codeLong = code.trim().length > 64, nameLong = name.trim().length > 200
  // An inactive place takes no new assets; one already linked stays listed so it can be removed.
  const locOptions = state.locations
    .filter((l) => l.status !== "inativo" || locs.includes(l.id))
    .map((l) => ({
      id: l.id,
      label: l.name,
      detail: parentsOf(state.locations, l.id) || undefined,
      note: l.status === "inativo" ? "Inativo" : l.status === "em_revisao" ? "Em revisão" : undefined,
      noteTone: l.status === "inativo" ? ("neutral" as const) : ("attention" as const),
      icon: locationIcon(state.locationTypes.find((t) => t.id === l.typeId)),
    }))
  const missing = [!code.trim() && "Tag", !name.trim() && "Nome", !typeId && "Tipo", locs.length === 0 && "um local"].filter((x): x is string => !!x)

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Editar ativo" : "Novo ativo"}
      description="Ativo e seus locais."
      valid={!!code.trim() && !!name.trim() && !!typeId && locs.length > 0 && !taken && !codeLong && !nameLong}
      missing={missing}
      onSubmit={() =>
        onSaved(
          existing
            ? { ...existing, code: code.trim(), name: name.trim(), typeId, aliases: splitAliases(aliases), status, locationIds: locs }
            : { id: newId(), unitId: state.units[0].id, revision: 1, updatedAt: now, origin: "manual", status, typeId, code: code.trim(), name: name.trim(), aliases: splitAliases(aliases), locationIds: locs },
          !existing
        )
      }
    >
      <TextField label="Tag" value={code} onChange={setCode} error={taken ? "Esta tag já existe." : codeLong ? "No máximo 64 caracteres." : undefined} />
      <TextField label="Nome" value={name} onChange={setName} error={nameLong ? "No máximo 200 caracteres." : undefined} />
      <SelectField label="Tipo" value={typeId} onChange={setTypeId} options={state.assetTypes.filter((t) => t.active || t.id === existing?.typeId).map((t) => ({ value: t.id, label: t.label }))} />
      <TextField label="Apelidos" value={aliases} onChange={setAliases} placeholder="separados por vírgula" />
      {existing && <SelectField label="Situação" value={status} onChange={(v) => setStatus(v as Status)} options={STATUS_OPTIONS} />}
      <Field>
        <FieldLabel>Locais</FieldLabel>
        <PickList options={locOptions} value={locs} onChange={setLocs} addLabel="Escolher locais" ariaLabel="Locais do ativo" empty="Escolha ao menos um local." />
      </Field>
    </FormDialog>
  )
}

/** "Prédio › Linha 02": the parents of a place, without the place itself. */
function parentsOf(locs: Location[], id: string) {
  return locationPath(locs, id).slice(0, -1).map((p) => p.name).join(" › ")
}

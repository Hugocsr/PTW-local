import { useEffect, useMemo, useState } from "react"
import { ArrowRightIcon, BanIcon, ChevronRightIcon, ExternalLinkIcon, PencilIcon, RotateCcwIcon, ShieldIcon } from "lucide-react"
import { attrText, optionLabel, protectionOf, AREA_FIELDS, EQUIPMENT_FIELDS, PLANT_FIELDS, PROTECTION_PRINCIPLES, PROTECTION_TYPES } from "@/core/assetAttrs"
import { childLocations, equipmentChain, locationChain, locationKind, type NodeKind } from "@/core/assetTree"
import { isOpen } from "@/core/equipmentLock"
import { byId } from "@/core/indexes"
import { useData, useEquipmentHolds } from "@/data/hooks"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import type { Asset, Location } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { Button } from "@/components/ui/button"
import { PermitStateBadge } from "@/components/work/state"
import { navigate, openPermit } from "@/components/work/nav"
import { cn } from "@/lib/utils"
import { DataGrid, Datum, KIND, SheetData, StatusDot } from "./shared"

export interface DetailActions {
  onEdit: () => void
  onToggleStatus: () => void
  onSelect: (id: string) => void
}

/** The record beside the tree (SGI · Painel de detalhe): path, icon, name, code, status, actions and the sheet. */
export function NodeDetail({ kind, id, actions }: { kind: NodeKind; id: string; actions: DetailActions }) {
  const { state } = useRegistry()
  const port = useData()
  const [read, setRead] = useState<{ id: string; error: string } | null>(null)
  const asset = kind === "equip" ? byId(state.assets, id) : undefined
  useEffect(() => {
    if (kind !== "equip" || asset || !port.registry.loadAsset) return
    let live = true
    void port.registry.loadAsset(id).then((r) => { if (live) setRead({ id, error: "message" in r ? r.message : "" }) })
    return () => { live = false }
  }, [kind, id, asset, port])
  if (kind === "equip") {
    if (!asset) return <Panel><p role="status" className="p-6 type-meta">{read?.id === id ? read.error || "Equipamento não encontrado." : "Carregando equipamento…"}</p></Panel>
    return <EquipmentDetail asset={asset} actions={actions} />
  }
  const loc = byId(state.locations, id)
  if (!loc) return <Panel><p className="p-6 type-meta">Local não encontrado.</p></Panel>
  return <LocationDetail loc={loc} actions={actions} />
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section aria-label="Detalhe" className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">{children}</section>
}

function Header({ kind, path, title, meta, status, feminine, actions }: {
  kind: NodeKind; path: { id: string; name: string }[]; title: string; meta: string; status: Location["status"]; feminine: boolean; actions: DetailActions
}) {
  const sim = useSim()
  const Icon = KIND[kind].icon
  const off = status === "inativo"
  return (
    <header className="flex flex-col gap-3 border-b p-5">
      <nav aria-label="Caminho" className="flex min-w-0 flex-wrap items-center gap-1 type-meta">
        <span>Gestão de Ativos</span>
        {path.map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRightIcon className="size-3" aria-hidden />
            <button type="button" className="min-h-6 hover:text-foreground hover:underline focus-ring" onClick={() => actions.onSelect(p.id)}>{p.name}</button>
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", KIND[kind].tile)}><Icon className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-xl leading-7 font-semibold tracking-tight break-words">{title}</h2>
          <p className="font-mono text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusDot status={status} feminine={feminine} />
          {sim.canEditRegistry && <>
            <Button variant="outline" className="min-h-11 md:min-h-9" disabled={sim.serverDown} onClick={actions.onEdit}><PencilIcon data-icon="inline-start" />Editar</Button>
            <Button variant="outline" disabled={sim.serverDown} onClick={actions.onToggleStatus}
              className={cn("min-h-11 md:min-h-9", off ? "" : "border-st-ok-solid text-st-ok-fg hover:bg-st-ok-surface hover:text-st-ok-fg")}>
              {off ? <RotateCcwIcon data-icon="inline-start" /> : <BanIcon data-icon="inline-start" />}{off ? "Reativar" : "Desativar"}
            </Button>
          </>}
        </div>
      </div>
    </header>
  )
}

function LocationDetail({ loc, actions }: { loc: Location; actions: DetailActions }) {
  const { state } = useRegistry()
  const kind = locationKind(loc, state.locationTypes)
  const chain = locationChain(state.locations, loc.id).slice(0, -1).map((x) => ({ id: x, name: byId(state.locations, x)?.name ?? "" }))
  const kids = childLocations(state.locations, loc.id)
  const parent = loc.parentId ? byId(state.locations, loc.parentId) : undefined
  return (
    <Panel>
      <Header kind={kind} path={chain} title={loc.name} meta={`${KIND[kind].noun} · ${loc.code}`} status={loc.status} feminine actions={actions} />
      <div className="flex flex-col gap-5 p-5">
        <DataGrid>
          {kind === "area" && <Datum label="Planta">{parent?.name}</Datum>}
          {kind === "area" && <Datum label="Tipo">{label(state.locationTypes, loc.typeId)}</Datum>}
          <Datum label="Código" mono>{loc.code}</Datum>
          {kind === "planta" && <Datum label="Áreas">{String(kids.length)}</Datum>}
          {kind === "area" && kids.length > 0 && <Datum label="Sublocais">{kids.map((k) => k.name).join(", ")}</Datum>}
          <SheetData fields={kind === "planta" ? PLANT_FIELDS : AREA_FIELDS} attrs={loc.attrs} />
          {loc.aliases.length > 0 && <Datum label="Apelidos" full>{loc.aliases.join(", ")}</Datum>}
        </DataGrid>
        <LegacyLink href={`#local/${loc.id}`} text="Pessoas com cargo, ativos e histórico do local" />
      </div>
    </Panel>
  )
}

function EquipmentDetail({ asset, actions }: { asset: Asset; actions: DetailActions }) {
  const { state } = useRegistry()
  const { permits } = usePermits()
  const port = useData()
  const holds = useEquipmentHolds([asset.id])
  const partOf = useMemo(() => state.relationKinds.filter((k) => k.systemKey === "parte_de").map((k) => k.id), [state.relationKinds])
  const parents = useMemo(() => new Map(state.relations.filter((r) => partOf.includes(r.kindId)).map((r) => [r.fromId, r.toId])), [state.relations, partOf])
  const locId = asset.locationIds[0]
  const locPath = locId ? locationChain(state.locations, locId).map((x) => ({ id: x, name: byId(state.locations, x)?.name ?? "" })) : []
  const eqPath = equipmentChain(asset.id, parents).slice(0, -1).map((x) => ({ id: x, name: byId(state.assets, x)?.name ?? "Equipamento" }))
  const parentEq = eqPath.at(-1)
  const area = locId ? byId(state.locations, locId) : undefined
  const prot = protectionOf(asset.attrs)
  const onIt = port.whole
    ? permits.filter((p) => p.assetIds.includes(asset.id) && isOpen(p)).map((p) => ({ id: p.id, number: p.number, state: p.state }))
    : [...new Map(holds.items.map((h) => [h.permitId, { id: h.permitId, number: h.number, state: h.state }])).values()]
  return (
    <Panel>
      <Header kind="equip" path={[...locPath, ...eqPath]} title={asset.name} meta={`Equipamento · ${attrText(asset.attrs, "equnr") || asset.code}`} status={asset.status} feminine={false} actions={actions} />
      <div className="flex flex-col gap-5 p-5">
        <DataGrid>
          <Datum label="Nó pai">{parentEq ? `Equipamento: ${parentEq.name}` : area ? `Área: ${area.name}` : ""}</Datum>
          <Datum label="Código / TAG" mono>{asset.code}</Datum>
          <Datum label="Tipo">{label(state.assetTypes, asset.typeId)}</Datum>
          <SheetData fields={EQUIPMENT_FIELDS} attrs={asset.attrs} />
          {asset.locationIds.length > 1 && <Datum label="Também em" full>{asset.locationIds.slice(1).map((l) => byId(state.locations, l)?.name ?? "").join(", ")}</Datum>}
        </DataGrid>

        <section aria-labelledby="prot" className="flex flex-col gap-3 border-t pt-5">
          <h3 id="prot" className="flex items-center gap-2 type-heading">
            <ShieldIcon className={cn("size-4", prot ? "text-kind-equip" : "text-muted-foreground")} aria-hidden />É dispositivo de proteção
            <span className={cn("rounded-full px-2 py-0.5 type-meta font-semibold", prot ? "bg-st-attention-surface text-st-attention-fg" : "bg-st-neutral-surface text-st-neutral-fg")}>{prot ? "Sim" : "Não"}</span>
          </h3>
          {prot && (
            <div className="rounded-lg border border-st-attention-border bg-st-attention-surface p-4 [&_.type-label]:text-st-attention-fg">
              <DataGrid>
                <Datum label="Tipo de proteção">{optionLabel(PROTECTION_TYPES, prot.tipo)}</Datum>
                <Datum label="Princípio de ação">{optionLabel(PROTECTION_PRINCIPLES, prot.principio)}</Datum>
                <Datum label="Procedimento de bypass" full>{prot.bypass}</Datum>
                <Datum label="Sistema de controle">{prot.sistema}</Datum>
                <Datum label="Classe de risco padrão">{prot.classeRisco}</Datum>
                <Datum label="Equipamentos adicionais protegidos" full>
                  {prot.protegidos.length === 0 ? "" : (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {prot.protegidos.map((pid) => {
                        const other = byId(state.assets, pid)
                        return <button key={pid} type="button" className="underline-offset-2 hover:underline focus-ring" onClick={() => actions.onSelect(pid)}>{other?.name ?? "Equipamento"}</button>
                      })}
                    </span>
                  )}
                </Datum>
              </DataGrid>
            </div>
          )}
        </section>

        <section aria-labelledby="pts" className="flex flex-col gap-2 border-t pt-5">
          <h3 id="pts" className="type-heading">PTs abertas neste equipamento</h3>
          {!port.whole && holds.loading ? <p role="status" className="type-meta">Consultando as PTs…</p>
            : !port.whole && holds.error ? <p role="alert" className="type-meta">Não foi possível consultar: {holds.error.message}</p>
            : onIt.length === 0 ? <p className="type-meta">Nenhuma PT prende este equipamento agora.</p>
            : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {onIt.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openPermit(p.id)} className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-surface-canvas focus-ring md:min-h-9">
                      <span className="font-mono text-xs">{p.number ?? "PT sem número"}</span>
                      <PermitStateBadge state={p.state} />
                      <ArrowRightIcon className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <LegacyLink href={`#ativo/${asset.id}`} text="Relações, locais e histórico completo do equipamento" />
      </div>
    </Panel>
  )
}

function LegacyLink({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} onClick={(e) => { e.preventDefault(); navigate(href.slice(1)) }}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-ring">
      <ExternalLinkIcon className="size-3.5" aria-hidden />{text}
    </a>
  )
}

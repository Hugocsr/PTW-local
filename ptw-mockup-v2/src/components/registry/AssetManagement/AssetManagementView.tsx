import { useCallback, useMemo, useState } from "react"
import { FactoryIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { runAsUndo } from "@/audit/store"
import { locationKind, nextLevel, partOfKindIds, partParents, plantsOf, selectionPath, type NodeKind } from "@/core/assetTree"
import { byId } from "@/core/indexes"
import { useRegistry } from "@/registry/store"
import type { Asset, Location } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { DownBanner } from "@/components/work/state"
import { navigate } from "@/components/work/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { NodeDetail } from "./Detail"
import { NodeDialog, type NodeDialogMode } from "./NodeDialog"
import { AssetTree, type TreeSelection } from "./Tree"

/**
 * Gestão de Ativos (SGI Forces · UC-BACK-01): one screen for places and equipment. The tree on the left
 * (Planta → Área → Equipamento → equipamento aninhado), the record on the right, and the primary button
 * creates the next level under what is selected: Nova área, Novo equipamento, Equip. aninhado.
 * `#ativos` opens on the first plant; `#ativos/<id>` (and the old `#locais/<id>`) on that record.
 */
export function AssetManagementView({ recordId }: { recordId?: string }) {
  const { state, update } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown
  const [query, setQuery] = useState("")
  const [dialog, setDialog] = useState<NodeDialogMode | null>(null)
  const [confirm, setConfirm] = useState<{ kind: NodeKind; record: Location | Asset } | null>(null)
  const parents = useMemo(() => partParents(state.relations, partOfKindIds(state.relationKinds)), [state.relations, state.relationKinds])
  const firstPlant = plantsOf(state.locations)[0]?.id ?? null
  const id = recordId ?? firstPlant
  const loc = id ? byId(state.locations, id) : undefined
  const kind: NodeKind | null = !id ? null : loc ? locationKind(loc, state.locationTypes) : "equip"
  const asset = kind === "equip" && id ? byId(state.assets, id) : undefined

  // Open/closed by the person; anything never touched is open when it is on the path to the selected record.
  const [touched, setTouched] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const path = useMemo(() => selectionPath(state.locations, state.assets, parents, id), [state.locations, state.assets, parents, id])
  const expanded = useMemo(() => {
    const out = new Set([...touched].filter(([, open]) => open).map(([k]) => k))
    for (const x of path) if (touched.get(x) !== false) out.add(x)
    return out
  }, [touched, path])
  const toggle = useCallback((nodeId: string, open?: boolean) => setTouched((m) => {
    const now = m.get(nodeId)
    const want = open ?? !(now ?? expanded.has(nodeId))
    if (now === want) return m
    return new Map(m).set(nodeId, want)
  }), [expanded])
  const select = useCallback((s: TreeSelection | string) => navigate(`ativos/${typeof s === "string" ? s : s.id}`), [])

  const next = nextLevel(kind)
  const create = () => {
    if (!id || next.create === "planta") return setDialog({ level: "planta" })
    if (next.create === "area") return setDialog({ level: "area", plantId: id })
    if (next.create === "equip") return setDialog({ level: "equip", areaId: id })
    setDialog({ level: "equip", parentAssetId: id })
  }
  const edit = () => {
    if (loc) setDialog({ level: kind === "planta" ? "planta" : "area", existing: loc })
    else if (asset) setDialog({ level: "equip", existing: asset })
  }
  const setStatus = async (k: NodeKind, r: Location | Asset, status: Location["status"]) =>
    k === "equip" ? update<Asset>("assets", r.id, (a) => ({ ...a, status })) : update<Location>("locations", r.id, (l) => ({ ...l, status }))
  const toggleStatus = async () => {
    if (!confirm) return
    const { kind: k, record } = confirm
    const before = record.status
    const after = before === "inativo" ? "ativo" : "inativo"
    setConfirm(null)
    if (!await setStatus(k, record, after)) return
    toast(after === "inativo" ? `${record.name} desativado` : `${record.name} reativado`, { action: { label: "Desfazer", onClick: () => runAsUndo(() => setStatus(k, record, before)) } })
  }

  const canEdit = sim.canEditRegistry
  const empty = state.locations.length === 0
  return (
    <Page className="max-w-[80rem]">
      <PageHeader title="Gestão de Ativos"
        meta="Cadastro único e hierárquico: plantas, áreas e equipamentos"
        actions={canEdit ? {
          secondary: empty || next.create === "planta" ? [] : [{ label: "Nova planta", icon: FactoryIcon, disabled: down, onClick: () => setDialog({ level: "planta" }) }],
          primary: { label: next.label, icon: PlusIcon, disabled: down || (kind === "equip" && !asset), onClick: create },
        } : undefined} />
      {down && <DownBanner now={sim.now} />}
      {empty ? (
        <Empty className="rounded-lg border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FactoryIcon /></EmptyMedia>
            <EmptyTitle>Nenhum ativo cadastrado</EmptyTitle>
            <EmptyDescription>Cadastre a primeira planta para começar a montar a árvore.</EmptyDescription>
          </EmptyHeader>
          {canEdit && <EmptyContent><Button disabled={down} onClick={() => setDialog({ level: "planta" })}><PlusIcon data-icon="inline-start" />Nova planta</Button></EmptyContent>}
        </Empty>
      ) : (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(19rem,25rem)_minmax(0,1fr)]">
          <section aria-label="Árvore de ativos" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2) lg:sticky lg:top-20 lg:max-h-[calc(100svh-7rem)]">
            <div className="border-b p-3">
              <div className="relative">
                <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Buscar por nome, código ou TAG" placeholder="Buscar por nome, código ou TAG" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 pr-9 pl-9 md:min-h-9" />
                {query && <Button variant="ghost" size="icon-sm" aria-label="Limpar busca" className="absolute top-1/2 right-1 -translate-y-1/2" onClick={() => setQuery("")}><XIcon /></Button>}
              </div>
            </div>
            <div className="min-h-0 overflow-y-auto p-2">
              <AssetTree query={query} selected={id} expanded={expanded} onSelect={select} onToggle={toggle} parents={parents} />
            </div>
          </section>
          {id && kind && <NodeDetail kind={kind} id={id} actions={{ onEdit: edit, onSelect: select, onToggleStatus: () => { const r = loc ?? asset; if (r) setConfirm({ kind, record: r }) } }} />}
        </div>
      )}
      {dialog && <NodeDialog mode={dialog} onClose={() => setDialog(null)} onSaved={(newId) => { setDialog(null); select(newId) }} />}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.record.status === "inativo" ? "Reativar" : "Desativar"} {confirm ? `“${confirm.record.name}”` : ""}?</DialogTitle>
            <DialogDescription>
              {confirm?.record.status === "inativo"
                ? "Volta a ser oferecido para novas PTs."
                : confirm?.kind === "equip" ? "O equipamento deixa de receber PTs. O histórico continua e ele pode ser reativado." : "O local deixa de ser oferecido para novas PTs e cadastros. O histórico continua e ele pode ser reativado."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant={confirm?.record.status === "inativo" ? "default" : "stop"} onClick={() => void toggleStatus()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

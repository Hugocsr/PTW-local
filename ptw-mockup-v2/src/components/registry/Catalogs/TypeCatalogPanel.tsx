import { useState } from "react"
import { ArrowLeftIcon, ArrowRightIcon, HardHatIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { runAsUndo } from "@/audit/store"
import { filterItems, TYPE_CATALOG_ABOUT, typeActions, typeInUse, typeUsage, type ActiveFilter, type TypeCatalog } from "@/core/catalogs"
import { useAssetTypeCounts } from "@/data/hooks"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Button } from "@/components/ui/button"
import { assetIcon, locationIcon, LockedReason, TypeIconPicker } from "../common"
import { CatalogIcon } from "./CatalogsView"
import { ActiveSwitch, AddRow, FilterSelect, InfoTip, ItemRow, ItemSearch, SavedName } from "./shared"

/** Name of a type: 1 to 80 characters (database). */
const MAX_LABEL = 80

/**
 * One type family in Catálogos (SPEC 005): every type as a row (icon, name, usage, Ativo, Remover),
 * alphabetical. System types (Planta, Área, "é parte de") are renamed only.
 */
export function TypeCatalogPanel({ catalog, onBack }: { catalog: TypeCatalog; onBack: () => void }) {
  const { state, addType, renameType, removeType, restoreType, setTypeIcon, setTypeActive } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown, edit = sim.canEditRegistry
  const [filter, setFilter] = useState<ActiveFilter>("todos")
  const [q, setQ] = useState("")
  const key = catalog.key
  const all = state[key]
  const items = filterItems(all, filter, q, (t) => t.label).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  const dup = (label: string, exceptId?: string) => all.some((t) => t.label.trim().toLowerCase() === label.trim().toLowerCase() && t.id !== exceptId)
  const problem = (v: string, exceptId?: string) => !v.trim() ? "Informe um nome." : v.trim().length > MAX_LABEL ? `No máximo ${MAX_LABEL} caracteres.` : dup(v, exceptId) ? "Já existe um tipo com este nome." : null
  const relation = key === "relationKinds"
  // With the server the asset list is not cached: the asset counts of each type come from the API.
  const assetCounts = useAssetTypeCounts(key === "assetTypes" ? all.map((t) => t.id) : [])
  const nAssets = (id: string) => (key === "assetTypes" ? assetCounts.counts?.get(id) : undefined)
  const counting = key === "assetTypes" && !assetCounts.counts
  const total = all.reduce((n, t) => n + (typeUsage(state, key, t.id, nAssets(t.id)) ? 1 : 0), 0)

  return (
    <section aria-labelledby="catalog-h" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">
      <header className="flex flex-col gap-2 border-b p-4 md:p-5">
        <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground lg:hidden" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Catálogos</Button>
        <div className="flex items-center gap-3">
          <CatalogIcon id={catalog.id} />
          <div className="min-w-0">
            <h2 id="catalog-h" className="text-xl leading-7 font-semibold">{catalog.title}</h2>
            <p className="type-meta">{TYPE_CATALOG_ABOUT[catalog.id]} · {total} de {all.length} em uso</p>
          </div>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-5">
        <FilterSelect value={filter} onChange={setFilter} />
        <ItemSearch value={q} onChange={setQ} />
        <InfoTip label="Sobre os tipos deste catálogo">Tipos em uso não podem ser removidos, só desativados. Os do sistema (com cadeado) só podem ser renomeados.</InfoTip>
        <span role="status" className="ml-auto type-meta">{items.length} de {all.length} {all.length === 1 ? "tipo" : "tipos"} · ordem alfabética</span>
      </div>
      {items.length === 0 ? <p className="p-6 text-center type-meta">{!all.length ? "Nenhum tipo cadastrado." : q.trim() ? `Nenhum tipo com “${q.trim()}” neste filtro.` : "Nenhum tipo neste filtro."}</p> : (
        <ul aria-label={`Itens de ${catalog.title}`}>
          {items.map((t) => {
            const used = counting || typeInUse(state, key, t.id, nAssets(t.id))
            const act = typeActions(t, used)
            const usage = counting ? "Contando o uso…" : typeUsage(state, key, t.id, nAssets(t.id))
            const Icon = key === "locationTypes" ? locationIcon(t) : key === "assetTypes" ? assetIcon(t) : key === "roleTypes" ? ShieldCheckIcon : key === "workTypes" ? HardHatIcon : ArrowRightIcon
            const media = (key === "locationTypes" || key === "assetTypes") && edit
              ? <TypeIconPicker type={t} family={key} disabled={down} onPick={(icon) => setTypeIcon(key, t.id, icon)} />
              : <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-md border text-muted-foreground md:size-9"><Icon className="size-4" /></span>
            const name = edit
              ? <div className="flex items-center gap-2">
                  {relation && <span className="type-data shrink-0 rounded bg-muted px-1.5">A</span>}
                  <SavedName value={t.label} label={`Nome do tipo ${t.label}`} readOnly={down} problem={(v) => problem(v, t.id)} onSave={(v) => renameType(key, t.id, v)} />
                  {relation && <><ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="type-data shrink-0 rounded bg-muted px-1.5">B</span></>}
                </div>
              : <span className="type-body">{relation ? `A ${t.label} B` : t.label}</span>
            return (
              <ItemRow key={t.id} muted={!t.active} media={media} name={name}
                usage={act.locked ? "Usado pelas regras do sistema" + (usage ? ` · ${usage}` : "") : usage || "Sem uso"}
                actions={act.locked ? (edit ? <LockedReason label={`${t.label} é do sistema: não pode ser removido nem desativado`}
                    reason={key === "relationKinds" ? "Define o aninhamento e a trava de equipamento (um equipamento, uma PT aberta). Pode ser renomeado." : "Define o nível da Gestão de Ativos (planta ou área). Pode ser renomeado."} /> : undefined)
                  : <>
                      <ActiveSwitch active={t.active} name={t.label} disabled={down}
                        onChange={edit ? async (v) => { if (await setTypeActive(key, t.id, v)) toast(v ? "Tipo reativado" : "Tipo desativado", { description: t.label }) } : undefined} />
                      {edit && <Button variant="outline" size="icon" className="size-11 md:size-9" aria-label={act.remove ? `Remover ${t.label}` : `${t.label} em uso: não pode ser removido`}
                        title={act.remove ? "Remover" : "Em uso: desative para deixar de oferecer"} disabled={down || !act.remove}
                        onClick={async () => {
                          const at = all.indexOf(t)
                          if (!await removeType(key, t.id)) return
                          toast("Tipo removido", { description: t.label, action: { label: "Desfazer", onClick: () => runAsUndo(() => restoreType(key, t, at)) } })
                        }}><Trash2Icon /></Button>}
                    </>} />
            )
          })}
        </ul>
      )}
      {edit && <AddRow placeholder={`${catalog.newLabel}…`} problem={(v) => problem(v)} disabled={down}
        onAdd={async (v) => { if (!await addType(key, v)) return false; toast.success(q.trim() && !filterItems([{ active: true, label: v }], filter, q, (t) => t.label).length ? "Tipo adicionado: limpe a busca para vê-lo" : "Tipo adicionado", { description: v }); return true }} />}
    </section>
  )
}

import { useState } from "react"
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { filterItems, listUses, moveItem, type ActiveFilter } from "@/core/catalogs"
import { newId, useRegistry } from "@/registry/store"
import type { OptionList } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CatalogIcon } from "./CatalogsView"
import { ListNameDialog } from "./ListNameDialog"
import { ActiveSwitch, AddRow, FilterSelect, InfoTip, ItemRow, ItemSearch, SavedName } from "./shared"

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
/** Database size of an item: 1–200. */
const MAX_ITEM = 200

/**
 * One option list in Catálogos (SPEC 005): items in their order (subir/descer), name, Ativo. Items are
 * never removed (answers point at them); the list is removed only when no model uses it.
 */
export function ListCatalogPanel({ list, onBack, onRemoved }: { list: OptionList; onBack: () => void; onRemoved: () => void }) {
  const { state, upsert, removeOptionList } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown, edit = sim.canEditRegistry
  const [filter, setFilter] = useState<ActiveFilter>("todos")
  const [q, setQ] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const uses = listUses(state, list.id)
  const save = (patch: Partial<OptionList>) => upsert("optionLists", { ...list, ...patch })
  const problem = (label: string, except?: string) => {
    if (!label.trim()) return "Informe o item."
    if (label.trim().length > MAX_ITEM) return `No máximo ${MAX_ITEM} caracteres.`
    const twin = list.items.find((i) => i.id !== except && same(i.label, label))
    return twin ? (twin.active ? "Este item já existe." : "Este item já existe, inativo: reative-o na lista.") : null
  }
  const shown = filterItems(list.items, filter, q, (i) => i.label)
  // With a search on, moving an item could swap it with one that is not on screen (SPEC 006).
  const searching = !!q.trim()
  const active = list.items.filter((i) => i.active).length

  return (
    <section aria-labelledby="catalog-h" className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2)">
      <header className="flex flex-col gap-2 border-b p-4 md:p-5">
        <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground lg:hidden" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />Catálogos</Button>
        <div className="flex flex-wrap items-start gap-3">
          <CatalogIcon id={`lista/${list.id}`} />
          <div className="min-w-0 flex-1">
            <h2 id="catalog-h" className="text-xl leading-7 font-semibold break-words">{list.name}</h2>
            <p className="type-meta">
              Lista de opções · {active} {active === 1 ? "item ativo" : "itens ativos"}{list.items.length > active ? ` · ${list.items.length - active} inativo(s)` : ""} ·{" "}
              {uses.length ? `usada em ${uses.length} ${uses.length === 1 ? "modelo" : "modelos"}: ${uses.join(", ")}` : "nenhum modelo usa esta lista"}
            </p>
          </div>
          {edit && (
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="outline" size="sm" className="min-h-11 flex-1 md:min-h-9 sm:flex-none" disabled={down} onClick={() => setRenaming(true)}><PencilIcon data-icon="inline-start" />Renomear</Button>
              <Button variant="outline" size="sm" className="min-h-11 flex-1 border-st-stop-solid/50 text-st-stop-fg hover:bg-st-stop-surface md:min-h-9 sm:flex-none" disabled={down || uses.length > 0}
                title={uses.length ? "Em uso por modelos: não pode ser removida" : undefined} onClick={() => setRemoving(true)}><Trash2Icon data-icon="inline-start" />Remover</Button>
            </div>
          )}
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-5">
        <FilterSelect value={filter} onChange={setFilter} />
        <ItemSearch value={q} onChange={setQ} />
        <InfoTip label="Sobre os itens desta lista">Itens não são removidos: inative para deixar de oferecer. Respostas antigas continuam legíveis.</InfoTip>
        <span role="status" className="ml-auto type-meta">{shown.length} de {list.items.length} {list.items.length === 1 ? "item" : "itens"}</span>
      </div>
      {shown.length === 0 ? <p className="p-6 text-center type-meta">{!list.items.length ? "Nenhum item ainda." : searching ? `Nenhum item com “${q.trim()}” neste filtro.` : "Nenhum item neste filtro."}</p> : (
        <ol aria-label={`Itens de ${list.name}`}>
          {shown.map((it) => {
            const k = list.items.indexOf(it)
            const media = (
              <div className="flex shrink-0 items-center gap-1">
                <span className="w-6 text-right type-meta tabular-nums">{k + 1}</span>
                {edit && <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="h-5.5 w-11 md:w-8" aria-label={`Subir ${it.label}`} title={searching ? "Limpe a busca para reordenar" : undefined} disabled={down || searching || k === 0}
                    onClick={() => save({ items: moveItem(list.items, k, -1) })}><ChevronUpIcon /></Button>
                  <Button variant="ghost" size="icon" className="h-5.5 w-11 md:w-8" aria-label={`Descer ${it.label}`} title={searching ? "Limpe a busca para reordenar" : undefined} disabled={down || searching || k === list.items.length - 1}
                    onClick={() => save({ items: moveItem(list.items, k, 1) })}><ChevronDownIcon /></Button>
                </div>}
              </div>
            )
            return (
              <ItemRow key={it.id} muted={!it.active} media={media}
                name={edit ? <SavedName value={it.label} label={`Item ${k + 1}`} readOnly={down} problem={(v) => problem(v, it.id)}
                  onSave={(label) => save({ items: list.items.map((x) => (x.id === it.id ? { ...x, label } : x)) })} /> : <span className="type-body">{it.label}</span>}
                actions={<ActiveSwitch active={it.active} name={it.label} disabled={down}
                  onChange={edit ? (v) => void save({ items: list.items.map((x) => (x.id === it.id ? { ...x, active: v } : x)) }) : undefined} />} />
            )
          })}
        </ol>
      )}
      {edit && <AddRow placeholder="Novo item…" problem={(v) => problem(v)} disabled={down}
        onAdd={async (v) => {
          if (!await save({ items: [...list.items, { id: newId(), label: v, active: true }] })) return false
          if (searching && !filterItems([{ active: true, label: v }], filter, q, (i) => i.label).length) toast("Item adicionado: limpe a busca para vê-lo", { description: v })
          return true
        }} />}

      {renaming && <ListNameDialog list={list} onClose={() => setRenaming(false)}
        onSave={async (name) => { if (!await save({ name })) return; toast.success("Lista renomeada", { description: name }); setRenaming(false) }} />}
      <Dialog open={removing} onOpenChange={(o) => !o && setRemoving(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover a lista “{list.name}”?</DialogTitle>
            <DialogDescription>Leva junto {list.items.length} {list.items.length === 1 ? "item" : "itens"}. Nenhum modelo usa esta lista.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setRemoving(false)}>Cancelar</Button>
            <Button variant="stop" className="min-h-11 md:min-h-9" disabled={down}
              onClick={async () => { if (!await removeOptionList(list.id)) return; setRemoving(false); toast("Lista removida", { description: list.name }); onRemoved() }}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

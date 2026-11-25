import { useMemo, useState } from "react"
import { ArrowRightIcon, BoxIcon, ListIcon, MapPinIcon, PlusIcon, SearchIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { catalogOf, isListCatalog, listCatalogId, listIdOf, searchCatalogs, TYPE_CATALOGS, typeCatalog, type CatalogId, type TypeCatalogId } from "@/core/catalogs"
import { cn } from "@/lib/utils"
import { newId, useRegistry } from "@/registry/store"
import type { OptionList } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { navigate } from "@/components/work/nav"
import { DownBanner } from "@/components/work/state"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ListCatalogPanel } from "./ListCatalogPanel"
import { ListNameDialog } from "./ListNameDialog"
import { TypeCatalogPanel } from "./TypeCatalogPanel"

const TYPE_ICON: Record<TypeCatalogId, LucideIcon> = { "tipos-local": MapPinIcon, "tipos-ativo": BoxIcon, cargos: ShieldCheckIcon, relacoes: ArrowRightIcon }

/** The square icon of a catalog: navy for type families, soft indigo for option lists. */
export function CatalogIcon({ id }: { id: CatalogId }) {
  const list = isListCatalog(id)
  const Icon = list ? ListIcon : TYPE_ICON[id as TypeCatalogId]
  return <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", list ? "bg-primary-soft text-primary" : "bg-brand-navy text-white")}><Icon className="size-[1.125rem]" /></span>
}

/**
 * Configuração › Catálogos (SPEC 005): Tipos (local, ativo, cargos, relações) and Listas de opções in one
 * place. Left: the catalogs, a search over every item and "+ Nova lista"; right: the chosen catalog.
 * `#catalogos/<tipos-local|tipos-ativo|cargos|relacoes|lista/<id>>`; `#tipos` and `#listas` are aliases.
 * Below lg: catalogs → items with "← Catálogos".
 */
export function CatalogsView({ tab }: { tab?: string }) {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const [q, setQ] = useState("")
  const [focus, setFocus] = useState<{ catalog: CatalogId; itemId: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const current = catalogOf(tab, state.optionLists)
  const opened = !!tab
  const lists = useMemo(() => [...state.optionLists].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [state.optionLists])
  const hits = useMemo(() => searchCatalogs(state, q), [state, q])
  const open = (id: CatalogId, itemId?: string | null) => { setFocus(itemId ? { catalog: id, itemId } : null); navigate(`catalogos/${id}`) }
  const list = listIdOf(current) ? state.optionLists.find((l) => l.id === listIdOf(current)) : undefined
  const type = typeCatalog(current)
  const focusId = focus?.catalog === current ? focus.itemId : null
  const total = TYPE_CATALOGS.length + lists.length

  const row = (id: CatalogId, title: string, hint: string, n: number) => (
    <li key={id}>
      <button type="button" onClick={() => open(id)} aria-current={current === id ? "true" : undefined}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring",
          current === id && "lg:border-primary/30 lg:bg-primary-soft")}>
        <CatalogIcon id={id} />
        <span className="min-w-0 flex-1"><span className="block truncate type-body font-semibold">{title}</span><span className="block truncate type-meta">{hint}</span></span>
        <span className="shrink-0 rounded-full bg-muted px-2 type-meta tabular-nums">{n}</span>
      </button>
    </li>
  )

  return (
    <Page className="max-w-[80rem]">
      <PageHeader title="Catálogos" meta="Valores pré-cadastrados que o sistema oferece: tipos de local e de ativo, cargos, relações e listas de opções dos formulários" />
      {sim.serverDown && <DownBanner now={sim.now} />}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <nav aria-label="Catálogos" className={cn("flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card shadow-(--shadow-elev-2) lg:sticky lg:top-20", opened && "max-lg:hidden")}>
          <div className="relative border-b p-3">
            <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar em todos os catálogos" placeholder="Buscar em todos os catálogos" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 pl-9 md:min-h-9" />
          </div>
          {q.trim() ? (
            <ul aria-label="Resultados da busca" className="flex max-h-[calc(100svh-14rem)] flex-col gap-0.5 overflow-y-auto p-2">
              {hits.length === 0 && <li className="p-4 text-center type-meta">Nada encontrado.</li>}
              {hits.map((h) => (
                <li key={`${h.catalog}-${h.itemId ?? "c"}`}>
                  <button type="button" onClick={() => { open(h.catalog, h.itemId); setQ("") }}
                    className="flex min-h-11 w-full flex-col items-start rounded-md px-3 py-1.5 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="type-body font-medium">{h.label}</span>
                    <span className="type-meta">{h.itemId ? h.catalogTitle : isListCatalog(h.catalog) ? "Lista de opções" : "Catálogo de tipos"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex max-h-[calc(100svh-14rem)] flex-col overflow-y-auto pb-2">
              <p className="px-4 pt-3 pb-1 type-label">Tipos</p>
              <ul className="flex flex-col gap-0.5 px-2">{TYPE_CATALOGS.map((c) => row(c.id, c.title, c.hint, state[c.key].filter((t) => t.active).length))}</ul>
              <div className="mt-2 flex items-center justify-between gap-2 border-t px-4 pt-3 pb-1">
                <p className="type-label">Listas de opções</p>
                {sim.canEditRegistry && <Button variant="outline" size="sm" className="min-h-11 text-primary hover:text-primary md:min-h-8" disabled={sim.serverDown} onClick={() => setCreating(true)}><PlusIcon data-icon="inline-start" />Nova lista</Button>}
              </div>
              <ul className="flex flex-col gap-0.5 px-2">
                {lists.length === 0 && <li className="p-3 type-meta">Nenhuma lista ainda.</li>}
                {lists.map((l) => row(listCatalogId(l.id), l.name, "Lista de opções", l.items.filter((i) => i.active).length))}
              </ul>
            </div>
          )}
          <p className="sr-only" role="status">{total} catálogos</p>
        </nav>
        <div className={cn("min-w-0", !opened && "max-lg:hidden")}>
          {list ? <ListCatalogPanel key={list.id} list={list} focusId={focusId} onBack={() => navigate("catalogos")} onRemoved={() => navigate("catalogos/tipos-local")} />
            : type ? <TypeCatalogPanel key={type.id} catalog={type} focusId={focusId} onBack={() => navigate("catalogos")} /> : null}
        </div>
      </div>
      {creating && <ListNameDialog list={null} onClose={() => setCreating(false)}
        onSave={async (name) => {
          const created: OptionList = { id: newId(), name, revision: 1, updatedAt: now(), items: [] }
          if (!await upsert("optionLists", created)) return
          toast.success("Lista criada", { description: name })
          setCreating(false)
          open(listCatalogId(created.id))
        }} />}
    </Page>
  )
}

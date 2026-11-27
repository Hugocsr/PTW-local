import { useCallback, useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, CircleAlertIcon, CogIcon, LoaderCircleIcon, MapPinIcon, SearchIcon } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAssetSearch } from "@/data/hooks"
import { browseRows, choosable, NO_PLACES, placeOfAsset, placePath, PLACE_LOST, reachablePlaces, searchPlaces, type PlaceCounts } from "@/core/locationPicker"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import type { Asset } from "@/registry/types"
import { TONE_BLOCK } from "../shell/Status"

export interface Places { counts: PlaceCounts; loading: boolean; error: { message: string } | null }

const ROW = "flex min-h-11 w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-surface-canvas focus-ring md:min-h-9"

/**
 * The PT's place, picked the way the SGI Front-Office prototype picks equipment: a search on top and, with no
 * search, a list that goes down Planta > Área with "N equip." on each row. Only places with active assets the
 * model accepts are offered (SPEC 017). Picking an asset in the search chooses its place and ticks the asset.
 */
export function PlacePicker({ id, value, onChange, onPickAsset, locationTypeIds, assetTypeIds, places, disabled }: {
  id: string; value: string; onChange: (locationId: string) => void; onPickAsset: (asset: Asset, locationId: string) => void
  locationTypeIds: readonly string[]; assetTypeIds: readonly string[]; places: Places; disabled?: boolean
}) {
  const { state } = useRegistry()
  const { locations, locationTypes } = state
  const { counts } = places
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const reach = useMemo(() => reachablePlaces(locations, locationTypes, locationTypeIds, counts), [locations, locationTypes, locationTypeIds, counts])
  const skip = useCallback((a: Asset) => a.status !== "ativo" || (assetTypeIds.length > 0 && !assetTypeIds.includes(a.typeId)) || !placeOfAsset(a, locations, locationTypes, locationTypeIds, counts), [assetTypeIds, locations, locationTypes, locationTypeIds, counts])
  const searching = query.trim().length > 0
  const assetHits = useAssetSearch(searching ? query : "", 6, skip)
  const found = useMemo(() => searchPlaces(locations, locationTypes, locationTypeIds, counts, query), [locations, locationTypes, locationTypeIds, counts, query])
  const here = openId ? locations.find((l) => l.id === openId) : undefined
  const rows = useMemo(() => browseRows(locations, openId, counts, reach), [locations, openId, counts, reach])
  const chosen = value ? locations.find((l) => l.id === value) : undefined
  const lost = !!value && !places.loading && !(chosen && choosable(chosen, locationTypes, locationTypeIds, counts))
  const pick = (locationId: string) => { onChange(locationId); setQuery(""); setOpenId(null) }

  if (value) return (
    <Field>
      <FieldLabel htmlFor={id}>Local</FieldLabel>
      <div id={id} className={cn("flex items-center gap-3 rounded-md border px-3 py-2", lost ? TONE_BLOCK.stop : "bg-primary-soft")}>
        {lost ? <CircleAlertIcon aria-hidden className="size-5 shrink-0" /> : <MapPinIcon aria-hidden className="size-5 shrink-0 text-primary" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-body font-semibold break-words">{chosen ? chosen.name : "Local escolhido"}</span>
          <span className="type-meta break-words">{chosen ? placePath(locations, chosen.id) : ""}{!lost && counts.get(value) ? ` · ${counts.get(value)} equip.` : ""}</span>
        </span>
        <Button type="button" variant="ghost" className="min-h-11 md:min-h-9" disabled={disabled} onClick={() => onChange("")}>Trocar</Button>
      </div>
      {lost && <Alert className={TONE_BLOCK.stop}><CircleAlertIcon /><AlertDescription>{PLACE_LOST}</AlertDescription></Alert>}
    </Field>
  )

  return (
    <Field>
      <FieldLabel htmlFor={id}>Local</FieldLabel>
      <div className="relative flex items-center">
        <SearchIcon aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} disabled={disabled} autoComplete="off" placeholder="Buscar por local, planta, código ou ativo…" className="min-h-11 pl-9 md:min-h-9" />
      </div>
      {places.loading ? <p role="status" className="flex items-center gap-2 type-meta"><LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden />Buscando locais…</p>
        : places.error ? <p role="alert" className="type-meta text-st-stop-fg">Não foi possível ler os locais: {places.error.message}</p>
        : searching ? (
          <div role="listbox" aria-label="Resultados da busca" className="overflow-hidden rounded-md border bg-card">
            {found.map((l) => (
              <button key={l.id} type="button" role="option" aria-selected={false} className={ROW} onClick={() => pick(l.id)}>
                <MapPinIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col"><span className="type-body font-medium break-words">{l.name}</span><span className="type-meta break-words">{placePath(locations, l.id)}</span></span>
                <span className="type-meta shrink-0">{counts.get(l.id)} equip.</span>
              </button>
            ))}
            {assetHits.items.map((a) => {
              const where = placeOfAsset(a, locations, locationTypes, locationTypeIds, counts)!
              return (
                <button key={a.id} type="button" role="option" aria-selected={false} className={ROW} onClick={() => { onPickAsset(a, where.id); setQuery(""); setOpenId(null) }}>
                  <CogIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col"><span className="type-body font-medium break-words">{a.code} · {a.name}</span><span className="type-meta break-words">{placePath(locations, where.id)}</span></span>
                </button>
              )
            })}
            {found.length === 0 && assetHits.items.length === 0 && <p role="status" className="px-3 py-3 type-meta">{assetHits.loading ? "Buscando…" : "Nenhum local ou ativo ativo aceito pelo modelo encontrado."}</p>}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-card">
            {here && (
              <button type="button" className={cn(ROW, "bg-surface-canvas font-semibold text-primary-hover")} onClick={() => setOpenId(here.parentId)}>
                <ChevronLeftIcon aria-hidden className="size-4 shrink-0" /><MapPinIcon aria-hidden className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{here.name}</span>
              </button>
            )}
            {here && choosable(here, locationTypes, locationTypeIds, counts) && (
              <button type="button" className={ROW} onClick={() => pick(here.id)}>
                <span className="min-w-0 flex-1 type-body font-medium">Escolher {here.name}</span><span className="type-meta shrink-0">{counts.get(here.id)} equip.</span>
              </button>
            )}
            {rows.map((r) => (
              <button key={r.loc.id} type="button" className={ROW} onClick={() => (r.opens ? setOpenId(r.loc.id) : pick(r.loc.id))}>
                <MapPinIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 type-body font-medium break-words">{r.loc.name}</span>
                <span className="type-meta shrink-0">{r.count} equip.</span>
                {r.opens && <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            ))}
            {rows.length === 0 && !(here && choosable(here, locationTypes, locationTypeIds, counts)) && <p role="status" className="px-3 py-3 type-meta">{here ? "Nenhum item ativo nesta planta ou área." : NO_PLACES}</p>}
          </div>
        )}
      <FieldDescription>Só aparecem locais com ativos ativos aceitos por este modelo.</FieldDescription>
    </Field>
  )
}

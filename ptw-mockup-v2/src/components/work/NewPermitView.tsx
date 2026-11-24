import { useState, type FormEvent } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { CircleAlertIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useData } from "@/data/context"
import { useAssetPage } from "@/data/hooks"
import { addMinutes, instant, wallOf } from "@/core/time"
import { uuidv7 } from "@/lib/id"
import type { Permit } from "@/permit/types"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "../shell/Page"
import { TONE_BLOCK } from "../shell/Status"
import { DownBanner } from "./state"
import { dmHms } from "@/core/time"
import { navigate, openPermit } from "./nav"

function Choice({ id, label: title, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[]; disabled?: boolean }) {
  return <Field><FieldLabel htmlFor={id}>{title}</FieldLabel><Select value={value} onValueChange={onChange} disabled={disabled} required><SelectTrigger id={id} className="min-h-11 w-full md:min-h-9"><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent><SelectGroup>{options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
}

/** A draft is created once in the database, before the permit form can be answered. */
export function NewPermitView({ permit, onBack }: { permit?: Permit; onBack?: () => void }) {
  const { state } = useRegistry()
  const sim = useSim()
  const port = useData()
  const [id] = useState(uuidv7)
  const [templateId, setTemplateId] = useState(permit?.templateId ?? "")
  const [locationId, setLocationId] = useState(permit?.locationId ?? "")
  const [scope, setScope] = useState(permit?.scope ?? "")
  const [start, setStart] = useState(() => wallOf(permit?.windowStart ?? sim.now, sim.tz).slice(0, 16))
  const [end, setEnd] = useState(() => wallOf(permit?.windowEnd ?? addMinutes(sim.now, 120, sim.tz), sim.tz).slice(0, 16))
  const [assetIds, setAssetIds] = useState<string[]>(permit?.assetIds ?? [])
  const [team, setTeam] = useState<Record<string, string[]>>(permit?.team ?? {})
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const templates = state.templates.filter((t) => t.versions.some((v) => v.status === "ativa"))
  const template = state.templates.find((t) => t.id === templateId)
  const version = template?.versions.find((v) => permit ? v.id === permit.versionId : v.status === "ativa")
  const locations = state.locations.filter((l) => l.status === "ativo" && (!version?.locationTypeIds.length || version.locationTypeIds.includes(l.typeId)))
  const assets = useAssetPage({ q: query, filters: { locationId }, sort: { id: "code", dir: "asc" }, page: 0, pageSize: 25 })
  const allowedAssets = assets.items.filter((a) => a.status === "ativo" && (!version?.assetTypeIds.length || version.assetTypeIds.includes(a.typeId)))
  const roleIds = [...new Set(version?.stages.flatMap((stage) => stage.slots.flatMap((slot) => slot.roleIds)) ?? [])]
  const back = onBack ?? (() => navigate("quadro"))
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !templateId || !locationId || !version || sim.serverDown) return
    if (Date.parse(instant(end, sim.tz)) <= Date.parse(instant(start, sim.tz))) { setError("O fim da janela precisa ser depois do início."); return }
    setBusy(true); setError("")
    const input = { locationId, assetIds, team, windowStart: instant(start, sim.tz), windowEnd: instant(end, sim.tz), scope: scope.trim() }
    const result = permit ? await port.permits.updateDraft?.(permit.id, input) : await port.permits.create?.({ ...input, id, templateId, versionId: version.id })
    if (!result || "code" in result) { setError(result && "message" in result ? result.message : "Não foi possível salvar a PT."); setBusy(false); return }
    toast.success(permit ? "Rascunho atualizado" : "Rascunho criado")
    if (permit && onBack) onBack(); else openPermit(result.id)
  }
  // The disabled button says what is missing, in the order of the form.
  const why = !version ? "Escolha o modelo." : !locationId ? "Escolha o local." : !scope.trim() ? "Descreva o serviço." : Date.parse(instant(end, sim.tz)) <= Date.parse(instant(start, sim.tz)) ? "O fim da janela precisa ser depois do início." : ""
  return <Page>
    <PageHeader title={permit ? "Editar rascunho" : "Nova PT"} back={{ label: permit ? "PT" : "Quadro de PTs", onClick: back }} />
    {sim.serverDown && <DownBanner now={sim.now} />}
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] xl:items-start">
    <div className="min-w-0">
      {!templates.length && !permit ? <p className="type-body">Ative uma versão em Modelos de PT para criar a primeira PT.</p> : <form onSubmit={(e) => void save(e)} className="flex flex-col gap-6 rounded-lg border bg-card p-4 md:p-6">
        <fieldset disabled={busy || sim.serverDown} className="min-w-0">
          <FieldGroup>
            <Choice id="draft-model" label="Modelo" value={templateId} onChange={(v) => { setTemplateId(v); setLocationId(""); setAssetIds([]); setTeam({}) }} options={templates.map((t) => ({ id: t.id, name: t.name }))} disabled={!!permit} />
            <Choice id="draft-location" label="Local" value={locationId} onChange={(v) => { setLocationId(v); setAssetIds([]) }} options={locations.map((l) => ({ id: l.id, name: `${l.code} · ${l.name}` }))} disabled={!version} />
            <Field><FieldLabel htmlFor="draft-scope">Serviço</FieldLabel><Textarea id="draft-scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={500} required rows={3} /></Field>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              <Field><FieldLabel htmlFor="draft-start">Início da janela</FieldLabel><Input id="draft-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="min-h-11 md:min-h-9" /></Field>
              <Field><FieldLabel htmlFor="draft-end">Fim da janela</FieldLabel><Input id="draft-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required className="min-h-11 md:min-h-9" />{version?.maxWindowHours && <FieldDescription>Prazo máximo: {version.maxWindowHours} horas.</FieldDescription>}</Field>
            </div>
            {locationId && <Field>
              <FieldLabel htmlFor="draft-assets">Ativos <span className="type-meta font-normal">opcional agora</span></FieldLabel>
              <Input id="draft-assets" placeholder="Buscar por código ou nome" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 md:min-h-9" />
              {assetIds.length > 0 && <ul className="flex flex-col gap-1">{assetIds.map((assetId) => { const a = state.assets.find((x) => x.id === assetId); return <li key={assetId} className="flex items-center gap-2 type-body"><AssetIcon id={assetId} /><span className="min-w-0 flex-1 break-words">{a ? `${a.code} · ${a.name}` : "Ativo selecionado"}</span><Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover ${a?.code ?? "ativo"}`} onClick={() => setAssetIds((ids) => ids.filter((x) => x !== assetId))}><XIcon /></Button></li> })}</ul>}
              {assets.loading ? <p role="status" className="type-meta">Buscando ativos…</p> : assets.error ? <p role="alert">{assets.error.message}</p> : <div className="flex max-h-64 flex-col overflow-y-auto">{allowedAssets.map((a) => <label key={a.id} className="flex min-h-11 items-center gap-3 py-2 type-body"><Checkbox checked={assetIds.includes(a.id)} onCheckedChange={(checked) => setAssetIds((ids) => checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} /><AssetIcon id={a.id} /><span className="break-words">{a.code} · {a.name}</span></label>)}{!allowedAssets.length && <p className="type-meta">Nenhum ativo disponível nesta busca.</p>}</div>}
              {assets.total > 25 && <FieldDescription>Primeiros 25 de {assets.total} ativos. Refine a busca para encontrar outro.</FieldDescription>}
            </Field>}
            {roleIds.length > 0 && <FieldGroup><h2 className="type-heading">Equipe</h2>{roleIds.map((roleId) => {
              const chosen = team[roleId] ?? []
              const eligible = state.people.filter((p) => p.status === "ativo" && p.roles.some((r) => r.roleId === roleId))
              return <Field key={roleId}><FieldLabel htmlFor={`team-${roleId}`}>{label(state.roleTypes, roleId)} <span className="type-meta font-normal">opcional</span></FieldLabel><Select value="" onValueChange={(personId) => setTeam((t) => ({ ...t, [roleId]: [...chosen, personId] }))}><SelectTrigger id={`team-${roleId}`} className="min-h-11 w-full md:min-h-9"><SelectValue placeholder="Adicionar pessoa" /></SelectTrigger><SelectContent><SelectGroup>{eligible.filter((p) => !chosen.includes(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select>{chosen.map((personId) => <div key={personId} className="flex items-center gap-2 type-body"><span className="min-w-0 flex-1 break-words">{state.people.find((p) => p.id === personId)?.name ?? "Pessoa"}</span><Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label="Remover pessoa da equipe" onClick={() => setTeam((t) => ({ ...t, [roleId]: chosen.filter((x) => x !== personId) }))}><XIcon /></Button></div>)}</Field>
            })}</FieldGroup>}
          </FieldGroup>
        </fieldset>
        {error && <Alert className={TONE_BLOCK.stop}><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
        {why && <p id="draft-why" className="type-meta">{why}</p>}
        <div className="sticky bottom-0 z-10 flex flex-wrap justify-between gap-2 border-t bg-card py-3">
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={back} disabled={busy}>Cancelar</Button>
          <Button type="submit" className="min-h-11 md:min-h-9" aria-describedby={why ? "draft-why" : undefined} disabled={busy || sim.serverDown || !!why}>{busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}{busy ? "Salvando…" : permit ? "Salvar rascunho" : "Criar rascunho"}</Button>
        </div>
      </form>}
    </div>
    {/* The sheet being written: what this PT will be, filled in as the person chooses. */}
    <aside aria-label="Prévia da PT" className="sticky top-20 hidden min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 shadow-elev-2 xl:flex">
      <div className="flex items-baseline justify-between gap-3"><span className="type-label">Permissão de trabalho</span><span className="stamp text-st-neutral-fg"><span className="text-[0.625rem] leading-3 font-bold tracking-[0.14em] uppercase">Rascunho</span></span></div>
      <p className={scope.trim() ? "type-title break-words" : "type-title text-muted-foreground"}>{scope.trim() || "Serviço a descrever"}</p>
      <div aria-hidden className="border-t" />
      <dl className="doc-block grid-cols-2">
        {([["Modelo", template ? `${template.name}${version ? ` v${version.number}` : ""}` : "—"], ["Local", state.locations.find((l) => l.id === locationId)?.name ?? "—"], ["Ativos", assetIds.length ? assetIds.map((a) => state.assets.find((x) => x.id === a)?.code ?? "…").join(" · ") : "—"], ["Janela", `${dmHms(instant(start, sim.tz)).slice(0, -3)} – ${dmHms(instant(end, sim.tz)).slice(0, -3)}`]] as const).map(([l, v]) => (
          <div key={l} className="doc-cell flex flex-col gap-1"><dt className="type-label">{l}</dt><dd className="min-w-0 break-words type-body">{v}</dd></div>
        ))}
      </dl>
      {version && (
        <ol className="flex flex-col">
          {version.stages.map((st, i) => (
            <li key={st.id} className="flex items-baseline gap-3 border-b border-border py-1.5 last:border-b-0">
              <span className="type-data text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="type-body">{st.name}</span>
              <span className="ml-auto type-meta">{st.slots.length} {st.slots.length === 1 ? "assinatura" : "assinaturas"}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
    </div>
  </Page>
}

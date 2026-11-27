import { useState, type FormEvent } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { CircleAlertIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RequiredLegend, RequiredMark } from "@/components/ui/required"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAssetPage, useLocationsWithAssets } from "@/data/hooks"
import { choosable, PLACE_LOST } from "@/core/locationPicker"
import { addMinutes, instant, wallOf } from "@/core/time"
import { eligibilityHint, eligiblePeople, NOBODY_ELIGIBLE, personIneligible } from "@/core/eligibility"
import { pathIds } from "@/core/permitView"
import { saveLabel, type DraftFields } from "@/core/draftSave"
import { uuidv7 } from "@/lib/id"
import type { Permit } from "@/permit/types"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "../shell/Page"
import { TONE_BLOCK } from "../shell/Status"
import { DownBanner } from "./state"
import { PlacePicker } from "./PlacePicker"
import { QrScanButton, QrScanDialog } from "./QrScanDialog"
import { FormSection } from "./FormSection"
import { dmHms } from "@/core/time"
import { navigate } from "./nav"
import { useDraftAutosave } from "./useDraftAutosave"

function Choice({ id, label: title, value, onChange, options, disabled }: { id: string; label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[]; disabled?: boolean }) {
  return <Field><FieldLabel htmlFor={id}>{title}<RequiredMark /></FieldLabel><Select value={value} onValueChange={onChange} disabled={disabled} required><SelectTrigger id={id} className="min-h-11 w-full md:min-h-9"><SelectValue placeholder="Escolha" /></SelectTrigger><SelectContent><SelectGroup>{options.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
}

/** A draft is created once in the database, before the permit form can be answered. */
export function NewPermitView({ permit, onBack }: { permit?: Permit; onBack?: () => void }) {
  const { state } = useRegistry()
  const sim = useSim()
  const [id] = useState(uuidv7)
  const [templateId, setTemplateId] = useState(permit?.templateId ?? "")
  const [locationId, setLocationId] = useState(permit?.locationId ?? "")
  const [scope, setScope] = useState(permit?.scope ?? "")
  const [start, setStart] = useState(() => wallOf(permit?.windowStart ?? sim.now, sim.tz).slice(0, 16))
  const [end, setEnd] = useState(() => wallOf(permit?.windowEnd ?? addMinutes(sim.now, 120, sim.tz), sim.tz).slice(0, 16))
  const [assetIds, setAssetIds] = useState<string[]>(permit?.assetIds ?? [])
  const [team, setTeam] = useState<Record<string, string[]>>(permit?.team ?? {})
  const [query, setQuery] = useState("")
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const templates = state.templates.filter((t) => t.versions.some((v) => v.status === "ativa"))
  const template = state.templates.find((t) => t.id === templateId)
  const version = template?.versions.find((v) => permit ? v.id === permit.versionId : v.status === "ativa")
  // SPEC 017: only places with active assets the model accepts; a draft whose place stopped qualifying says so and waits.
  const places = useLocationsWithAssets(version?.assetTypeIds ?? [])
  const chosenPlace = state.locations.find((l) => l.id === locationId)
  const placeLost = !!locationId && !!version && !places.loading && !places.error && !(chosenPlace && choosable(chosenPlace, state.locationTypes, version.locationTypeIds, places.counts))
  const assets = useAssetPage({ q: query, filters: { locationId }, sort: { id: "code", dir: "asc" }, page: 0, pageSize: 25 })
  const allowedAssets = assets.items.filter((a) => a.status === "ativo" && (!version?.assetTypeIds.length || version.assetTypeIds.includes(a.typeId)))
  const roleIds = [...new Set(version?.stages.flatMap((stage) => stage.slots.flatMap((slot) => slot.roleIds)) ?? [])]
  const placePath = locationId ? pathIds(state.locations, locationId) : null
  const locationName = state.locations.find((l) => l.id === locationId)?.name ?? null
  // Everyone already chosen who no longer qualifies: sending waits until they are replaced (SPEC 015).
  const teamProblem = !placePath ? "" : Object.entries(team).flatMap(([roleId, ids]) => ids.map((id) => ({ roleId, id }))).map(({ roleId, id }) => {
    const person = state.people.find((p) => p.id === id), bad = personIneligible(person, roleId, placePath, sim.today, sim.now)
    return bad ? `Troque ${person?.name ?? "a pessoa"} na equipe: ${bad}.` : ""
  }).find(Boolean) ?? ""
  const back = onBack ?? (() => navigate("solicitacoes"))
  // SPEC 014: the form saves by itself once the model, the location and the scope exist.
  const inst = (v: string) => (v ? instant(v, sim.tz) : "")
  const windowProblem = !start || !end ? "Informe o início e o fim da janela." : Date.parse(inst(end)) <= Date.parse(inst(start)) ? "O fim da janela precisa ser depois do início." : ""
  const fields: DraftFields = { templateId, locationId, scope, windowStart: inst(start), windowEnd: inst(end), assetIds, team }
  const autosave = useDraftAutosave({
    id, existing: !!permit, fields, versionId: version?.id, blocked: windowProblem || teamProblem,
    // The address now names the draft: reloading the page opens it (the form stays where it is).
    onCreated: permit ? undefined : (draftId) => window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#nova-pt/${draftId}`),
  })
  const missing = autosave.missing
  const [leaving, setLeaving] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !templateId || !locationId || !version || sim.serverDown) return
    if (windowProblem) { setError(windowProblem); return }
    setBusy(true); setError("")
    const ok = await autosave.flush()
    const draftId = autosave.draftId()
    if (!ok || !draftId) { setError("Não foi possível salvar o rascunho. Confira a conexão e tente de novo."); setBusy(false); return }
    toast.success(permit ? "Rascunho atualizado" : "Rascunho salvo")
    // The form was this entry of the history: the PT replaces it, so Voltar does not come back to the form.
    if (permit && onBack) onBack(); else navigate(`pt/${draftId}/etapas`, { replace: true })
  }
  // Leaving saves what is pending; if it cannot, or nothing was ever saved, the person decides.
  const leave = async () => {
    if (busy) return
    if (!autosave.unsaved) { back(); return }
    if (autosave.state.kind === "incomplete" || !(await autosave.flush())) { setLeaving(true); return }
    back()
  }
  // The disabled button says what is missing, in the order of the form.
  const why = !version ? "Escolha o modelo." : !locationId ? "Escolha o local." : placeLost ? PLACE_LOST : !scope.trim() ? "Descreva o serviço." : windowProblem || teamProblem
  return <Page>
    <PageHeader title={permit ? "Editar rascunho" : "Nova PT"}
      meta={<span role="status" aria-live="polite" className={autosave.state.kind === "error" || autosave.state.kind === "offline" || autosave.state.kind === "blocked" ? "text-st-stop-fg" : undefined}>{saveLabel(autosave.state, missing)}</span>} />
    {sim.serverDown && <DownBanner now={sim.now} />}
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] xl:items-start">
    <div className="min-w-0">
      {!templates.length && !permit ? <p className="type-body">Ative uma versão em Modelos de PT para criar a primeira PT.</p> : <form onSubmit={(e) => void save(e)} className="flex flex-col gap-4">
        <fieldset disabled={busy || sim.serverDown} className="contents">
          <FormSection n={1} title="O serviço" hint="Qual modelo de PT e o que será feito.">
            <div className="flex min-w-0 flex-col gap-5">
              <Choice id="draft-model" label="Modelo" value={templateId} onChange={(v) => { setTemplateId(v); setLocationId(""); setAssetIds([]); setTeam({}) }} options={templates.map((t) => ({ id: t.id, name: t.name }))} disabled={!!permit} />
              <Field><FieldLabel htmlFor="draft-scope">Serviço<RequiredMark /></FieldLabel><Textarea id="draft-scope" value={scope} onChange={(e) => setScope(e.target.value)} maxLength={500} required rows={3} placeholder="Descreva o trabalho em poucas palavras" /></Field>
            </div>
          </FormSection>
          <FormSection n={2} title="Local e ativos" hint="Só aparecem locais com ativos ativos aceitos pelo modelo.">
            <div className="flex min-w-0 flex-col gap-5">
              <PlacePicker id="draft-location" value={locationId} places={places} locationTypeIds={version?.locationTypeIds ?? []} assetTypeIds={version?.assetTypeIds ?? []} disabled={!version}
                onChange={(v) => { setLocationId(v); setAssetIds([]) }}
                onPickAsset={(asset, placeId) => { setLocationId(placeId); setAssetIds([asset.id]) }} />
              <QrScanButton onClick={() => setScanning(true)} disabled={!version} />
              <QrScanDialog open={scanning} onOpenChange={setScanning} assetTypeIds={version?.assetTypeIds ?? []} locationTypeIds={version?.locationTypeIds ?? []} counts={places.counts}
                locationId={locationId} assetIds={assetIds}
                onAdd={(asset, placeId) => { if (placeId === locationId) setAssetIds((ids) => (ids.includes(asset.id) ? ids : [...ids, asset.id])); else { setLocationId(placeId); setAssetIds([asset.id]) } }} />
              {locationId ? <Field>
                <FieldLabel htmlFor="draft-assets">Ativos</FieldLabel>
                <Input id="draft-assets" placeholder="Buscar por código ou nome" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 md:min-h-9" />
                {assetIds.length > 0 && <ul className="flex flex-col gap-1">{assetIds.map((assetId) => { const a = state.assets.find((x) => x.id === assetId); return <li key={assetId} className="flex items-center gap-2 type-body"><AssetIcon id={assetId} /><span className="min-w-0 flex-1 break-words">{a ? `${a.code} · ${a.name}` : "Ativo selecionado"}</span><Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover ${a?.code ?? "ativo"}`} onClick={() => setAssetIds((ids) => ids.filter((x) => x !== assetId))}><XIcon /></Button></li> })}</ul>}
                {assets.loading ? <p role="status" className="type-meta">Buscando ativos…</p> : assets.error ? <p role="alert">{assets.error.message}</p> : <div className="flex max-h-64 flex-col overflow-y-auto rounded-md border px-3">{allowedAssets.map((a) => <label key={a.id} className="flex min-h-11 items-center gap-3 py-2 type-body"><Checkbox checked={assetIds.includes(a.id)} onCheckedChange={(checked) => setAssetIds((ids) => checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} /><AssetIcon id={a.id} /><span className="break-words">{a.code} · {a.name}</span></label>)}{!allowedAssets.length && <p className="py-3 type-meta">Nenhum ativo disponível nesta busca.</p>}</div>}
                {assets.total > 25 && <FieldDescription>Primeiros 25 de {assets.total} ativos. Refine a busca para encontrar outro.</FieldDescription>}
              </Field> : <p className="type-meta">Escolha o local para ver os ativos dele.</p>}
            </div>
          </FormSection>
          <FormSection n={3} title="Janela de execução" hint="Quando o trabalho começa e termina.">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="draft-start">Início<RequiredMark /></FieldLabel><Input id="draft-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required className="min-h-11 md:min-h-9" /></Field>
              <Field><FieldLabel htmlFor="draft-end">Fim<RequiredMark /></FieldLabel><Input id="draft-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required className="min-h-11 md:min-h-9" />{version?.maxWindowHours && <FieldDescription>Prazo máximo: {version.maxWindowHours} horas.</FieldDescription>}</Field>
            </div>
          </FormSection>
          {roleIds.length > 0 && <FormSection n={4} title="Equipe" hint="Só quem pode atuar neste local aparece na lista.">
            <div className="flex min-w-0 flex-col gap-5">{roleIds.map((roleId) => {
              const chosen = team[roleId] ?? []
              const roleName = label(state.roleTypes, roleId)
              // SPEC 015: only who the rule accepts for this cargo at this place; a chosen person who stopped qualifying stays, in red.
              const offer = placePath ? eligiblePeople(state.people, roleId, placePath, sim.today, sim.now).filter((p) => !chosen.includes(p.id)) : []
              return <Field key={roleId}><FieldLabel htmlFor={`team-${roleId}`}>{roleName}</FieldLabel>
                <Select value="" disabled={!placePath} onValueChange={(personId) => setTeam((t) => ({ ...t, [roleId]: [...chosen, personId] }))}><SelectTrigger id={`team-${roleId}`} className="min-h-11 w-full md:min-h-9"><SelectValue placeholder={placePath ? "Adicionar pessoa" : "Escolha o local primeiro"} /></SelectTrigger><SelectContent><SelectGroup>{offer.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
                <FieldDescription>{!placePath ? "A lista depende do local: escolha o local primeiro." : offer.length === 0 && chosen.length === 0 ? NOBODY_ELIGIBLE : eligibilityHint(roleName, locationName)}</FieldDescription>
                {chosen.map((personId) => { const person = state.people.find((p) => p.id === personId); const bad = placePath ? personIneligible(person, roleId, placePath, sim.today, sim.now) : null; return <div key={personId} className="flex items-center gap-2 type-body"><span className="min-w-0 flex-1 break-words">{person?.name ?? "Pessoa"}{bad && <span role="alert" className="text-st-stop-fg"> · não elegível: {bad}. Troque esta pessoa.</span>}</span><Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover ${person?.name ?? "pessoa"} da equipe`} onClick={() => setTeam((t) => ({ ...t, [roleId]: chosen.filter((x) => x !== personId) }))}><XIcon /></Button></div> })}
              </Field>
            })}</div>
          </FormSection>}
        </fieldset>
        {error && <Alert className={TONE_BLOCK.stop}><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
        {why && <p id="draft-why" className="type-meta">{why}</p>}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 shadow-elev-2">
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => void leave()} disabled={busy}>Cancelar</Button>
          <RequiredLegend className="max-sm:order-last max-sm:w-full" />
          <Button type="submit" className="min-h-11 md:min-h-9" aria-describedby={why ? "draft-why" : undefined} disabled={busy || sim.serverDown || !!why}>{busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}{busy ? "Salvando…" : permit ? "Salvar e voltar" : "Salvar e continuar"}</Button>
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
    <Dialog open={leaving} onOpenChange={setLeaving}>
      <DialogContent>
        <DialogHeader className="pr-10">
          <DialogTitle>Sair sem salvar?</DialogTitle>
          <DialogDescription>{autosave.state.kind === "incomplete"
            ? `O rascunho ainda não foi salvo: escolha ${missing || "os dados do serviço"} para ele começar a ser salvo. O que você preencheu será perdido.`
            : "Não foi possível salvar as últimas alterações. Elas serão perdidas."}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setLeaving(false)}>Continuar preenchendo</Button>
          <Button variant="destructive" className="min-h-11 md:min-h-9" onClick={() => { setLeaving(false); back() }}>Sair sem salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Page>
}

/** Screens 2-3: a model (its versions) and a version (tabs + side panel). */
import { useState } from "react"
import { CheckCircle2Icon, CircleCheckIcon, CopyPlusIcon, BracesIcon, FileInputIcon, FlaskConicalIcon, MapPinIcon, OctagonXIcon, PencilIcon, Trash2Icon, WorkflowIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { JsonView } from "../JsonView"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Narrow, Page, PageHeader, PageSection, PropertyList, SidePanel } from "@/components/shell/Page"
import { cn } from "@/lib/utils"
import { useSim } from "@/sim/SimProvider"
import { useRegistry } from "@/registry/store"
import { RETENTION_LABEL, type PermitTemplate, type RetentionClass, type TemplateVersion } from "@/registry/types"
import { copyVersion } from "@/core/templateVersions"
import { DeferredText } from "../DeferredText"
import { DataTable } from "../DataTable"
import { FlowEditor } from "../FlowEditor"
import { DownBanner } from "../../work/state"
import { FlowReadOnly } from "../FlowReadOnly"
import { useLatest, type SetTpl } from "../FormEditor"
import { SourceContext, SuggestedBadge } from "../origem"
import { countItems } from "@/core/form"
import { TONE_BLOCK, TONE_TEXT } from "@/components/shell/Status"
import { HoldsEquipment, Scope, WindowLimit } from "./ModelSettings"
import { TryPanel } from "./TryPanel"
import { NameDialog } from "./list"
import { VERSION_STATUS, VersionBadge, activeOf, latestOf, plural, problems, shortDate } from "./shared"

/** Escopo: where and on what. Fluxo: per stage, what is filled in and who signs. Testar: all of it together. */
export type Tab = "escopo" | "fluxo" | "test" | "json"
const TABS: Record<Tab, { title: string; icon: typeof WorkflowIcon }> = {
  escopo: { title: "Escopo", icon: MapPinIcon },
  fluxo: { title: "Fluxo", icon: WorkflowIcon },
  test: { title: "Testar", icon: FlaskConicalIcon },
  json: { title: "JSON", icon: BracesIcon },
}

export function ModelDetail({ tpl, onBack, onImport, initialVersion = null }: { tpl: PermitTemplate; onBack: () => void; onImport: () => void; initialVersion?: string | null }) {
  const { state, upsert, removeTemplate, now } = useRegistry()
  const { today, serverDown, now: simNow, canEditModels } = useSim()
  /** The model as last rendered: "Desfazer" on a toast patches what is there now, not a stale copy. */
  const live = useLatest(tpl)
  const [verId, setVerId] = useState<string | null>(initialVersion)
  const [tab, setTab] = useState<Tab>("escopo")
  const [renaming, setRenaming] = useState(false)
  const ver = tpl.versions.find((v) => v.id === verId) ?? null
  const hasHistory = tpl.versions.some((v) => v.status !== "rascunho")
  const base = activeOf(tpl) ?? latestOf(tpl)

  const setVersions = (versions: TemplateVersion[]) => upsert("templates", { ...tpl, versions })
  const setRetention = async (retentionClass: RetentionClass) => { if (await upsert("templates", { ...tpl, retentionClass })) toast.success("Classe de retenção alterada", { description: RETENTION_LABEL[retentionClass] }) }
  const patchVersion = (id: string, patch: Partial<TemplateVersion>) => setVersions(tpl.versions.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  const patchLive = (id: string, fn: (v: TemplateVersion) => Partial<TemplateVersion>) => {
    const t = live.current
    if (t.versions.some((v) => v.id === id)) upsert("templates", { ...t, versions: t.versions.map((v) => (v.id === id ? { ...v, ...fn(v) } : v)) })
  }
  const openVersion = (id: string | null) => { setVerId(id); setTab("escopo") }

  /** Active and archived versions are history: never edited, only copied into a new draft. */
  /** New stage and signature ids (unique in the unit); item ids stay, so answers keep their meaning. */
  const newVersion = async (from: TemplateVersion) => {
    const number = Math.max(...tpl.versions.map((v) => v.number)) + 1
    const copy = copyVersion(from, number, now())
    if (!await setVersions([...tpl.versions, copy])) return
    openVersion(copy.id)
    toast.success(`Versão ${number} criada como rascunho`)
  }
  /** Only one active version per model: activating archives the current one. */
  const activate = async (v: TemplateVersion) => {
    if (await setVersions(tpl.versions.map((x) => (x.id === v.id ? { ...x, status: "ativa", activatedAt: now() } : x.status === "ativa" ? { ...x, status: "arquivada" } : x)))) toast.success(`Versão ${v.number} ativada`)
  }
  const removeDraft = async (v: TemplateVersion) => {
    if (!await setVersions(tpl.versions.filter((x) => x.id !== v.id))) return
    openVersion(null)
    toast("Rascunho removido", { description: `Versão ${v.number}` })
  }

  /* level 3: one version, tabs on the left, state and actions on the right (like the PT) */
  if (ver) {
    const draft = ver.status === "rascunho"
    /** Suggested by "Importar modelo": marked, with each element's origin, until it is activated. */
    const suggested = draft && ver.origin === "sugerida"
    const issues = problems(ver, state, today)
    const active = activeOf(tpl)
    const set: SetTpl = (patch) => (typeof patch === "function" ? patchLive(ver.id, patch) : patchVersion(ver.id, patch))
    // Without the server nothing is saved: the draft reads like history until it is back.
    const editable = draft && canEditModels && !serverDown
    const properties = (
      <PropertyList items={[
        { label: "Nota", value: ver.note || "—" },
        { label: "Criada em", value: shortDate(ver.createdAt) },
        ...(ver.activatedAt ? [{ label: "Ativada em", value: shortDate(ver.activatedAt) }] : []),
        { label: "Etapas", value: ver.stages.length },
        { label: "Assinaturas", value: ver.stages.flatMap((x) => x.slots).length },
        { label: "Formulário", value: `${plural(ver.form?.sections.length ?? 0, "seção", "seções")} · ${plural(countItems(ver.form), "item", "itens")}` },
      ]} />
    )
    /* Situação → pendências → the one primary (DESIGN.md: state, then action). */
    const panel = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-label">Situação</span>
          <span className="flex flex-wrap items-center gap-2 type-body">
            <VersionBadge status={ver.status} />
            {draft ? (issues.length
              ? <span className={cn("inline-flex items-center gap-1", TONE_TEXT.stop)}><OctagonXIcon className="size-4 shrink-0" aria-hidden />{plural(issues.length, "pendência", "pendências")} para ativar</span>
              : <span className={cn("inline-flex items-center gap-1", TONE_TEXT.ok)}><CircleCheckIcon className="size-4 shrink-0" aria-hidden />Pronta para ativar</span>)
              : ver.status === "ativa" ? `desde ${shortDate(ver.activatedAt ?? ver.createdAt)}` : "Somente leitura"}
          </span>
        </div>
        {canEditModels && draft && issues.length > 0 && (
          <div className={cn("flex flex-col gap-2 rounded-lg border p-3", TONE_BLOCK.stop)} role="status">
            <ul className={cn("flex flex-col gap-1 type-meta", TONE_TEXT.stop)}>{issues.map((i) => <li key={i.text} className="flex items-start gap-1.5"><OctagonXIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{i.text}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              {(["escopo", "fluxo"] as const).filter((k) => k !== tab && issues.some((i) => i.tab === k)).map((k) => (
                <Button key={k} variant="outline" className="h-11 w-fit bg-surface-row md:h-9" onClick={() => setTab(k)}>Corrigir em {TABS[k].title}</Button>
              ))}
            </div>
          </div>
        )}
        {canEditModels && (draft ? (
          <Popover>
            <PopoverTrigger asChild><Button className="h-11 w-full md:h-9" disabled={issues.length > 0 || serverDown}><CheckCircle2Icon data-icon="inline-start" />Ativar versão</Button></PopoverTrigger>
            <PopoverContent collisionPadding={16} className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2">
              <span className="type-body">{active ? `A versão ${active.number} passa a arquivada e a ${ver.number} fica em uso.` : `A versão ${ver.number} fica em uso.`} Depois disso ela é somente leitura.</span>
              <Button className="min-h-11 md:min-h-9" onClick={() => activate(ver)}>Confirmar ativação</Button>
            </PopoverContent>
          </Popover>
        ) : (
          <Button className="h-11 w-full md:h-9" disabled={serverDown} onClick={() => newVersion(ver)}><CopyPlusIcon data-icon="inline-start" />Nova versão a partir desta</Button>
        ))}
      </div>
    )
    return (
      <Page>
        <PageHeader back={{ label: tpl.name, onClick: () => openVersion(null) }} title={`Versão ${ver.number}`}
          meta={<>
            <VersionBadge status={ver.status} />
            {suggested && <SuggestedBadge />}
            <span>{draft && canEditModels ? (serverDown ? "Sem servidor: nada é salvo · Testar continua disponível" : "Alterações salvas ao editar") : ver.status === "ativa" ? `Desde ${shortDate(ver.activatedAt ?? ver.createdAt)} · somente leitura` : "Somente leitura"}</span>
          </>}
          actions={canEditModels && draft && tpl.versions.length > 1 ? {
            menu: [{
              label: "Remover rascunho", icon: Trash2Icon, destructive: true, disabled: serverDown,
              confirm: { what: `Versão ${ver.number}`, detail: "O rascunho e tudo o que foi montado nele." }, onClick: () => removeDraft(ver),
            }],
          } : undefined} />
        {serverDown && <DownBanner now={simNow} />}

        <SidePanel label="Situação e ações da versão" actions={panel} properties={properties}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="min-w-0 gap-4">
            <TabsList className="w-full sm:w-fit">
              {(Object.keys(TABS) as Tab[]).map((k) => {
                const Icon = TABS[k].icon
                return (
                  <TabsTrigger key={k} value={k}>
                    <Icon aria-hidden className="hidden sm:block" />
                    {TABS[k].title}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <TabsContent value="escopo">
              <Narrow size="list">
                {editable && (
                  <div className="flex flex-col gap-1.5 pb-4">
                    <Label htmlFor="ver-note">Nota da versão</Label>
                    <DeferredText id="ver-note" value={ver.note} maxLength={2000} onCommit={(note) => patchVersion(ver.id, { note })} placeholder="O que muda nesta versão" className="min-h-11 md:min-h-9" />
                  </div>
                )}
                <Scope tpl={ver} set={set} disabled={!editable} />
                <WindowLimit key={ver.id} hours={ver.maxWindowHours} disabled={!editable} onChange={(maxWindowHours) => patchVersion(ver.id, { maxWindowHours })} />
                <HoldsEquipment holds={ver.holdsEquipment} disabled={!editable} onChange={(holdsEquipment) => patchVersion(ver.id, { holdsEquipment })} />
                {/* The panel's properties show only from xl; below it they close the first tab. */}
                <PageSection title="Sobre esta versão" className="xl:hidden">{properties}</PageSection>
              </Narrow>
            </TabsContent>

            {/* A version no one can change is shown as text (FlowReadOnly), never as a disabled editor. */}
            <TabsContent value="fluxo" className="flex flex-col gap-4">
              {suggested && (
                <p className="flex flex-wrap items-center gap-2 type-meta">
                  <SuggestedBadge />Confira cada etapa, assinatura e item com o documento{ver.importSource?.documentos[0] ? ` (${ver.importSource.documentos[0].arquivo})` : ""}: abra “Origem”.
                </p>
              )}
              <SourceContext.Provider value={ver.importSource ?? null}>
                {editable ? <FlowEditor tpl={ver} set={set} /> : <FlowReadOnly tpl={ver} />}
              </SourceContext.Provider>
            </TabsContent>
            <TabsContent value="json"><JsonView tpl={tpl} ver={ver} onImport={onImport} /></TabsContent>
            <TabsContent value="test"><TryPanel tpl={ver} head={{ templateId: tpl.id, name: tpl.name, version: ver.number, versionId: ver.id }} /></TabsContent>
          </Tabs>
        </SidePanel>
      </Page>
    )
  }

  /* level 2: one model, its versions */
  return (
    <Page>
      <PageHeader back={{ label: "Modelos de PT", onClick: onBack }} title={tpl.name}
        meta={`${plural(tpl.versions.length, "versão", "versões")} · só uma fica em uso${hasHistory ? " · com histórico, não pode ser removido" : ""}`}
        actions={canEditModels ? {
          primary: { label: "Nova versão", icon: CopyPlusIcon, disabled: serverDown, onClick: () => newVersion(base) },
          menu: [
            { label: "Renomear", icon: PencilIcon, disabled: serverDown, onClick: () => setRenaming(true) },
            { label: "Importar nova versão de JSON", icon: FileInputIcon, disabled: serverDown, onClick: onImport },
            ...(hasHistory ? [] : [{
              label: "Remover modelo", icon: Trash2Icon, destructive: true, disabled: serverDown,
              confirm: { what: tpl.name, detail: "O modelo e seus rascunhos." },
              onClick: async () => { if (!await removeTemplate(tpl.id)) return; onBack(); toast("Modelo removido", { description: tpl.name }) },
            }]),
          ],
        } : undefined} />
      {serverDown && <DownBanner now={simNow} />}

      {/* How long the audit trail of this model's permits is kept (ptw.retention_class; 5 years minimum in all). */}
      <div className="flex max-w-xl flex-col gap-1.5">
        <Label htmlFor="tpl-retention">Retenção da trilha</Label>
        {canEditModels ? <Select value={tpl.retentionClass} disabled={serverDown} onValueChange={(v) => setRetention(v as RetentionClass)}>
          <SelectTrigger id="tpl-retention" className="min-h-11 w-full min-w-0 bg-surface-row md:min-h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{(Object.keys(RETENTION_LABEL) as RetentionClass[]).map((k) => <SelectItem key={k} value={k}>{RETENTION_LABEL[k]}</SelectItem>)}</SelectGroup></SelectContent>
        </Select> : <p className="type-body">{RETENTION_LABEL[tpl.retentionClass]}</p>}
        <p className="type-meta">Guardada por no mínimo 5 anos (PET: NR-33).</p>
      </div>

      <DataTable<TemplateVersion>
        rows={tpl.versions}
        rowKey={(v) => v.id}
        noun={["versão", "versões"]}
        searchLabel="Buscar versão ou nota"
        searchText={(v) => `${v.number} ${VERSION_STATUS[v.status].text} ${v.note}`}
        onRowClick={(v) => openVersion(v.id)}
        defaultSort={{ id: "number", dir: "desc" }}
        filter={{
          label: "Filtrar por situação",
          options: [{ value: "ativa", label: "Em uso" }, { value: "rascunho", label: "Rascunho" }, { value: "arquivada", label: "Arquivada" }],
          test: (v, s) => v.status === s,
        }}
        columns={[
          {
            id: "number", header: "Versão", className: "whitespace-normal font-medium", sort: (a, b) => a.number - b.number,
            cell: (v) => (
              <button type="button" className="flex min-h-11 flex-col justify-center text-left hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => { e.stopPropagation(); openVersion(v.id) }}>
                Versão {v.number}
                {/* On a phone the note sits under the number instead of in its own column (no sideways scroll). */}
                {v.note && <span className="type-meta font-normal sm:hidden">{v.note}</span>}
              </button>
            ),
          },
          { id: "status", header: "Situação", sort: (a, b) => a.status.localeCompare(b.status), cell: (v) => <span className="flex flex-wrap gap-1"><VersionBadge status={v.status} />{v.status === "rascunho" && v.origin === "sugerida" && <SuggestedBadge />}</span> },
          {
            id: "date", header: "Data", className: "hidden tabular-nums lg:table-cell", sort: (a, b) => (a.activatedAt ?? a.createdAt).localeCompare(b.activatedAt ?? b.createdAt),
            cell: (v) => shortDate(v.status === "ativa" ? v.activatedAt ?? v.createdAt : v.createdAt),
          },
          { id: "note", header: "Nota", className: "hidden max-w-48 truncate text-muted-foreground sm:table-cell", cell: (v) => v.note },
        ]}
      />

      {/* Keyed by the name: it reopens with the current one after a rename. */}
      <NameDialog key={tpl.name} open={renaming} onOpenChange={setRenaming} title="Renomear modelo" description="Novo nome do modelo. As versões continuam as mesmas." submit="Salvar nome" initial={tpl.name}
        onSubmit={async (name) => { if (!await upsert("templates", { ...tpl, name })) return; setRenaming(false); toast.success("Modelo renomeado", { description: name }) }} />
    </Page>
  )
}

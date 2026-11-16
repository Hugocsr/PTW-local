/** Importar modelo: choosing the file and the preview with problems and totals. */
import { useEffect, useMemo, useRef, useState } from "react"
import { CircleCheckIcon, FileInputIcon, FolderOpenIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Narrow, Page, PageHeader, PageSection, PropertyList, SidePanel } from "@/components/shell/Page"
import { StatusBadge, TONE_BLOCK, TONE_TEXT } from "@/components/shell/Status"
import { cn } from "@/lib/utils"
import { sha256Hex } from "@/core/audit"
import { uuidv7 } from "@/lib/id"
import { useData } from "@/data/context"
import type { ImportPreview } from "@/data/port"
import { lerPacote, totaisDaImportacao, type PacoteModelo, type Pendencia, type Problema, type ResultadoImportacao } from "@/core/templatePackage"
import { useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "../../work/state"
import { ShowAllSources, SourceContext } from "../origem"
import { Created, IssueList } from "./Created"
import { languageName, n, packageDate } from "./shared"

export function ImportView({ onBack, onCreated }: { onBack: () => void; onCreated: (templateId: string, versionId: string) => void }) {
  const { state } = useRegistry()
  const sim = useSim()
  const [source, setSource] = useState<{ name: string; text: string } | null>(null)
  const [paste, setPaste] = useState("")
  const [readError, setReadError] = useState("")
  const file = useRef<HTMLInputElement>(null)

  const load = (name: string, text: string) => {
    const { erro } = lerPacote(text)
    if (erro) { setReadError(erro); return }
    setReadError("")
    setSource({ name, text })
  }

  const back = { label: "Modelos de PT", onClick: onBack }
  if (!source) {
    return (
      <Page>
        <PageHeader back={back} title="Importar modelo" meta="Pacote ptw.modelo/1 lido de um formulário da planta. Nada é criado antes da sua confirmação." />
        {sim.serverDown && <DownBanner now={sim.now} />}
        <Narrow>
          {readError && <p role="alert" className={cn("flex items-start gap-2 rounded-lg border p-3 type-body", TONE_BLOCK.stop)}><OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{readError}</p>}
          <PageSection title="Arquivo">
            <input ref={file} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-hidden
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(f.name, await f.text()); e.target.value = "" }} />
            <Button className="min-h-11 w-fit md:min-h-9" disabled={sim.serverDown} onClick={() => file.current?.click()}><FolderOpenIcon data-icon="inline-start" />Escolher arquivo .json</Button>
          </PageSection>
          <PageSection title="Ou cole o conteúdo">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="imp-paste">Conteúdo do pacote (JSON)</Label>
              <Textarea id="imp-paste" value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} spellCheck={false} className="max-h-80 type-data" placeholder='{ "formato": "ptw.modelo/1", … }' />
            </div>
            <Button variant="outline" className="min-h-11 w-fit md:min-h-9" disabled={sim.serverDown || !paste.trim()} onClick={() => load("", paste)}>Ler conteúdo colado</Button>
          </PageSection>
        </Narrow>
      </Page>
    )
  }
  return <ServerPreview key={source.text} source={source} back={back} onOther={() => setSource(null)} state={state} onCreated={onCreated} />
}

function ServerPreview({ source, back, onOther, state, onCreated }: {
  source: { name: string; text: string }; back: { label: string; onClick: () => void }; onOther: () => void;
  state: ReturnType<typeof useRegistry>["state"]; onCreated: (templateId: string, versionId: string) => void
}) {
  const { registry } = useData()
  const [result, setResult] = useState<ImportPreview | null>(null)
  const [error, setError] = useState("")
  const [key] = useState(uuidv7)
  useEffect(() => {
    let live = true
    void registry.previewImport?.({ arquivo: source.name, pacote: source.text }).then((r) => {
      if (!live) return
      if ("code" in r) setError(r.message); else setResult(r)
    })
    return () => { live = false }
  }, [registry, source])
  if (!result) return <Page><PageHeader back={back} title="Importar modelo" /><p role={error ? "alert" : "status"} className="type-body">{error || "Conferindo o pacote no servidor…"}</p>{error && <Button variant="outline" className="min-h-11 self-start md:min-h-9" onClick={onOther}>Escolher arquivo</Button>}</Page>
  return <Preview source={source} back={back} onOther={onOther} state={state} result={result} onCreate={async () => {
    if (!result.token || !registry.confirmImport) return "A prévia não permite criar o rascunho."
    const saved = await registry.confirmImport({ arquivo: source.name, pacote: source.text, token: result.token, key })
    if ("code" in saved) return saved.message
    toast.success("Rascunho criado", { description: "Revise e ative na versão." })
    onCreated(saved.templateId, saved.versionId)
    return null
  }} />
}

function Preview({ source, back, onOther, onCreate, state, result }: {
  source: { name: string; text: string }
  back: { label: string; onClick: () => void }
  onOther: () => void
  onCreate: () => Promise<string | null>
  result: ImportPreview
  state: ReturnType<typeof useRegistry>["state"]
}) {
  const sim = useSim()
  const [confirm, setConfirm] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const hash = useMemo(() => sha256Hex(source.text), [source.text])
  const pkg = useMemo(() => lerPacote(source.text).pacote, [source.text])
  const r: ResultadoImportacao = result
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const confirmCreate = async () => {
    if (saving) return
    setSaving(true); setSaveError("")
    const error = await onCreate()
    if (error) setSaveError(error)
    setSaving(false)
    if (!error) setConfirm(false)
  }

  const p = r.previa ? (pkg as PacoteModelo) : null
  const erros = r.problemas.filter((x) => x.nivel === "erro")
  const avisos = r.problemas.filter((x) => x.nivel === "aviso")
  const pend = r.pendencias.length + avisos.length
  const ready = !!r.rascunho
  const t = r.previa ? totaisDaImportacao(r.previa) : null
  const byAlvo = useMemo(() => {
    const m = new Map<string, Problema[]>()
    for (const x of erros) if (x.alvo) m.set(x.alvo, [...(m.get(x.alvo) ?? []), x])
    return m
  }, [erros])

  const status = ready
    ? <StatusBadge tone="ok" icon={CircleCheckIcon}>Pronto para criar</StatusBadge>
    : <StatusBadge tone="stop" icon={OctagonXIcon}>{erros.length === 1 ? "1 problema impede a criação" : `${erros.length} problemas impedem a criação`}</StatusBadge>
  const pendBadge = pend > 0 && <StatusBadge tone="attention" icon={TriangleAlertIcon}>{n(pend, "pendência", "pendências")}</StatusBadge>

  const question = t && `Criar 1 versão em rascunho com ${[
    n(t.etapas, "etapa", "etapas"), n(t.itens, "item", "itens"), n(t.assinaturas, "assinatura", "assinaturas"),
    t.listasNovas && n(t.listasNovas, "lista nova", "listas novas"), t.tiposNovos && n(t.tiposNovos, "tipo novo", "tipos novos"), t.cargosNovos && n(t.cargosNovos, "cargo novo", "cargos novos"),
  ].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " e $1")}?`

  const create = (cls?: string) => (
    <Button className={cn("h-11 md:h-9", cls)} disabled={!ready || sim.serverDown} onClick={() => setConfirm(true)}><FileInputIcon data-icon="inline-start" />Criar rascunho</Button>
  )

  const doc = p?.origem.arquivos ?? []
  const properties = (
    <PropertyList items={[
      { label: "Pacote", value: <span className="break-words">{source.name || "Texto colado"}</span> },
      { label: "Impressão digital", value: <span className="type-data" title={hash}>{hash.slice(0, 12)}…</span> },
      ...doc.map((d, i) => ({ label: i ? `Documento ${i + 1}` : "Documento", value: <span className="flex flex-col"><span className="break-words">{d.arquivo}</span><span className="type-meta"><span className="type-data" title={d.sha256}>{d.sha256.slice(0, 12)}…</span> · {n(d.paginas, "página", "páginas")}</span></span> })),
      ...(p ? [
        { label: "Gerado por", value: p.origem.gerado_por.ferramenta },
        ...(p.origem.gerado_por.modelo ? [{ label: "Modelo de IA", value: p.origem.gerado_por.modelo }] : []),
        { label: "Gerado em", value: <span className="tabular-nums">{packageDate(p.origem.gerado_em)}</span> },
        { label: "Idioma", value: p.idioma ? (p.idioma.documento === p.idioma.rotulos ? languageName(p.idioma.documento) : `${languageName(p.idioma.documento)} → ${languageName(p.idioma.rotulos)}`) : languageName("pt-BR") },
      ] : []),
      ...(t ? [
        { label: "Etapas", value: t.etapas },
        { label: "Assinaturas", value: t.assinaturas },
        { label: "Formulário", value: `${n(t.secoes, "seção", "seções")} · ${n(t.itens, "item", "itens")}` },
        { label: "Novos", value: `${n(t.listasNovas, "lista", "listas")} · ${n(t.tiposNovos, "tipo", "tipos")} · ${n(t.cargosNovos, "cargo", "cargos")}` },
      ] : []),
    ]} />
  )

  const panel = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="type-label">Situação</span>
        <span className="flex flex-wrap items-center gap-2">{status}{pendBadge}</span>
        <span className="type-meta">{ready ? "Nada foi criado ainda. Confira a lista e confirme." : "Corrija o arquivo e importe de novo. Nada foi criado."}</span>
      </div>
      {create("w-full")}
      <Button variant="outline" className="h-11 w-full md:h-9" onClick={onOther}>Escolher outro arquivo</Button>
    </div>
  )

  return (
    <Page>
      <PageHeader back={back} title="Importar modelo" meta={<>{status}{pendBadge}<span>Prévia · nada foi criado</span></>} />
      {sim.serverDown && <DownBanner now={sim.now} />}
      <SidePanel label="Situação e ações da importação" actions={panel} properties={properties}>
        <PageSection title="Pacote" className="xl:hidden">{properties}</PageSection>

        {erros.length > 0 && (
          <PageSection title={`Problemas (${erros.length})`}>
            <IssueList tone="stop" rows={erros.map((x) => ({ key: `${x.onde}|${x.mensagem}`, onde: x.onde, text: x.mensagem, alvo: x.alvo }))} />
          </PageSection>
        )}

        {pend > 0 && (
          <PageSection title={`Pendências (${pend})`}>
            <IssueList tone="attention" rows={[
              ...r.pendencias.map((x: Pendencia) => ({ key: `p|${x.onde}|${x.descricao}`, onde: x.onde, text: x.descricao, sugestao: x.sugestao, alvo: x.alvo, origem: x.origem })),
              ...avisos.map((x) => ({ key: `a|${x.onde}|${x.mensagem}`, onde: x.onde, text: x.mensagem, alvo: x.alvo })),
            ]} />
          </PageSection>
        )}

        {r.previa && p && (
          <SourceContext.Provider value={r.previa.versao.importSource ?? null}>
            <ShowAllSources.Provider value={showAll}>
              <Created r={r} p={p} state={state} byAlvo={byAlvo} showAll={showAll} setShowAll={setShowAll} />
            </ShowAllSources.Provider>
          </SourceContext.Provider>
        )}

        {/* Below xl the panel sits above the list: the action is repeated where the long list ends. */}
        <div className="flex flex-col gap-2 border-t pt-4 xl:hidden">
          <span className="flex flex-wrap items-center gap-2">{status}{pendBadge}</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            {create("w-full sm:w-fit")}
            <Button variant="outline" className="h-11 w-full sm:w-fit md:h-9" onClick={onOther}>Escolher outro arquivo</Button>
          </div>
        </div>
      </SidePanel>

      <Dialog open={confirm} onOpenChange={(open) => { if (!saving) setConfirm(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar rascunho?</DialogTitle>
            <DialogDescription>{question}</DialogDescription>
          </DialogHeader>
          <p className="type-body">
            {r.previa?.modeloExistente ? `Nova versão ${r.previa.versao.number} de “${r.previa.modeloNome}”.` : `Modelo novo “${r.previa?.modeloNome}”.`} A versão fica em rascunho, marcada como sugerida pela importação; nada é ativado.
          </p>
          <DialogFooter>
            {saveError && <p role="alert" className={TONE_TEXT.stop}>{saveError}</p>}
            <Button variant="outline" className="min-h-11 md:min-h-9" disabled={saving} onClick={() => setConfirm(false)}>Cancelar</Button>
            <Button className="min-h-11 md:min-h-9" disabled={saving || !r.rascunho || sim.serverDown} onClick={() => void confirmCreate()}>{saving ? "Criando…" : "Criar rascunho"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  )
}

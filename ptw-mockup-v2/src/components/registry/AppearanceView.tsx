import { useState, type CSSProperties } from "react"
import { RotateCcwIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"
import { appearanceProblems, BRAND_PRESETS, brandImageUrl, editableBrand } from "@/core/appearance"
import { brandVars, type Brand } from "@/core/brand"
import { useAppearance } from "@/data/hooks"
import { useBrand } from "@/data/brand"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem"))
    reader.readAsDataURL(file)
  })
}

export function AppearanceView() {
  const active = useBrand(), editor = useAppearance()
  if (!editor.record) return <Page><PageHeader title="Identidade visual" />{editor.error
    ? <div role="alert"><p className="type-body">{editor.error.message}</p><Button variant="outline" onClick={() => void editor.reload()} disabled={editor.busy}>Tentar novamente</Button></div>
    : <p role="status" className="type-meta">Carregando configuração…</p>}</Page>
  return <AppearanceEditor key={`${editor.record.revision}:${JSON.stringify(active)}`} active={active} editor={editor} />
}

function AppearanceEditor({ active, editor }: { active: Brand; editor: ReturnType<typeof useAppearance> }) {
  const { serverDown } = useSim()
  const [draft, setDraft] = useState<Brand>(() => editableBrand(editor.record?.brand ?? active))
  const [restore, setRestore] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<Partial<Record<"logo" | "symbol", string>>>({})
  const problems = appearanceProblems(draft)
  const disabled = editor.busy || uploading || serverDown || !editor.record
  const image = async (field: "logo" | "symbol", file?: File) => {
    if (!file) return
    if (file.type !== "image/png" || file.size > 262144) { toast.error("Use uma imagem PNG de até 256 KiB."); return }
    setUploading(true)
    try {
      const base64 = await fileBase64(file), r = await editor.upload(base64)
      if ("code" in r) toast.error(r.message)
      else {
        setDraft((b) => ({ ...b, [field]: r.file }))
        setPreview((p) => ({ ...p, [field]: `data:image/png;base64,${base64}` }))
      }
    } catch { toast.error("Não foi possível enviar a imagem.") }
    finally { setUploading(false) }
  }
  const saved = async (brand: Brand | null) => {
    if (await editor.save(brand)) toast.success(brand ? "Identidade publicada." : "Tema da planta restaurado.")
  }
  const logo = preview.logo ?? brandImageUrl(draft.logo)
  return <Page className="[&_button]:min-h-11 [&_input]:min-h-11 md:[&_button]:min-h-9 md:[&_input]:min-h-9">
    <PageHeader title="Identidade visual" meta="Personalize a marca da unidade. A prévia fica nesta tela até publicar." />
    {editor.error && <div role="alert" className="rounded-lg border p-4 type-body"><p>{editor.error.message}</p><Button variant="outline" onClick={() => void editor.reload()} disabled={editor.busy}>Recarregar configuração</Button></div>}
    {!editor.record && !editor.error && <p role="status" className="type-meta">Carregando configuração…</p>}
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <fieldset disabled={disabled} className="min-w-0 space-y-5 rounded-xl border bg-card p-5">
        <legend className="sr-only">Configuração da marca</legend>
        <p className="type-meta">Origem: {editor.record?.brand ? "publicada na aplicação" : "arquivo da planta ou padrão"} · Revisão {editor.record?.revision ?? "—"}</p>
        <div className="space-y-2"><Label htmlFor="brand-name">Nome da aplicação</Label><Input id="brand-name" maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="brand-mark">Sigla</Label><Input id="brand-mark" maxLength={3} value={draft.mark} onChange={(e) => setDraft({ ...draft, mark: e.target.value })} /></div>
        <div className="space-y-2"><p className="type-label">Paletas</p><div className="flex flex-wrap gap-2">{BRAND_PRESETS.map((p) => <Button key={p.name} variant="outline" onClick={() => setDraft({ ...draft, colors: { ...p.colors } })}>{p.name}</Button>)}</div></div>
        <div className="grid gap-3 sm:grid-cols-3">{([['brand', 'Marca'], ['canvas', 'Fundo'], ['ink', 'Texto']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`brand-${key}`}>{label}</Label><Input id={`brand-${key}`} value={draft.colors[key]} maxLength={7} onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [key]: e.target.value } })} /></div>)}</div>
        {([['logo', 'Logotipo'], ['symbol', 'Símbolo']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`brand-${key}`}>{label} · PNG até 256 KiB</Label><Input id={`brand-${key}`} type="file" accept="image/png" onChange={(e) => void image(key, e.target.files?.[0])} />{draft[key] && <Button variant="ghost" onClick={() => { setDraft({ ...draft, [key]: null }); setPreview((p) => ({ ...p, [key]: undefined })) }}>Remover {label.toLowerCase()}</Button>}</div>)}
        <p className="type-meta">Fonte atual: {draft.font.family}. A fonte configurada pela planta será preservada.</p>
      </fieldset>
      <section aria-label="Prévia da identidade" style={problems.length ? undefined : brandVars(draft) as CSSProperties} className="min-w-0 space-y-5 rounded-xl border bg-surface-canvas p-5 text-foreground">
        <p className="type-label">Prévia</p>
        <div className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4">{logo ? <img src={logo} alt="Logotipo em prévia" className="max-h-12 max-w-full object-contain" /> : <><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">{draft.mark}</span><span className="type-title break-words">{draft.name}</span></>}</div>
        <div className="space-y-4 rounded-xl border bg-card p-5"><p className="type-title">Permissão de trabalho</p><p className="type-body">A identidade será aplicada ao login, ao menu e às telas da unidade.</p><Button tabIndex={-1}>Ação principal</Button></div>
        <p className="type-meta">As cores dos estados de segurança permanecem independentes da marca.</p>
        {problems.length > 0 && <ul role="alert" className="list-disc space-y-2 pl-5 type-body">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </section>
    </div>
    <div className="flex flex-wrap gap-2"><Button disabled={disabled || problems.length > 0} onClick={() => void saved(draft)}><SaveIcon />Publicar identidade</Button><Button variant="outline" disabled={disabled} onClick={() => { setDraft(editableBrand(editor.record?.brand ?? active)); setPreview({}) }}>Descartar alterações</Button><Button variant="ghost" disabled={disabled || !editor.record?.brand} onClick={() => setRestore(true)}><RotateCcwIcon />Restaurar tema da planta</Button></div>
    <Dialog open={restore} onOpenChange={setRestore}><DialogContent><DialogHeader><DialogTitle>Restaurar o tema da planta?</DialogTitle><DialogDescription>O arquivo de tema da instalação voltará a ser utilizado. Quando não houver arquivo, será usado o padrão do produto. A alteração ficará na auditoria.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRestore(false)}>Cancelar</Button><Button disabled={disabled} onClick={() => { setRestore(false); void saved(null) }}>Restaurar</Button></DialogFooter></DialogContent></Dialog>
  </Page>
}

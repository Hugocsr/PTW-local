import { useState, type CSSProperties } from "react"
import { CheckIcon, LockOpenIcon, RotateCcwIcon, SaveIcon } from "lucide-react"
import { toast } from "sonner"
import { appearanceProblems, BRAND_PRESETS, brandImageUrl, editableBrand } from "@/core/appearance"
import { brandVars, DEFAULT_BRAND, type Brand } from "@/core/brand"
import { useAppearance } from "@/data/hooks"
import { useBrand } from "@/data/brand"
import { useSim } from "@/sim/SimProvider"
import { Page, PageHeader } from "@/components/shell/Page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
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
    <PageHeader title="Identidade visual" meta="Logotipo e template de cores da unidade. Valem para todas as telas; a prévia fica aqui até publicar." />
    {editor.error && <div role="alert" className="rounded-lg border p-4 type-body"><p>{editor.error.message}</p><Button variant="outline" onClick={() => void editor.reload()} disabled={editor.busy}>Recarregar configuração</Button></div>}
    {!editor.record && !editor.error && <p role="status" className="type-meta">Carregando configuração…</p>}
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <fieldset disabled={disabled} className="min-w-0 space-y-5 rounded-lg border bg-card p-5 shadow-(--shadow-elev-2)">
        <legend className="sr-only">Configuração da marca</legend>
        <p className="type-meta">Origem: {editor.record?.brand ? "publicada na aplicação" : "arquivo da planta ou padrão"} · Revisão {editor.record?.revision ?? "—"}</p>
        <div className="space-y-2"><Label htmlFor="brand-name">Nome da aplicação</Label><Input id="brand-name" maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="brand-mark">Sigla</Label><Input id="brand-mark" maxLength={3} value={draft.mark} onChange={(e) => setDraft({ ...draft, mark: e.target.value })} /></div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="type-field">Template de cores</p>
            <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, colors: { ...DEFAULT_BRAND.colors } })}><RotateCcwIcon />Restaurar padrão</Button>
          </div>
          <p className="type-meta">Templates definidos pela Axians: selecione um. As cores de estado de segurança não mudam com o template.</p>
          <div role="radiogroup" aria-label="Template de cores" className="grid gap-2 sm:grid-cols-2">
            {BRAND_PRESETS.map((p) => {
              const on = draft.colors.brand === p.colors.brand && draft.colors.canvas === p.colors.canvas && draft.colors.ink === p.colors.ink
              return (
                <button key={p.name} type="button" role="radio" aria-checked={on} onClick={() => setDraft({ ...draft, colors: { ...p.colors } })}
                  className={cn("flex min-h-14 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors motion-fast hover:border-border-strong", on ? "border-primary ring-1 ring-primary" : "border-border")}>
                  <span aria-hidden className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-black/10">
                    <span className="size-6" style={{ background: p.colors.brand }} />
                    <span className="size-6" style={{ background: `color-mix(in srgb, ${p.colors.brand} 9%, white)` }} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-semibold">{p.name}</span><span className="type-meta">{p.note}</span></span>
                  {on && <CheckIcon aria-hidden className="size-4 text-primary" />}
                </button>
              )
            })}
          </div>
          {!BRAND_PRESETS.some((p) => p.colors.brand === draft.colors.brand && p.colors.canvas === draft.colors.canvas && p.colors.ink === draft.colors.ink) &&
            <p className="type-meta">Cores atuais vindas do arquivo da planta ({draft.colors.brand}). Escolha um template para seguir o design system.</p>}
        </div>
        {([['logo', 'Logotipo'], ['symbol', 'Símbolo']] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={`brand-${key}`}>{label} · PNG até 256 KiB</Label><Input id={`brand-${key}`} type="file" accept="image/png" onChange={(e) => void image(key, e.target.files?.[0])} />{draft[key] && <Button variant="ghost" onClick={() => { setDraft({ ...draft, [key]: null }); setPreview((p) => ({ ...p, [key]: undefined })) }}>Remover {label.toLowerCase()}</Button>}</div>)}
        <p className="type-meta">Fonte atual: {draft.font.family}. A fonte configurada pela planta será preservada.</p>
      </fieldset>
      <section aria-label="Prévia da identidade" style={problems.length ? undefined : brandVars(draft) as CSSProperties} className="min-w-0 space-y-4 rounded-lg border bg-card p-5 text-foreground shadow-(--shadow-elev-2)">
        <p className="type-label">Prévia ao vivo</p>
        <div className="space-y-2"><p className="type-meta">Barra do sistema</p>
          <div className="flex min-h-12 items-center gap-3 rounded-lg bg-primary px-4 text-primary-foreground">{logo ? <img src={logo} alt="Logotipo em prévia" className="max-h-8 max-w-full object-contain" /> : <><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">{draft.mark !== DEFAULT_BRAND.mark ? <span className="text-xs font-bold">{draft.mark}</span> : <LockOpenIcon className="size-4" />}</span><span className="truncate text-sm font-semibold">{draft.name}</span></>}</div>
        </div>
        <div className="space-y-2"><p className="type-meta">Tela de login</p>
          <div className="flex justify-center rounded-lg bg-primary/90 p-4"><div className="flex w-full max-w-64 flex-col items-center gap-3 rounded-xl bg-card p-4 shadow-lg"><span className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><LockOpenIcon className="size-3.5" /></span><span className="text-sm font-semibold">{draft.name}</span></span><Button tabIndex={-1} className="h-8 w-full">Entrar</Button></div></div>
        </div>
        <div className="space-y-2"><p className="type-meta">Elementos da interface</p>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface-canvas p-4"><Button tabIndex={-1}>Botão primário</Button><Button tabIndex={-1} variant="outline">Secundário</Button><span className="text-sm font-semibold text-primary underline-offset-4">Link de ação</span><span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-hover">Badge</span></div>
        </div>
        <p className="type-meta">As cores dos estados de segurança permanecem independentes da marca.</p>
        {problems.length > 0 && <ul role="alert" className="list-disc space-y-2 pl-5 type-body">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      </section>
    </div>
    <div className="flex flex-wrap gap-2"><Button disabled={disabled || problems.length > 0} onClick={() => void saved(draft)}><SaveIcon />Publicar identidade</Button><Button variant="outline" disabled={disabled} onClick={() => { setDraft(editableBrand(editor.record?.brand ?? active)); setPreview({}) }}>Descartar alterações</Button><Button variant="ghost" disabled={disabled || !editor.record?.brand} onClick={() => setRestore(true)}><RotateCcwIcon />Restaurar tema da planta</Button></div>
    <Dialog open={restore} onOpenChange={setRestore}><DialogContent><DialogHeader><DialogTitle>Restaurar o tema da planta?</DialogTitle><DialogDescription>O arquivo de tema da instalação voltará a ser utilizado. Quando não houver arquivo, será usado o padrão do produto. A alteração ficará na auditoria.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRestore(false)}>Cancelar</Button><Button disabled={disabled} onClick={() => { setRestore(false); void saved(null) }}>Restaurar</Button></DialogFooter></DialogContent></Dialog>
  </Page>
}

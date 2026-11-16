import { Fragment, useMemo, useState, type ReactNode } from "react"
import { CircleCheckIcon, CopyIcon, DownloadIcon, FileInputIcon, OctagonXIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { TONE_BLOCK, TONE_TEXT } from "@/components/shell/Status"
import { cn } from "@/lib/utils"
import { exportarModelo, validarPacote } from "@/core/templatePackage"
import { useRegistry } from "@/registry/store"
import type { PermitTemplate, TemplateVersion } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { useData } from "@/data/context"
import { FormDialog, TextField } from "./forms"

const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g

/** A light tint, no dependency: keys, strings, numbers and literals. The text is unchanged. */
function tint(json: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of json.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push(json.slice(last, at))
    const cls = m[1] ? (m[2] ? "text-foreground font-medium" : "text-st-ok-fg") : m[3] ? "text-st-pending-fg" : "text-st-attention-fg"
    out.push(<Fragment key={n++}><span className={cls}>{m[1] ?? m[3] ?? m[4]}</span>{m[2] ?? ""}</Fragment>)
    last = at + m[0].length
  }
  if (last < json.length) out.push(json.slice(last))
  return out
}

const bytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1).replace(".", ",")} KB`)
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "modelo"

/** The version as the `ptw.modelo/1` package: read-only, always the current state of the draft. */
export function JsonView({ tpl, ver, onImport }: { tpl: PermitTemplate; ver: TemplateVersion; onImport: () => void }) {
  const { state, now } = useRegistry()
  const { canEditModels, canExport, serverDown } = useSim()
  const data = useData()
  const [exporting, setExporting] = useState<"copy" | "download" | null>(null)
  const [reason, setReason] = useState("")
  const built = useMemo(() => {
    const stamp = now()
    const text = JSON.stringify(exportarModelo(tpl, state, { agora: stamp, versaoId: ver.id }), null, 2)
    const problems = validarPacote(JSON.parse(text), state, stamp).problemas.filter((p) => p.nivel === "erro")
    return { text, problems }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` only stamps the export; what matters is the model and the registry
  }, [tpl, ver, state])
  const { text, problems } = built
  const stages = ver.stages.length
  const items = (ver.form?.sections ?? []).reduce((n, s) => n + s.items.length, 0)
  const slots = ver.stages.reduce((n, s) => n + s.slots.length, 0)

  const download = (content: string) => {
    const url = URL.createObjectURL(new Blob([content + "\n"], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${slug(tpl.name)}-v${ver.number}.ptw-modelo.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  const exportPackage = async () => {
    if (!canExport || !reason.trim() || !data.registry.exportTemplate) return
    const result = await data.registry.exportTemplate(tpl.id, ver.id, reason.trim())
    if ("code" in result) { toast.error("Não foi possível exportar o modelo", { description: result.message }); return }
    if (exporting === "copy") {
      try { await navigator.clipboard.writeText(result.text); toast.success("JSON copiado") }
      catch { toast.error("Não foi possível copiar", { description: "Use Baixar para guardar o arquivo." }); return }
    } else download(result.text)
    setExporting(null); setReason("")
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canExport && <Button className="min-h-11 md:min-h-9" disabled={serverDown} onClick={() => setExporting("copy")}><CopyIcon data-icon="inline-start" />Copiar</Button>}
        {canExport && <Button variant="outline" className="min-h-11 bg-surface-row md:min-h-9" disabled={serverDown} onClick={() => setExporting("download")}><DownloadIcon data-icon="inline-start" />Baixar</Button>}
        {canEditModels && <Button variant="outline" className="min-h-11 bg-surface-row md:min-h-9" disabled={serverDown} onClick={onImport}><FileInputIcon data-icon="inline-start" />Importar JSON…</Button>}
      </div>
      <FormDialog open={exporting !== null} onOpenChange={(open) => { if (!open) setExporting(null) }} title="Exportar modelo" description="O pacote será lido do servidor. A exportação e seu motivo ficam registrados na auditoria." valid={canExport && !!reason.trim()} submitLabel={exporting === "copy" ? "Copiar JSON" : "Baixar JSON"} savingLabel="Exportando…" missing={["Motivo"]} onSubmit={exportPackage}>
        <TextField label="Motivo da exportação" value={reason} onChange={setReason} maxLength={500} />
      </FormDialog>
      <p className="type-meta flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{bytes(new Blob([text]).size)}</span>
        <span>{stages} {stages === 1 ? "etapa" : "etapas"}</span>
        <span>{items} {items === 1 ? "item" : "itens"}</span>
        <span>{slots} {slots === 1 ? "assinatura" : "assinaturas"}</span>
        {problems.length === 0 && <span className={cn("inline-flex items-center gap-1", TONE_TEXT.ok)}><CircleCheckIcon className="size-4 shrink-0" aria-hidden />Pacote válido</span>}
      </p>
      {problems.length > 0 && (
        <div role="status" className={cn("flex flex-col gap-1 rounded-lg border p-3", TONE_BLOCK.stop)}>
          <span className={cn("inline-flex items-center gap-1 type-label", TONE_TEXT.stop)}><OctagonXIcon className="size-4 shrink-0" aria-hidden />{problems.length === 1 ? "1 problema no pacote" : `${problems.length} problemas no pacote`}</span>
          <ul className={cn("flex flex-col gap-1 type-meta", TONE_TEXT.stop)}>{problems.map((p, i) => <li key={i}>{p.onde ? `${p.onde}: ` : ""}{p.mensagem}</li>)}</ul>
        </div>
      )}
      <pre tabIndex={0} aria-label="Pacote ptw.modelo/1 (JSON, somente leitura)" className="type-data max-h-[32rem] min-w-0 overflow-auto whitespace-pre rounded-lg border bg-surface-row p-3 leading-relaxed focus-visible:outline-2 focus-visible:outline-ring"><code>{tint(text)}</code></pre>
    </div>
  )
}

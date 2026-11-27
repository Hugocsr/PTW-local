/** Screen 1: the list of models, and the name dialog. */
import { useState } from "react"
import { CircleAlertIcon, CircleCheckIcon, FileInputIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldGroup } from "@/components/ui/field"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Page, PageHeader } from "@/components/shell/Page"
import { useSim } from "@/sim/SimProvider"
import { useRegistry } from "@/registry/store"
import { type PermitTemplate, type TemplateVersion } from "@/registry/types"
import { uuidv7 } from "@/lib/id"
import { normalizeSeparation } from "@/core/templateVersions"
import { DataTable } from "../DataTable"
import { TextField } from "../forms"
import { defaultStages } from "../FlowEditor"
import { DownBanner } from "../../work/state"
import { ImportView } from "../ImportView"
import { StatusBadge } from "@/components/shell/Status"
import { ModelDetail } from "./ModelDetail"
import { activeOf, shortDate } from "./shared"

export function TemplatesView() {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const { templates } = state
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openVer, setOpenVer] = useState<string | null>(null)
  const open = templates.find((t) => t.id === openId)

  if (importing && sim.canEditModels) return <ImportView onBack={() => setImporting(false)} onCreated={(tplId, verId) => { setImporting(false); setOpenId(tplId); setOpenVer(verId) }} />
  if (open) return <ModelDetail key={open.id} tpl={open} initialVersion={openVer} onImport={() => setImporting(true)} onBack={() => { setOpenId(null); setOpenVer(null) }} />

  return (
    <Page>
      <PageHeader title="Modelos de PT" count={templates.length}
        actions={sim.canEditModels ? {
          primary: { label: "Novo modelo", icon: PlusIcon, disabled: sim.serverDown, onClick: () => setDialog(true) },
          secondary: [{ label: "Importar modelo", icon: FileInputIcon, disabled: sim.serverDown, onClick: () => setImporting(true) }],
        } : undefined} />
      {sim.serverDown && <DownBanner now={sim.now} />}

      <DataTable<PermitTemplate>
        rows={templates}
        rowKey={(t) => t.id}
        noun={["modelo", "modelos"]}
        searchLabel="Buscar modelo"
        searchText={(t) => t.name}
        onRowClick={(t) => setOpenId(t.id)}
        defaultSort={{ id: "name", dir: "asc" }}
        filter={{
          label: "Filtrar por situação",
          options: [{ value: "ativa", label: "Com versão em uso" }, { value: "sem", label: "Não utilizável" }],
          test: (t, v) => (v === "ativa" ? !!activeOf(t) : !activeOf(t)),
        }}
        empty={<Empty><EmptyHeader><EmptyTitle>Nenhum modelo</EmptyTitle></EmptyHeader></Empty>}
        columns={[
          {
            id: "name", header: "Modelo", className: "whitespace-normal font-medium", sort: (x, y) => x.name.localeCompare(y.name, "pt-BR"),
            cell: (t) => <button type="button" className="min-h-11 min-w-11 text-left hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => { e.stopPropagation(); setOpenId(t.id) }}>{t.name}</button>,
          },
          {
            id: "active", header: "Versão em uso", sort: (x, y) => (activeOf(x)?.number ?? 0) - (activeOf(y)?.number ?? 0),
            cell: (t) => { const act = activeOf(t); return act ? <StatusBadge tone="ok" icon={CircleCheckIcon}>Versão {act.number}</StatusBadge> : <StatusBadge tone="attention" icon={CircleAlertIcon}>Não utilizável</StatusBadge> },
          },
          {
            id: "since", header: "Ativa desde", className: "hidden tabular-nums lg:table-cell",
            sort: (x, y) => (activeOf(x)?.activatedAt ?? "").localeCompare(activeOf(y)?.activatedAt ?? ""),
            cell: (t) => { const act = activeOf(t); return act ? shortDate(act.activatedAt ?? act.createdAt) : "—" },
          },
          { id: "versions", header: "Versões", align: "right", className: "hidden lg:table-cell", sort: (x, y) => x.versions.length - y.versions.length, cell: (t) => t.versions.length },
          {
            id: "drafts", header: "Rascunhos", align: "right", className: "hidden lg:table-cell",
            sort: (x, y) => x.versions.filter((v) => v.status === "rascunho").length - y.versions.filter((v) => v.status === "rascunho").length,
            cell: (t) => t.versions.filter((v) => v.status === "rascunho").length || "—",
          },
        ]}
      />

      <NameDialog
        open={dialog}
        onOpenChange={setDialog}
        title="Novo modelo de PT"
        description="Nome do novo modelo. Ele começa com a versão 1 como rascunho."
        submit="Criar modelo"
        onSubmit={async (name) => {
          const at = now()
          const v: TemplateVersion = {
            id: uuidv7(), number: 1, status: "rascunho", createdAt: at, activatedAt: null, note: "Primeira versão",
            locationTypeIds: [], assetTypeIds: [], workTypeIds: [], stages: defaultStages(), separation: [], form: { sections: [] },
            maxWindowHours: null, holdsEquipment: true, origin: "manual", sourceSha256: null,
          }
          v.separation = [normalizeSeparation(v.stages[1].slots[0].id, v.stages[2].slots[0].id, true)]
          const t: PermitTemplate = { id: uuidv7(), name, retentionClass: "pt", revision: 1, updatedAt: at, versions: [v] }
          if (!await upsert("templates", t)) return
          setOpenId(t.id)
          setDialog(false)
          toast.success("Modelo criado", { description: name })
        }}
      />
    </Page>
  )
}

/** A name typed in a small modal: creating a model and renaming one (the page title is never an input). */
export function NameDialog({ open, onOpenChange, title, description, submit, initial = "", onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; submit: string; initial?: string; onSubmit: (n: string) => void | Promise<void>
}) {
  const [name, setName] = useState(initial)
  const [saving, setSaving] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => { if (saving) return; onOpenChange(o); if (!o) setName(initial) }}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (!name.trim() || saving) return; setSaving(true); try { await onSubmit(name.trim()) } finally { setSaving(false) } }}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <TextField label="Nome" value={name} onChange={setName} placeholder="Ex.: Trabalho em altura" />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 md:min-h-9" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" className="min-h-11 md:min-h-9" disabled={saving || !name.trim()}>{saving ? "Salvando…" : submit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

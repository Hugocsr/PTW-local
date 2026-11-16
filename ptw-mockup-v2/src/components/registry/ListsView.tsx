import { useId, useState } from "react"
import { CircleCheckIcon, CircleDashedIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Page, PageHeader, PageSection, PropertyList, SidePanel } from "@/components/shell/Page"
import { cn } from "@/lib/utils"
import { newId, useRegistry } from "@/registry/store"
import type { OptionList, RegistryState } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "@/components/work/state"
import { StatusBadge, TONE_TEXT } from "@/components/shell/Status"
import { DataTable } from "./DataTable"
import { FormDialog, TextField } from "./forms"
import { useSettledSave } from "./common"

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
/** Database sizes: list name 1–120, item 1–200. */
const MAX_NAME = 120, MAX_ITEM = 200
const nameProblem = (state: RegistryState, name: string, exceptId?: string) =>
  !name.trim() ? "Informe um nome." : name.trim().length > MAX_NAME ? `No máximo ${MAX_NAME} caracteres.`
    : state.optionLists.some((l) => l.id !== exceptId && same(l.name, name)) ? "Já existe uma lista com este nome." : null

/** Template versions with a tick question (or a tick column of a group) that takes its options from this list. */
function usesOf(state: RegistryState, listId: string): string[] {
  return state.templates.flatMap((t) =>
    t.versions
      .filter((v) => v.form?.sections.some((s) => s.items.some((i) => (i.kind === "marcacao" && i.listId === listId)
        || (i.kind === "grupo" && i.columns.some((c) => c.kind === "marcacao" && c.listId === listId)))))
      .map((v) => `${t.name} v${v.number}`),
  )
}

/**
 * Configuração › Listas: option lists that form questions reuse (EPI, perigos, documentos…).
 * Items are deactivated, never deleted, so answers given earlier keep their meaning.
 */
export function ListsView() {
  const { state, upsert, now } = useRegistry()
  const sim = useSim()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const open = state.optionLists.find((l) => l.id === openId)
  if (open) return <ListDetail key={open.id} list={open} onBack={() => setOpenId(null)} />

  return (
    // Model A (DESIGN.md): header → toolbar → table, full frame width, no card.
    <Page>
      <PageHeader title="Listas" count={state.optionLists.length} meta="Opções reutilizadas nas perguntas de marcação dos formulários."
        actions={sim.canEditRegistry ? { primary: { label: "Nova lista", icon: PlusIcon, disabled: sim.serverDown, onClick: () => setCreating(true) } } : undefined} />
      {sim.serverDown && <DownBanner now={sim.now} />}
      {creating && (
        <NewListDialog
          onClose={() => setCreating(false)}
          onCreate={async (name) => {
            const list: OptionList = { id: newId(), name, revision: 1, updatedAt: now(), items: [] }
            if (!await upsert("optionLists", list)) return
            toast.success("Lista criada", { description: name })
            setCreating(false)
            setOpenId(list.id)
          }}
        />
      )}
      <DataTable<OptionList>
        rows={state.optionLists}
        rowKey={(l) => l.id}
        noun={["lista", "listas"]}
        searchLabel="Buscar lista ou item"
        searchText={(l) => `${l.name} ${l.items.map((i) => i.label).join(" ")}`}
        onRowClick={(l) => setOpenId(l.id)}
        defaultSort={{ id: "name", dir: "asc" }}
        filter={{
          label: "Filtrar por uso",
          options: [{ value: "usada", label: "Em uso" }, { value: "livre", label: "Sem uso" }],
          test: (l, v) => (usesOf(state, l.id).length > 0) === (v === "usada"),
        }}
        columns={[
          {
            id: "name", header: "Lista", className: "font-medium", sort: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
            cell: (l) => <button type="button" className="min-h-11 min-w-11 text-left hover:underline focus-visible:underline focus-visible:outline-none" onClick={(e) => { e.stopPropagation(); setOpenId(l.id) }}>{l.name}</button>,
          },
          { id: "items", header: "Itens", align: "right", sort: (a, b) => activeCount(a) - activeCount(b), cell: (l) => activeCount(l) },
          { id: "uses", header: "Uso", cell: (l) => <UseBadge n={usesOf(state, l.id).length} /> },
        ]}
      />
    </Page>
  )
}

/** Em uso = ok (with how many model versions), Sem uso = neutral. */
function UseBadge({ n }: { n: number }) {
  return n > 0
    ? <StatusBadge tone="ok" icon={CircleCheckIcon}>Em uso<span className="max-sm:hidden"> · {n} {n === 1 ? "versão" : "versões"}</span></StatusBadge>
    : <StatusBadge tone="neutral" icon={CircleDashedIcon}>Sem uso</StatusBadge>
}

const activeCount = (l: OptionList) => l.items.filter((i) => i.active).length

/** Creating a list asks for its name first (same as "Criar modelo"): no unnamed list is left behind. */
function NewListDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const { state } = useRegistry()
  const [name, setName] = useState("")
  const problem = name.trim() ? nameProblem(state, name) : null
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Nova lista" description="Lista de opções para perguntas de marcação."
      valid={!!name.trim() && !problem} missing={name.trim() ? [] : ["Nome"]} submitLabel="Criar lista" onSubmit={() => onCreate(name.trim())}>
      <TextField label="Nome" value={name} onChange={setName} placeholder="Ex.: EPI" error={problem ?? undefined} />
    </FormDialog>
  )
}

/**
 * Text saved when typing stops or the field is left (like Tipos): an empty, too long or repeated
 * value is flagged in words and not saved; leaving the field puts back the last saved value.
 */
function SavedInput({ value, onSave, problem, readOnly, className, ...aria }: {
  value: string
  onSave: (v: string) => void
  problem: (v: string) => string | null
  readOnly?: boolean
  className?: string
  id?: string
  "aria-label"?: string
}) {
  const [draft, setDraft] = useState(value)
  const errId = useId()
  const err = problem(draft)
  const save = useSettledSave((v) => { if (v !== value) onSave(v) })
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input {...aria} value={draft} readOnly={readOnly} aria-invalid={!!err} aria-describedby={err ? errId : undefined} className={className}
        onChange={(e) => { setDraft(e.target.value); if (!problem(e.target.value)) save.schedule(e.target.value.trim()); else save.cancel() }}
        onBlur={() => { if (err) { save.cancel(); setDraft(value) } else save.flush() }} />
      {err && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)}>{err}</p>}
    </div>
  )
}

function ListDetail({ list, onBack }: { list: OptionList; onBack: () => void }) {
  const { state, upsert, removeOptionList } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown
  const [text, setText] = useState("")
  const [renaming, setRenaming] = useState(false)
  const uses = usesOf(state, list.id)
  const save = (patch: Partial<OptionList>) => upsert("optionLists", { ...list, ...patch })
  const find = (label: string, except?: string) => list.items.find((i) => i.id !== except && same(i.label, label))
  const itemProblem = (label: string, except?: string) => {
    if (!label.trim()) return "Informe o item."
    if (label.trim().length > MAX_ITEM) return `No máximo ${MAX_ITEM} caracteres.`
    const twin = find(label, except)
    return twin ? (twin.active ? "Este item já existe." : "Este item já existe, inativo: religue-o na lista.") : null
  }
  const add = async () => {
    const v = text.trim()
    if (!v || itemProblem(v) || down) return
    if (await save({ items: [...list.items, { id: newId(), label: v, active: true }] })) setText("")
  }
  const active = activeCount(list)
  const inactive = list.items.length - active
  const newProblem = text.trim() ? itemProblem(text) : null
  const itemsText = `${active} ${active === 1 ? "ativo" : "ativos"}${inactive ? ` · ${inactive} ${inactive === 1 ? "inativo" : "inativos"}` : ""}`
  const usedIn = uses.length === 0
    ? <span className="type-meta">Nenhum modelo usa esta lista.</span>
    : (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">{uses.map((u) => <Badge key={u} variant="secondary">{u}</Badge>)}</div>
        <span className="type-meta">Mudanças aqui valem para todos esses modelos.</span>
      </div>
    )

  // Model C (DESIGN.md): back link → header (Renomear, Remover in "⋯") → items; properties in the side panel from xl.
  return (
    <Page>
      <PageHeader
        back={{ label: "Listas", onClick: onBack }}
        title={list.name}
        meta={<>{list.items.length} {list.items.length === 1 ? "item" : "itens"}{inactive ? ` (${inactive} ${inactive === 1 ? "inativo" : "inativos"})` : ""}<UseBadge n={uses.length} /></>}
        actions={sim.canEditRegistry ? {
          menu: [
            { label: "Renomear", icon: PencilIcon, disabled: down, onClick: () => setRenaming(true) },
            {
              label: "Remover", icon: Trash2Icon, destructive: true, disabled: down || uses.length > 0,
              confirm: { what: list.name, detail: `Leva junto ${list.items.length} ${list.items.length === 1 ? "item" : "itens"}.` },
              onClick: async () => { if (!await removeOptionList(list.id)) return; onBack(); toast("Lista removida", { description: list.name }) },
            },
          ],
        } : undefined}
      />
      {down && <DownBanner now={sim.now} />}

      <SidePanel label="Propriedades da lista"
        properties={<PropertyList items={[{ label: "Itens", value: itemsText }, { label: "Usada em", value: usedIn }]} />}>
        <PageSection title="Itens">
          {list.items.length === 0 && <p className="type-meta">Nenhum item ainda.</p>}
          {list.items.length > 0 && (
            <ol className="flex flex-col divide-y border-y">
              {list.items.map((it, k) => (
                <li key={it.id} className={cn("flex items-start gap-2 py-2", !it.active && "opacity-70")}>
                  <span className="mt-3 w-6 shrink-0 text-right type-meta tabular-nums md:mt-2">{k + 1}</span>
                  {sim.canEditRegistry ? <SavedInput value={it.label} aria-label={`Item ${k + 1}`} readOnly={down} problem={(v) => itemProblem(v, it.id)}
                    onSave={(label) => save({ items: list.items.map((x) => (x.id === it.id ? { ...x, label } : x)) })}
                    className={cn("min-h-11 md:min-h-9", !it.active && "line-through")} /> : <span className={cn("flex min-h-11 min-w-0 flex-1 items-center break-words type-body md:min-h-9", !it.active && "line-through")}>{it.label}</span>}
                  <label className="flex min-h-11 shrink-0 items-center gap-2 md:min-h-9">
                    {sim.canEditRegistry && <Switch checked={it.active} disabled={down} onCheckedChange={(v) => save({ items: list.items.map((x) => (x.id === it.id ? { ...x, active: v } : x)) })} aria-label={`Ativo: ${it.label}`} />}
                    <span className={cn("w-12 type-meta", !it.active && TONE_TEXT.neutral)}>{it.active ? "Ativo" : "Inativo"}</span>
                  </label>
                </li>
              ))}
            </ol>
          )}
          {sim.canEditRegistry && <form className="flex flex-col gap-1" onSubmit={async (e) => { e.preventDefault(); add() }}>
            <div className="flex items-center gap-2">
              <Input value={text} readOnly={down} onChange={(e) => setText(e.target.value)} placeholder="Novo item" aria-label="Novo item" aria-invalid={!!newProblem}
                aria-describedby={newProblem ? "new-item-err" : undefined} className="min-h-11 flex-1 md:min-h-9" />
              <Button type="submit" variant="outline" className="min-h-11 md:min-h-9" disabled={!text.trim() || !!newProblem || down}><PlusIcon data-icon="inline-start" />Item</Button>
            </div>
            {newProblem && <p id="new-item-err" className={cn("type-meta", TONE_TEXT.stop)}>{newProblem}</p>}
          </form>}
          <p className="type-meta">Item inativo não aparece em perguntas novas.</p>
        </PageSection>

        {/* Below xl the side panel's properties are hidden: the same facts live here. */}
        <PageSection title="Usada em" className="xl:hidden">{usedIn}</PageSection>
      </SidePanel>

      {renaming && (
        <RenameListDialog list={list} onClose={() => setRenaming(false)}
          onSave={async (name) => { if (!await save({ name })) return; toast.success("Lista renomeada", { description: name }); setRenaming(false) }} />
      )}
    </Page>
  )
}

/** "Renomear" (DESIGN.md: the title is never a field): same name rules as creating a list. */
function RenameListDialog({ list, onClose, onSave }: { list: OptionList; onClose: () => void; onSave: (name: string) => void }) {
  const { state } = useRegistry()
  const [name, setName] = useState(list.name)
  const problem = name.trim() ? nameProblem(state, name, list.id) : null
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Renomear lista" description="Novo nome da lista de opções."
      valid={!!name.trim() && !problem} missing={name.trim() ? [] : ["Nome"]} onSubmit={() => onSave(name.trim())}>
      <TextField label="Nome" value={name} onChange={setName} error={problem ?? undefined} />
    </FormDialog>
  )
}

import { useId, useState } from "react"
import { runAsUndo } from "@/audit/store"
import { ArrowLeftIcon, ArrowRightIcon, BoxIcon, ChevronRightIcon, GitForkIcon, MapPinIcon, PencilIcon, PlusIcon, ShieldCheckIcon, Trash2Icon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia } from "@/components/ui/item"
import { Page, PageHeader } from "@/components/shell/Page"
import { cn } from "@/lib/utils"
import { useRegistry } from "@/registry/store"
import type { RegistryState, TypeDef, TypeList } from "@/registry/types"
import { useSim } from "@/sim/SimProvider"
import { DownBanner } from "@/components/work/state"
import { assetIcon, locationIcon, LockedReason, TypeIconPicker, useSettledSave } from "./common"
import { FormDialog, SelectField, TextField } from "./forms"
import { StatusBadge, TONE_TEXT } from "@/components/shell/Status"
import { CircleSlashIcon } from "lucide-react"

interface Family {
  key: TypeList
  title: string
  icon: LucideIcon
  newLabel: string
  /** Where a type is used, in words ("2 locais", "3 pessoas e 1 modelo"); "" when unused. */
  usage: (s: RegistryState, id: string) => string
  /** Location and asset types carry a chosen icon; the others show a fixed one. */
  pickIcon?: "locationTypes" | "assetTypes"
  rowIcon?: LucideIcon
}

const count = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : "")
const both = (...parts: string[]) => parts.filter(Boolean).join(" e ")

/** Name of a type: 1 to 80 characters (database). */
const MAX_LABEL = 80

/** A cargo is used by people who hold it and by model versions whose signature slots ask for it. */
function roleUsage(s: RegistryState, id: string) {
  const people = s.people.filter((p) => p.roles.some((r) => r.roleId === id)).length
  const models = s.templates.filter((t) => t.versions.some((v) => v.stages.some((st) => st.slots.some((sl) => (sl.kind ?? "cargo") === "cargo" && sl.roleIds.includes(id))))).length
  return both(count(people, "pessoa", "pessoas"), count(models, "modelo", "modelos"))
}

const FAMILIES: Family[] = [
  { key: "locationTypes", title: "Locais", icon: MapPinIcon, newLabel: "Novo tipo de local", usage: (s, id) => count(s.locations.filter((l) => l.typeId === id).length, "local", "locais"), pickIcon: "locationTypes" },
  { key: "assetTypes", title: "Ativos", icon: BoxIcon, newLabel: "Novo tipo de ativo", usage: (s, id) => count(s.assets.filter((a) => a.typeId === id).length, "ativo", "ativos"), pickIcon: "assetTypes" },
  { key: "roleTypes", title: "Cargos", icon: ShieldCheckIcon, newLabel: "Novo cargo", usage: roleUsage, rowIcon: ShieldCheckIcon },
  { key: "relationKinds", title: "Relações", icon: GitForkIcon, newLabel: "Nova relação (ex.: alimenta)", usage: (s, id) => count(s.relations.filter((r) => r.kindId === id).length, "relação", "relações"), rowIcon: ArrowRightIcon },
]

export function TypesView() {
  const { state, addType, renameType, removeType, restoreType, setTypeIcon, setTypeActive } = useRegistry()
  const sim = useSim()
  const down = sim.serverDown
  const [key, setKey] = useState<TypeList>("locationTypes")
  // Phone (< lg): the family list is its own screen; picking a family opens its types with "← Tipos".
  const [picked, setPicked] = useState(false)
  const [creating, setCreating] = useState(false)
  // Names read as text; the pencil turns only that row into an input.
  const [editing, setEditing] = useState<string | null>(null)

  const fam = FAMILIES.find((f) => f.key === key)!
  const list = state[key]
  const dup = (label: string, exceptId?: string) => list.some((t) => t.label.toLowerCase() === label.trim().toLowerCase() && t.id !== exceptId)
  const total = FAMILIES.reduce((n, f) => n + state[f.key].length, 0)

  // Model B (DESIGN.md): families 20rem on the left, the family's types as rows on the right.
  return (
    <Page>
      <PageHeader title="Tipos" count={total}
        actions={sim.canEditRegistry ? { primary: { label: "Novo tipo", icon: PlusIcon, disabled: down, onClick: () => setCreating(true) } } : undefined} />
      {down && <DownBanner now={sim.now} />}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Famílias de tipos" className={cn("min-w-0", picked && "max-lg:hidden")}>
          <ul className="flex flex-col max-lg:divide-y max-lg:border-y">
            {FAMILIES.map((f) => (
              <li key={f.key}>
                <button type="button" aria-current={f.key === key ? "true" : undefined}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9 max-lg:rounded-none",
                    f.key === key && "lg:bg-accent")}
                  onClick={async () => { setKey(f.key); setPicked(true); setEditing(null) }}>
                  <f.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 type-body">{f.title}</span>
                  <Badge variant="secondary">{state[f.key].length}</Badge>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="types-family" className={cn("flex min-w-0 flex-col gap-3", !picked && "max-lg:hidden")}>
          <Button variant="ghost" className="-ml-2 min-h-11 w-fit px-2 text-muted-foreground hover:text-foreground md:min-h-9 lg:hidden" onClick={() => setPicked(false)}>
            <ArrowLeftIcon data-icon="inline-start" />Tipos
          </Button>
          <div className="flex min-h-11 items-center gap-2 md:min-h-9">
            <h2 id="types-family" className="type-heading">{fam.title}</h2>
            <Badge variant="secondary">{list.length}</Badge>
          </div>

          {list.length === 0 ? (
            <Empty><EmptyHeader><EmptyTitle>Nenhum tipo cadastrado</EmptyTitle></EmptyHeader></Empty>
          ) : (
            <ul className="flex flex-col divide-y border-y">
              {list.map((t, k) => {
                const used = fam.usage(state, t.id)
                const Icon = fam.pickIcon ? (fam.pickIcon === "locationTypes" ? locationIcon(t) : assetIcon(t)) : fam.rowIcon
                const usage = used ? `Em uso: ${used}` : "Sem uso"
                return (
                  <Item asChild key={t.id} size="xs" className="rounded-none px-0 py-1">
                    <li>
                      {/* Centred on the name field, not on the field plus its usage line. */}
                      {fam.pickIcon && sim.canEditRegistry ? (
                        <TypeIconPicker type={t} family={fam.pickIcon} disabled={down || !sim.canEditRegistry} onPick={(icon) => setTypeIcon(key, t.id, icon)} />
                      ) : Icon && <ItemMedia variant="icon" className="mt-3 md:mt-2"><Icon /></ItemMedia>}
                      <ItemContent>
                        {editing === t.id ? (
                          <TypeName t={t} n={k + 1} readOnly={down} isDup={(v) => dup(v, t.id)} onSave={(v) => renameType(key, t.id, v)} onDone={() => setEditing(null)}
                            prefix={key === "relationKinds" ? "A" : undefined} suffix={key === "relationKinds" ? "B" : undefined} />
                        ) : (
                          <div className="flex min-h-11 min-w-0 items-center gap-2 md:min-h-9">
                            {key === "relationKinds" && <span className="type-data shrink-0 rounded bg-muted px-1.5">A</span>}
                            <span className="min-w-0 break-words type-body">{t.label}</span>
                            {key === "relationKinds" && <><ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="type-data shrink-0 rounded bg-muted px-1.5">B</span></>}
                          </div>
                        )}
                        <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta">
                          {!t.active && <StatusBadge tone="neutral" icon={CircleSlashIcon}>Inativo</StatusBadge>}
                          {t.systemKey ? "Usado pelas regras do sistema" : t.active ? usage : `Não é mais oferecido · ${usage.charAt(0).toLowerCase()}${usage.slice(1)}`}
                        </ItemDescription>
                      </ItemContent>
                      {/* Top-aligned with the name field, like the icon (the usage line hangs below both). */}
                      {sim.canEditRegistry && <ItemActions className="self-start">
                        {editing !== t.id && (
                          <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Renomear ${t.label}`} disabled={down} onClick={() => setEditing(t.id)}><PencilIcon /></Button>
                        )}
                        {t.systemKey ? (
                          <LockedReason label={`${t.label} é do sistema, não pode ser removido`} reason="Este tipo define a trava de equipamento (um equipamento, uma PT aberta). Pode ser renomeado, não removido nem desativado." />
                        ) : used ? (
                          // In use: it cannot leave (the records point at it), but it can stop being offered.
                          <Button variant="ghost" className="min-h-11 md:min-h-9" disabled={down}
                            onClick={async () => { if (await setTypeActive(key, t.id, !t.active)) toast(t.active ? "Tipo desativado" : "Tipo reativado", { description: t.label }) }}>
                            {t.active ? "Desativar" : "Reativar"}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover ${t.label}`} disabled={down}
                            onClick={async () => {
                              if (!await removeType(key, t.id)) return
                              toast("Tipo removido", { description: t.label, action: { label: "Desfazer", onClick: () => runAsUndo(() => restoreType(key, t, k)) } })
                            }}><Trash2Icon /></Button>
                        )}
                      </ItemActions>}
                    </li>
                  </Item>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {creating && (
        <NewTypeDialog family={key} onClose={() => setCreating(false)}
          onCreate={async (f, label) => {
            if (!await addType(f, label)) return
            toast.success("Tipo adicionado", { description: label })
            setKey(f)
            setPicked(true)
            setCreating(false)
          }} />
      )}
    </Page>
  )
}

/** "Novo tipo": the family starts as the one in view; the name must not repeat inside that family. */
function NewTypeDialog({ family, onClose, onCreate }: { family: TypeList; onClose: () => void; onCreate: (f: TypeList, label: string) => void }) {
  const { state } = useRegistry()
  const [f, setF] = useState<TypeList>(family)
  const [name, setName] = useState("")
  const fam = FAMILIES.find((x) => x.key === f)!
  const v = name.trim()
  const taken = !!v && state[f].some((t) => t.label.toLowerCase() === v.toLowerCase())
  const long = v.length > MAX_LABEL
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title="Novo tipo" description="Tipo usado nos cadastros."
      valid={!!v && !taken && !long} missing={v ? [] : ["Nome"]} submitLabel="Adicionar tipo" onSubmit={() => onCreate(f, v)}>
      <SelectField label="Família" value={f} onChange={(x) => setF(x as TypeList)} options={FAMILIES.map((x) => ({ value: x.key, label: x.title }))} />
      <TextField label="Nome" value={name} onChange={setName} placeholder={fam.newLabel} error={taken ? "Este tipo já existe." : long ? `No máximo ${MAX_LABEL} caracteres.` : undefined} />
    </FormDialog>
  )
}

/** Type name edited in place once its row is in edit mode (the pencil), saved when typing stops or the field is left (same as Listas). An
 *  empty, too long or duplicate name is flagged and not saved; leaving the field restores the
 *  last saved name. */
function TypeName({ t, n, isDup, onSave, onDone, prefix, suffix, readOnly }: { t: TypeDef; onDone: () => void; n: number; readOnly?: boolean; isDup: (v: string) => boolean; onSave: (v: string) => void; prefix?: string; suffix?: string }) {
  const [draft, setDraft] = useState(t.label)
  const errId = useId()
  const v = draft.trim()
  const problem = !v ? "Informe um nome." : v.length > MAX_LABEL ? `No máximo ${MAX_LABEL} caracteres.` : isDup(v) ? "Já existe um tipo com este nome." : null
  const save = useSettledSave((x) => { if (x !== t.label) onSave(x) })
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {prefix && <span className="type-data shrink-0 rounded bg-muted px-1.5">{prefix}</span>}
        <Input value={draft} readOnly={readOnly} autoFocus aria-label={`Nome do tipo ${n}`} aria-invalid={!!problem} aria-describedby={problem ? errId : undefined}
          className="min-h-11 min-w-0 flex-1 md:min-h-9"
          onChange={(e) => {
            setDraft(e.target.value)
            const n = e.target.value.trim()
            if (n && n.length <= MAX_LABEL && !isDup(n)) save.schedule(n)
            else save.cancel()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            else if (e.key === "Escape") { save.cancel(); setDraft(t.label); onDone() }
          }}
          onBlur={() => { if (problem) { save.cancel(); setDraft(t.label) } else save.flush(); onDone() }} />
        {suffix && <><ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /><span className="type-data shrink-0 rounded bg-muted px-1.5">{suffix}</span></>}
      </div>
      {problem && <p id={errId} className={cn("type-meta", TONE_TEXT.stop)}>{problem}</p>}
    </div>
  )
}

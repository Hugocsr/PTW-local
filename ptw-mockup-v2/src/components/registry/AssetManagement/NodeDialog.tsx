import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { AREA_FIELDS, EQUIPMENT_FIELDS, formValues, PLANT_FIELDS, PROTECTION_FIELDS, protectionOf, sheetFrom, sheetProblems, type AttrField, type Protection } from "@/core/assetAttrs"
import { levelType, locationKind, partOfKindIds, plantsOf } from "@/core/assetTree"
import { byId } from "@/core/indexes"
import { useData, useLocationAssets } from "@/data/hooks"
import { locationPath, newId, useRegistry } from "@/registry/store"
import type { Asset, Location, RecordAttrs } from "@/registry/types"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { FormDialog, SelectField, TextField } from "../forms"
import { PickList } from "../PickList"
import { DateInput } from "../DateInput"
import { AssetIcon } from "@/components/shell/TypeIcon"

/** What the dialog creates or edits (SGI · Nova planta / Nova área / Novo equipamento / Equip. aninhado). */
export type NodeDialogMode =
  | { level: "planta"; existing?: Location }
  | { level: "area"; existing?: Location; plantId?: string }
  | { level: "equip"; existing?: Asset; areaId?: string; parentAssetId?: string }

const META = {
  planta: { title: "Nova planta", edit: "Editar planta", sub: "Unidade industrial do cadastro", save: "Criar planta" },
  area: { title: "Nova área", edit: "Editar área", sub: "Selecione a planta de destino", save: "Criar área" },
  equip: { title: "Novo equipamento", edit: "Editar equipamento", sub: "Planta e área são obrigatórios", save: "Criar equipamento" },
} as const
const NO_PROTECTION: Protection = { tipo: "", principio: "", bypass: "", sistema: "", classeRisco: "", protegidos: [] }
const grid = "grid gap-x-4 gap-y-4 sm:grid-cols-2"

/** The plant type is the one whose systemKey (or name) says "planta"; every other location type can be an area's. */
const locationKindOfType = (t: { systemKey?: string | null; label: string }) =>
  t.systemKey === "planta" || /^planta$/i.test(t.label.trim()) ? "planta" : "area"

export function NodeDialog({ mode, onClose, onSaved }: { mode: NodeDialogMode; onClose: () => void; onSaved: (id: string) => void }) {
  const { state, upsert, update, addType, now } = useRegistry()
  const port = useData()
  const existing = mode.existing
  const fields: readonly AttrField[] = mode.level === "planta" ? PLANT_FIELDS : mode.level === "area" ? AREA_FIELDS : EQUIPMENT_FIELDS
  const nestedIn = mode.level === "equip" && mode.parentAssetId ? byId(state.assets, mode.parentAssetId) : undefined
  const startArea = mode.level === "equip" ? (existing as Asset | undefined)?.locationIds[0] ?? (nestedIn?.locationIds[0] ?? mode.areaId ?? "") : ""
  // SPEC 004: the plant is the root of the area's chain (never an intermediate area), whatever opened the dialog.
  const rootOf = (locId: string) => locId ? locationPath(state.locations, locId)[0]?.id ?? "" : ""
  const startPlant = mode.level === "area" ? ((existing as Location | undefined)?.parentId ?? mode.plantId ?? "") : rootOf(startArea)

  const [name, setName] = useState(existing?.name ?? "")
  const [code, setCode] = useState(existing?.code ?? "")
  const [active, setActive] = useState(existing ? existing.status !== "inativo" : true)
  const [plantId, setPlantId] = useState(startPlant)
  const [areaId, setAreaId] = useState(startArea)
  const areaTypes = state.locationTypes.filter((t) => locationKindOfType(t) !== "planta")
  const defaultAreaType = levelType(state.locationTypes, "area")?.id ?? ""
  const [typeId, setTypeId] = useState(mode.level === "equip" ? (existing as Asset | undefined)?.typeId ?? ""
    : mode.level === "area" ? (existing as Location | undefined)?.typeId ?? defaultAreaType : "")
  const [values, setValues] = useState<Record<string, string>>(() => formValues(existing?.attrs, fields))
  const before = protectionOf(existing?.attrs)
  const [guard, setGuard] = useState(!!before)
  const [prot, setProt] = useState<Protection>(before ?? NO_PROTECTION)

  const plants = plantsOf(state.locations).filter((p) => locationKind(p, state.locationTypes) === "planta" && (p.status !== "inativo" || p.id === plantId))
  const areas = state.locations.filter((l) => l.parentId === plantId && (l.status !== "inativo" || l.id === areaId)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  const plantAssets = useLocationAssets(port.whole ? "" : plantId)
  const candidates = useMemo(() => {
    const under = new Set(state.locations.filter((l) => l.id === plantId || l.parentId === plantId).map((l) => l.id))
    const pool = port.whole ? state.assets.filter((a) => a.locationIds.some((l) => under.has(l))) : plantAssets.items
    return pool.filter((a) => a.id !== existing?.id).map((a) => ({ id: a.id, label: a.name, detail: a.code }))
  }, [port.whole, state.assets, state.locations, plantId, plantAssets.items, existing?.id])

  const problems = sheetProblems(fields, values)
  const protProblems = guard ? sheetProblems(PROTECTION_FIELDS, prot as unknown as Record<string, string>) : {}
  const list = mode.level === "equip" ? state.assets : state.locations
  const taken = !!code.trim() && list.some((r) => r.code.toLowerCase() === code.trim().toLowerCase() && r.id !== existing?.id)
  const missing = [
    !name.trim() && "Nome", !code.trim() && (mode.level === "equip" ? "Código/TAG" : "Código"),
    mode.level !== "planta" && !plantId && "Planta", mode.level === "equip" && !areaId && "Área", mode.level === "equip" && !typeId && "Tipo",
    mode.level === "area" && !typeId && !!areaTypes.length && "Tipo",
  ].filter((x): x is string => !!x)
  const valid = missing.length === 0 && !taken && [...name.trim()].length <= 200 && [...code.trim()].length <= 64 && !Object.keys(problems).length && !Object.keys(protProblems).length
  const m = META[mode.level]
  // SPEC 004: an area only receives PTs of models whose scope accepts its type; say how many do.
  const acceptingModels = mode.level === "area" && typeId
    ? state.templates.filter((t) => t.versions.some((v) => v.status === "ativa" && v.locationTypeIds.includes(typeId))).length : 0
  const typeName = state.locationTypes.find((t) => t.id === typeId)?.label ?? ""
  const modelsHint = !typeId ? undefined : acceptingModels
    ? `${acceptingModels} ${acceptingModels === 1 ? "modelo de PT aceita" : "modelos de PT aceitam"} ${typeName}`
    : "Nenhum modelo de PT aceita este tipo ainda: inclua-o no Escopo do modelo para abrir PTs aqui"

  /** The location type of a level; created (with its icon) the first time the plant uses it. */
  const levelTypeId = async (kind: "planta" | "area"): Promise<string | null> => {
    const found = levelType(port.registry.get().locationTypes, kind)
    if (found) return found.id
    if (!await addType("locationTypes", kind === "planta" ? "Planta" : "Área")) return null
    return levelType(port.registry.get().locationTypes, kind)?.id ?? null
  }

  const save = async () => {
    const attrs: RecordAttrs = sheetFrom(existing?.attrs, fields, values, mode.level === "equip" && guard ? prot : null)
    const status = active ? (existing?.status === "em_revisao" ? "em_revisao" : "ativo") : "inativo"
    if (mode.level !== "equip") {
      const kind = mode.level
      if (existing) {
        const ok = await update<Location>("locations", existing.id, (l) => ({ ...l, name: name.trim(), code: code.trim(), status, attrs, parentId: kind === "area" ? plantId : l.parentId, typeId: kind === "area" && typeId ? typeId : l.typeId }))
        if (ok) { toast.success(`${kind === "planta" ? "Planta" : "Área"} atualizada`, { description: name.trim() }); onSaved(existing.id) }
        return
      }
      const levelId = kind === "area" && typeId ? typeId : await levelTypeId(kind)
      if (!levelId) return
      const item: Location = { id: newId(), unitId: state.units[0].id, revision: 1, updatedAt: now(), origin: "manual", status, parentId: kind === "area" ? plantId : null, typeId: levelId, code: code.trim(), name: name.trim(), aliases: [], attrs }
      if (await upsert("locations", item)) { toast.success(`${kind === "planta" ? "Planta criada" : "Área criada"}`, { description: item.name }); onSaved(item.id) }
      return
    }
    if (existing) {
      const a = existing as Asset
      const ok = await update<Asset>("assets", a.id, (x) => ({ ...x, name: name.trim(), code: code.trim(), status, typeId, attrs, locationIds: nestedIn ? x.locationIds : [areaId, ...x.locationIds.filter((l) => l !== a.locationIds[0] && l !== areaId)] }))
      if (ok) { toast.success("Equipamento atualizado", { description: code.trim() }); onSaved(a.id) }
      return
    }
    const item: Asset = { id: newId(), unitId: state.units[0].id, revision: 1, updatedAt: now(), origin: "manual", status, typeId, code: code.trim(), name: name.trim(), aliases: [], locationIds: [areaId], attrs }
    if (!await upsert("assets", item)) return
    if (nestedIn) {
      const kind = partOfKindIds(state.relationKinds)[0]
      if (!kind) toast.error("Equipamento criado, mas sem o tipo de relação “é parte de” para aninhar.")
      else if (!await upsert("relations", { id: newId(), fromId: item.id, toId: nestedIn.id, kindId: kind })) return
    }
    toast.success("Equipamento criado", { description: item.code })
    onSaved(item.id)
  }

  const set = (k: string) => (v: string) => setValues((s) => ({ ...s, [k]: v }))
  return (
    <FormDialog open wide onOpenChange={(o) => !o && onClose()} title={existing ? m.edit : nestedIn ? "Novo equipamento aninhado" : m.title}
      description={m.sub} meta={nestedIn ? `Aninhado em ${nestedIn.name} (${nestedIn.code}): herda a planta e a área do nó pai.` : m.sub}
      valid={valid} missing={missing} submitLabel={existing ? "Salvar alterações" : m.save} onSubmit={save}>
      <div className={grid}>
        {nestedIn && (
          <Field className="sm:col-span-2">
            <FieldLabel>Equipamento pai</FieldLabel>
            <p className="flex min-h-11 items-center gap-2 rounded-md border bg-muted/50 px-3 type-body md:min-h-9" aria-label={`Equipamento pai: ${nestedIn.code} · ${nestedIn.name}`}>
              <AssetIcon id={nestedIn.id} className="size-4 text-muted-foreground" />
              <span className="font-mono text-sm">{nestedIn.code}</span><span className="text-muted-foreground">·</span><span className="min-w-0 truncate">{nestedIn.name}</span>
            </p>
            <FieldDescription>O novo equipamento fica dentro dele (é parte de).</FieldDescription>
          </Field>
        )}
        {mode.level !== "planta" && (
          <SelectField label="Planta" value={plantId} onChange={(v) => { setPlantId(v); setAreaId("") }} placeholder="Selecione…" disabled={!!nestedIn}
            options={plants.map((p) => ({ value: p.id, label: p.name }))} description={nestedIn ? "Herdada do equipamento pai" : undefined} />
        )}
        {mode.level === "equip" && (
          <SelectField label="Área" value={areaId} onChange={setAreaId} placeholder={plantId ? "Selecione…" : "Escolha a planta primeiro"} disabled={!!nestedIn}
            options={areas.map((a) => ({ value: a.id, label: a.name }))} description={nestedIn ? "Herdada do equipamento pai" : undefined} />
        )}
        <TextField label={mode.level === "equip" ? "Nome" : mode.level === "planta" ? "Nome da planta" : "Nome da área"} value={name} onChange={setName}
          placeholder={mode.level === "planta" ? "Ex.: Planta Oeste" : mode.level === "area" ? "Ex.: Evaporação" : "Bomba de Polpa 205"} />
        <TextField label={mode.level === "equip" ? "Código/TAG" : "Código"} value={code} onChange={setCode} placeholder={mode.level === "planta" ? "POE" : mode.level === "area" ? "EVA" : "BP-205"}
          error={taken ? "Este código já existe." : [...code.trim()].length > 64 ? "No máximo 64 caracteres." : undefined}
          description={mode.level === "equip" ? "Único no cadastro · editável" : undefined} />
        {mode.level === "area" && areaTypes.length > 0 && (
          <SelectField label="Tipo" value={typeId} onChange={setTypeId} placeholder="Selecione…" description={modelsHint}
            options={areaTypes.filter((t) => t.active || t.id === typeId).map((t) => ({ value: t.id, label: t.label }))} />
        )}
        {mode.level === "equip" && (
          <SelectField label="Tipo" value={typeId} onChange={setTypeId} placeholder={state.assetTypes.some((t) => t.active) ? "Selecione…" : "Cadastre tipos em Configuração › Catálogos"}
            options={state.assetTypes.filter((t) => t.active || t.id === typeId).map((t) => ({ value: t.id, label: t.label }))} />
        )}
        {fields.map((f) => <SheetField key={f.key} field={f} value={values[f.key] ?? ""} onChange={set(f.key)} error={problems[f.key]} />)}
      </div>
      {mode.level === "equip" && (
        <div className="flex flex-col gap-4 rounded-lg border bg-surface-canvas p-4">
          <Toggle label="É dispositivo de proteção?" checked={guard} onChange={setGuard}
            help="Sensor, válvula de bloqueio, relé, chave de segurança etc.: habilita os dados de contexto abaixo." />
          {guard && (
            <div className={grid}>
              {PROTECTION_FIELDS.map((f) => (
                <SheetField key={f.key} field={f} value={prot[f.key as keyof Omit<Protection, "protegidos">]} error={protProblems[f.key]}
                  onChange={(v) => setProt((p) => ({ ...p, [f.key]: v }))} />
              ))}
              <Field className="sm:col-span-2">
                <FieldLabel>Equipamentos adicionais protegidos</FieldLabel>
                <PickList options={candidates} value={prot.protegidos} onChange={(ids) => setProt((p) => ({ ...p, protegidos: ids }))}
                  addLabel="Escolher equipamentos" ariaLabel="Equipamentos protegidos" empty="Além do nó pai, outros equipamentos que este dispositivo protege." />
              </Field>
            </div>
          )}
        </div>
      )}
      <Toggle label={mode.level === "equip" ? "Equipamento ativo" : mode.level === "planta" ? "Planta ativa" : "Área ativa"} checked={active} onChange={setActive}
        help={active ? undefined : "Inativo não recebe novas PTs; o histórico continua."} />
    </FormDialog>
  )
}

function SheetField({ field, value, onChange, error }: { field: AttrField; value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId()
  if (field.kind === "select") {
    const options = field.options ?? []
    return <div className={cn(field.full && "sm:col-span-2")}><SelectField label={field.label} value={value} onChange={onChange} placeholder="Selecione…" description={field.help}
      options={value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : [...options]} error={error} /></div>
  }
  if (field.kind === "textarea") {
    return (
      <Field className={cn(field.full && "sm:col-span-2")}>
        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
        <Textarea id={id} value={value} placeholder={field.placeholder} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} rows={3} aria-invalid={!!error || undefined} />
        {error && <p className="type-meta text-st-stop-fg">{error}</p>}
        {field.help && <FieldDescription>{field.help}</FieldDescription>}
      </Field>
    )
  }
  if (field.kind === "date") {
    // dd/mm/aaaa with its own mask (SGI P19: never the browser's mm/dd/aaaa); stored as AAAA-MM-DD.
    return (
      <Field className={cn(field.full && "sm:col-span-2")}>
        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
        <DateInput id={id} value={value || undefined} onChange={(v) => onChange(v ?? "")} invalid={!!error} label={field.label} />
        {error && <p className="type-meta text-st-stop-fg">{error}</p>}
        {field.help && <FieldDescription>{field.help}</FieldDescription>}
      </Field>
    )
  }
  return <div className={cn(field.full && "sm:col-span-2")}><TextField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder}
    description={field.help} error={error} maxLength={field.maxLength} /></div>
}

function Toggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {help && <p className="type-meta">{help}</p>}
      </div>
    </div>
  )
}

/** One question of the form, every kind, with its field, hint and problem. */
import { useContext, type ReactNode } from "react"
import { InfoIcon, OctagonXIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useSim } from "@/sim/SimProvider"
import { DeferredText } from "../DeferredText"
import { NumberInput } from "../NumberInput"
import { TimeInput } from "../TimeInput"
import { DateInput } from "../DateInput"
import { PickList } from "../PickList"
import { SearchSelect } from "../SearchSelect"
import { MAX_CHIPS, noticeForChoice, noticeParts } from "@/core/formLayout"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { eligibilityHint, eligiblePeople, NOBODY_ELIGIBLE, personIneligible } from "@/core/eligibility"
import { label, useRegistry } from "@/registry/store"
import { codeMatches, lineChoices, dateRuleLabel, dateRuleProblem, ENERGY_LABEL, itemProblems, optionsOf, rangeLabel, rangeProblem, validIso, type GroupRow, type IsolationRow, type ItemAnswer } from "@/core/form"
import type { EnergyKind, FormItem } from "@/registry/types"
import { TONE_SOLID, TONE_TEXT } from "@/components/shell/Status"
import type { Actor } from "./attachments"
import { AttachmentList, CaptureButton } from "./attachments"
import { RequiredMark } from "@/components/ui/required"
import { FillContext, rowId, useFormContext } from "./context"

/**
 * The visual grammar of a question (DESIGN.md · Itens de formulário): the label (`type-field`, ink)
 * sits on top; an instruction (`Hint`: range, format, minimum, hint) comes right under it, before the
 * control, small and grey; the control is a white field with a visible border; a problem (`StopLine`)
 * goes under the control. Information to read (`Notice`) is a grey well with an icon, never a field.
 */
const FIELD = "min-h-11 w-full max-w-xl bg-background md:min-h-9"
const LONG_FIELD = "min-h-20 w-full max-w-2xl bg-background"
/** A sub-field label inside a question (Documento, Pontos de isolamento): smaller than the question, still ink. */
const SUB_LABEL = "text-xs leading-4 font-medium text-foreground"

function Hint({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className="-mt-1.5 type-meta">{children}</p>
}

/** Something to read, not to answer (Aviso, the detail of a chosen option): a quiet well with an info icon. */
export function Notice({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md bg-surface-well px-3 py-2 text-muted-foreground", small ? "type-meta" : "type-body")}>
      <InfoIcon className={cn("shrink-0", small ? "mt-px size-3.5" : "mt-0.5 size-4")} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** One choice from a fixed list: up to six, a plain select (chevron only); more, the searchable one. */
function ChoiceSelect({ id, ariaLabel, placeholder, options, value, onChange }: {
  id?: string; ariaLabel: string; placeholder: string
  options: { id: string; label: string; detail?: string }[]
  value: string | undefined; onChange: (v: string | undefined) => void
}) {
  if (options.length > MAX_CHIPS) return <SearchSelect id={id} ariaLabel={ariaLabel} placeholder={placeholder} options={options} value={value} onChange={onChange} className="max-w-xl bg-background" />
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="min-h-11 w-full max-w-xl min-w-0 bg-background md:min-h-9"><SelectValue placeholder="Escolher" /></SelectTrigger>
      <SelectContent><SelectGroup>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}{o.detail ? ` · ${o.detail}` : ""}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  )
}

/** The reason an answer stops the stage, under the item that gives it (stop tone, icon + words). */
function StopLine({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className={cn("flex items-start gap-2 type-body font-medium", TONE_TEXT.stop)} role="status"><OctagonXIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{children}</p>
}

export function FillItem({ item, answer, onChange, actor, scope = "", notices = [], hideLabel = false, sub = false }: {
  item: FormItem; answer: ItemAnswer | undefined; onChange: (a: ItemAnswer | null) => void; actor: Actor; scope?: string
  /** A column inside a repeated row: its label is a sub-label (12/500), below the question's. */
  sub?: boolean
  /** The section's items: a choice named like one of its notices shows that notice beside the answer. */
  notices?: FormItem[]
  /** The section's title already says it: the label is kept for screen readers only. */
  hideLabel?: boolean
}) {
  const { state } = useRegistry()
  const simNow = useSim().now
  const now = simNow.slice(11, 19)
  const ctx = useFormContext()
  const { assetIds = [] } = useContext(FillContext)
  // Inside a group row the same item appears once per row: the row id keeps field ids unique.
  const fieldId = (_: FormItem, suffix = "") => `fi-${scope}${item.id}${suffix}`
  if (item.kind === "aviso") {
    // A notice is read, not answered: a grey well with an icon, never a field look.
    return <Notice>{item.text}</Notice>
  }
  // Question label: one weight everywhere; a red asterisk marks what is required (SPEC 018), nothing marks the optional.
  const head = (
    <span className={cn("flex flex-wrap items-baseline gap-x-2", hideLabel && "sr-only")}>
      <span className={sub ? SUB_LABEL : "type-field text-foreground"}>{item.label}{item.required && <RequiredMark className="ml-0.5" />}</span>
    </span>
  )
  // An answer that stops the stage, said once, under this item (kinds that do not already say it themselves).
  const stops = item.kind === "marcacao" ? itemProblems(item, answer, ctx).blocked : []

  if (item.kind === "texto") {
    const v = answer?.t === "texto" ? answer.v : ""
    const set = (value: string) => onChange(value === "" ? null : { t: "texto", v: value })
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={fieldId(item)} className="contents">{head}</Label>
        <DeferredText id={fieldId(item)} value={v} onCommit={set} long={item.long} className={item.long ? LONG_FIELD : FIELD} />
      </div>
    )
  }

  if (item.kind === "marcacao") {
    const ids = answer?.t === "marcacao" ? answer.ids : []
    const other = answer?.t === "marcacao" ? answer.other ?? "" : ""
    const set = (next: string[], o = other) => onChange(!next.length && !o ? null : { t: "marcacao", ids: next, ...(o ? { other: o } : {}) })
    const options = optionsOf(item, state.optionLists)
    // Up to six options: buttons, all in sight. More: a searchable picker, never a wall of buttons.
    const long = options.length > MAX_CHIPS
    const chip = "min-h-11 bg-background data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9"
    // The chosen option named like one of the section's notices ("Classe 4") shows that notice here.
    const picked = !item.multiple && ids[0] ? options.find((o) => o.id === ids[0]) : undefined
    const note = picked ? noticeForChoice(notices, picked.label) : undefined
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {long && item.multiple ? (
          <PickList ariaLabel={item.label} addLabel="Escolher" empty="Nada escolhido" value={ids} onChange={(v) => set(v)} options={options} />
        ) : long ? (
          <SearchSelect id={fieldId(item)} ariaLabel={item.label} placeholder="Buscar na lista…" className="max-w-xl bg-background" options={options} value={ids[0]} onChange={(v) => set(v ? [v] : [])} />
        ) : item.multiple ? (
          <ToggleGroup type="multiple" variant="outline" spacing={2} value={ids} onValueChange={(v) => set(v)} className="flex flex-wrap justify-start" aria-label={item.label}>
            {options.map((o) => <ToggleGroupItem key={o.id} value={o.id} className={chip}>{o.label}</ToggleGroupItem>)}
          </ToggleGroup>
        ) : (
          <ToggleGroup type="single" variant="outline" spacing={2} value={ids[0] ?? ""} onValueChange={(v) => set(v ? [v] : [])} className="flex flex-wrap justify-start" aria-label={item.label}>
            {options.map((o) => <ToggleGroupItem key={o.id} value={o.id} className={chip}>{o.label}</ToggleGroupItem>)}
          </ToggleGroup>
        )}
        {item.other && <DeferredText aria-label={`${item.label}: outro`} placeholder="Outro: especificar" value={other} onCommit={(o) => set(ids, o)} className={FIELD} />}
        {note && <Notice small><span className="font-medium text-foreground">{note.label}</span> · {noticeParts(note).join(" · ")}</Notice>}
        {stops.map((b) => <StopLine key={b}>{b.replace(`${item.label}: `, "")}: não prossiga.</StopLine>)}
      </fieldset>
    )
  }

  if (item.kind === "numero") {
    const v = answer?.t === "numero" ? answer.v : undefined
    const range = rangeLabel(item)
    const out = v !== undefined ? rangeProblem(item, v) : null
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={fieldId(item)} className="contents">{head}</Label>
        {range && <Hint id={`${fieldId(item)}-range`}>Permitido: {range.replace(/^faixa /, "")}</Hint>}
        <NumberInput id={fieldId(item)} value={v} decimals={item.decimals} unit={item.unit} negative={item.negative} invalid={!!out}
          describedBy={[range ? `${fieldId(item)}-range` : "", out ? `${fieldId(item)}-out` : ""].filter(Boolean).join(" ") || undefined}
          className="max-w-60" onChange={(n) => onChange(n === undefined ? null : { t: "numero", v: n })} />
        {out && <StopLine id={`${fieldId(item)}-out`}>Valor {out}: não prossiga.</StopLine>}
      </div>
    )
  }

  if (item.kind === "horario") {
    const v = answer?.t === "horario" ? answer.v : undefined
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={fieldId(item)} className="contents">{head}</Label>
        <TimeInput key={String(item.seconds)} id={fieldId(item)} value={v} seconds={item.seconds} now={now}
          onChange={(t) => onChange(t === undefined ? null : { t: "horario", v: t })} />
      </div>
    )
  }

  if (item.kind === "anexo") {
    const files = answer?.t === "anexo" ? answer.files : []
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {(item.hint || item.min > 1) && <Hint>{[item.hint, item.min > 1 ? `${files.length} de ${item.min} no mínimo` : ""].filter(Boolean).join(" · ")}</Hint>}
        <AttachmentList ids={files} onRemove={(fid) => { const next = files.filter((f) => f !== fid); onChange(next.length ? { t: "anexo", files: next } : null) }} />
        <div className="flex flex-wrap gap-2">
          {item.accept.map((k) => (
            <CaptureButton key={k} kind={k} itemId={item.id} accept={item.accept} label={item.label} onAdd={(ids) => onChange({ t: "anexo", files: [...files, ...ids] })} />
          ))}
        </div>
      </fieldset>
    )
  }

  if (item.kind === "data") {
    const v = answer?.t === "data" ? answer.v : undefined
    const iso = validIso(v)
    const rule = dateRuleLabel(item)
    const out = iso ? dateRuleProblem(item, iso, ctx.today) : null
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={fieldId(item)} className="contents">{head}</Label>
        {rule && <Hint>Permitido: {rule}</Hint>}
        <DateInput id={fieldId(item)} value={v} today={ctx.today} invalid={!!out} onChange={(d) => onChange(d === undefined ? null : { t: "data", v: d })} />
        {out && <StopLine>Data {out}: não prossiga.</StopLine>}
      </div>
    )
  }

  if (item.kind === "documento") {
    const a = answer?.t === "documento" ? answer : { t: "documento" as const, code: "", files: [] as string[] }
    const set = (patch: Partial<Extract<ItemAnswer, { t: "documento" }>>) => {
      const { validUntil, ...next } = { ...a, ...patch }
      onChange(!next.code && !next.files.length && !validUntil ? null : { ...next, ...(validUntil ? { validUntil } : {}) })
    }
    const bad = !!a.code.trim() && !codeMatches(a.code, item.pattern)
    const vIso = validIso(a.validUntil)
    const expired = !!vIso && !!ctx.today && vIso < ctx.today
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fieldId(item, "-code")} className={SUB_LABEL}>Número ou código</Label>
          {item.pattern && <Hint>Formato {item.pattern} (# = algarismo, A = letra)</Hint>}
          <DeferredText id={fieldId(item, "-code")} value={a.code} aria-invalid={bad} placeholder={item.pattern?.replace(/#/g, "0")} onCommit={(code) => set({ code })} className="min-h-11 bg-background sm:max-w-xs md:min-h-9" />
          {bad && <p className={cn("type-meta", TONE_TEXT.stop)} role="status">Não segue o formato {item.pattern}.</p>}
        </div>
        {item.validity && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={fieldId(item, "-val")} className={SUB_LABEL}>Válido até</Label>
            <DateInput id={fieldId(item, "-val")} value={a.validUntil} invalid={expired} onChange={(d) => set({ validUntil: d })} />
            {expired && <StopLine>Documento vencido: não prossiga.</StopLine>}
          </div>
        )}
        {item.attach && (
          <>
            <AttachmentList ids={a.files} onRemove={(fid) => set({ files: a.files.filter((f) => f !== fid) })} />
            <div className="flex flex-wrap gap-2">
              <CaptureButton kind="arquivo" itemId={item.id} label={item.label} onAdd={(ids) => set({ files: [...a.files, ...ids] })} />
              <CaptureButton kind="foto" itemId={item.id} label={item.label} onAdd={(ids) => set({ files: [...a.files, ...ids] })} />
            </div>
          </>
        )}
      </fieldset>
    )
  }

  if (item.kind === "pessoa") {
    const ids = answer?.t === "pessoa" ? answer.ids : []
    // SPEC 015: only who the rule accepts (cargo valid today and covering the place, record and account in order);
    // a person already chosen who no longer qualifies stays on the list, in red, until replaced.
    const nowIso = ctx.now ?? simNow, todayIso = ctx.today ?? ""
    const offered = eligiblePeople(state.people, item.roleId ?? null, ctx.pathIds ?? null, todayIso, nowIso)
    const pool = [...offered, ...ids.filter((id) => !offered.some((p) => p.id === id)).map((id) => state.people.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)]
    const why = (id: string) => {
      const p = state.people.find((x) => x.id === id)
      const r = !p ? "pessoa inexistente"
        : item.roleId && !p.roles.some((x) => x.roleId === item.roleId) ? "não tem o cargo"
        : personIneligible(p, item.roleId ?? null, ctx.pathIds ?? null, todayIso, nowIso)
      return r ? `não elegível: ${r}` : ""
    }
    const roleName = item.roleId ? label(state.roleTypes, item.roleId) : null
    const set = (next: string[]) => onChange(next.length ? { t: "pessoa", ids: next } : null)
    const blocked = ids.map((id) => ({ id, w: why(id) })).filter((x) => x.w)
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {item.multiple ? (
          <PickList ariaLabel={item.label} addLabel="Pessoa" empty="Ninguém escolhido" value={ids} onChange={set}
            options={pool.map((p) => ({ id: p.id, label: p.name, detail: p.company, note: why(p.id) || undefined, noteTone: "stop" as const }))} />
        ) : pool.length > MAX_CHIPS ? (
          <SearchSelect id={fieldId(item)} ariaLabel={item.label} placeholder="Buscar no cadastro…" value={ids[0]} onChange={(v) => set(v ? [v] : [])} className="max-w-xl bg-background"
            options={pool.map((p) => ({ id: p.id, label: p.name, detail: [p.company, why(p.id)].filter(Boolean).join(" · ") }))} />
        ) : (
          <Select value={ids[0] ?? ""} onValueChange={(v) => set(v ? [v] : [])}>
            <SelectTrigger className="min-h-11 w-full max-w-xl min-w-0 bg-background md:min-h-9" aria-label={item.label}><SelectValue placeholder="Escolher no cadastro" /></SelectTrigger>
            <SelectContent><SelectGroup>{pool.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.company}{why(p.id) ? ` · ${why(p.id)}` : ""}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )}
        <p className="type-meta">{pool.length === 0 ? NOBODY_ELIGIBLE : eligibilityHint(roleName, null)}</p>
        {blocked.map((x) => <StopLine key={x.id}>{state.people.find((p) => p.id === x.id)?.name}: {x.w}. Troque esta pessoa.</StopLine>)}
      </fieldset>
    )
  }

  if (item.kind === "isolamento") {
    const rows = answer?.t === "isolamento" ? answer.rows : []
    const set = (next: IsolationRow[]) => onChange(next.length ? { t: "isolamento", rows: next } : null)
    const patch = (id: string, p: Partial<IsolationRow>) => set(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
    const assets = state.assets.filter((x) => assetIds.includes(x.id))
    const people = state.people.filter((p) => p.status !== "inativo")
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {item.minRows > 1 && <Hint>Mínimo {item.minRows} pontos</Hint>}
        {rows.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 type-meta">Nenhum ponto registrado.</p>}
        <ol className="flex flex-col gap-2">
          {rows.map((r, k) => {
            const f = (x: string) => fieldId(item, `-${r.id}-${x}`)
            const stop = r.zero === "nao"
            return (
              <li key={r.id} className="relative flex flex-col gap-3 overflow-hidden rounded-md bg-surface-well p-3">
                {stop && <span className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_SOLID.stop)} aria-hidden />}
                <div className="flex items-center gap-2">
                  <span className="type-label">Ponto {k + 1}</span>
                  <Button variant="ghost" size="icon" className="ml-auto size-11 md:size-9" aria-label={`Remover ponto ${k + 1}`} onClick={() => set(rows.filter((x) => x.id !== r.id))}><Trash2Icon /></Button>
                </div>
                <div className="grid gap-3 @lg:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={f("pt")} className={SUB_LABEL}>Ponto ou tag</Label>
                    {assets.length > 0 && (
                      <ChoiceSelect ariaLabel={`Ativo do ponto ${k + 1}`} placeholder="Buscar ativo…" value={r.assetId ?? "_livre"}
                        options={[{ id: "_livre", label: "Outro ponto (digitar)" }, ...assets.map((a) => ({ id: a.id, label: `${a.code} · ${a.name}` }))]}
                        onChange={(v) => { const a = assets.find((x) => x.id === v); const { assetId: _x, ...rest } = r; void _x; set(rows.map((x) => (x.id === r.id ? { ...rest, ...(a ? { assetId: a.id, point: a.code } : {}) } : x))) }} />
                    )}
                    {!r.assetId && <DeferredText id={f("pt")} value={r.point} placeholder="Ex.: disjuntor Q3, válvula V-12" onCommit={(point) => patch(r.id, { point })} className="min-h-11 bg-background md:min-h-9" />}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={f("en")} className={SUB_LABEL}>Tipo de energia</Label>
                    <ChoiceSelect id={f("en")} ariaLabel={`Tipo de energia do ponto ${k + 1}`} placeholder="Buscar energia…" value={r.energy}
                      options={(Object.keys(ENERGY_LABEL) as EnergyKind[]).map((e) => ({ id: e, label: ENERGY_LABEL[e] }))}
                      onChange={(v) => { const { energy: _e, ...rest } = r; void _e; set(rows.map((x) => (x.id === r.id ? { ...rest, ...(v ? { energy: v as EnergyKind } : {}) } : x))) }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={f("me")} className={SUB_LABEL}>Método de bloqueio</Label>
                    <DeferredText id={f("me")} value={r.method} placeholder="Ex.: disjuntor aberto e travado" onCommit={(method) => patch(r.id, { method })} className="min-h-11 bg-background md:min-h-9" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={f("lk")} className={SUB_LABEL}>Nº do cadeado ou etiqueta</Label>
                    <DeferredText id={f("lk")} value={r.lock} onCommit={(lock) => patch(r.id, { lock })} className="min-h-11 bg-background md:min-h-9" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={SUB_LABEL} id={f("zl")}>Energia zero verificada</span>
                    <ToggleGroup type="single" variant="outline" spacing={0} value={r.zero ?? ""} aria-labelledby={f("zl")} className="w-full sm:w-fit" onValueChange={(v) => patch(r.id, { zero: (v || undefined) as IsolationRow["zero"] })}>
                      <ToggleGroupItem value="sim" className="min-h-11 flex-1 bg-background px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9">Sim</ToggleGroupItem>
                      <ToggleGroupItem value="nao" className="min-h-11 flex-1 bg-background px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold md:min-h-9">Não</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={f("by")} className={SUB_LABEL}>Aplicado por</Label>
                    <ChoiceSelect id={f("by")} ariaLabel={`Aplicado por, ponto ${k + 1}`} placeholder="Buscar pessoa…" value={r.by}
                      options={people.map((p) => ({ id: p.id, label: p.name, detail: p.company }))}
                      onChange={(v) => { const { by: _b, ...rest } = r; void _b; set(rows.map((x) => (x.id === r.id ? { ...rest, ...(v ? { by: v } : {}) } : x))) }} />
                  </div>
                </div>
                {stop && <StopLine>Energia zero não verificada: não prossiga.</StopLine>}
              </li>
            )
          })}
        </ol>
        <Button variant="outline" className="min-h-11 w-fit md:min-h-9" onClick={() => set([...rows, { id: rowId("iso"), point: "", method: "", lock: "", ...(actor.id ? { by: actor.id } : {}) }])}><PlusIcon data-icon="inline-start" />Ponto de isolamento</Button>
      </fieldset>
    )
  }

  if (item.kind === "grupo") {
    const rows = answer?.t === "grupo" ? answer.rows : []
    const set = (next: GroupRow[]) => onChange(next.length ? { t: "grupo", rows: next } : null)
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {item.minRows > 1 && <Hint>Mínimo {item.minRows} linhas</Hint>}
        {rows.length === 0 && <p className="rounded-md border border-dashed px-3 py-2 type-meta">Nenhuma linha.</p>}
        <ol className="flex flex-col gap-2">
          {rows.map((r, k) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-md bg-surface-well p-3">
              <div className="flex items-center gap-2">
                <span className="type-label">Linha {k + 1}</span>
                <Button variant="ghost" size="icon" className="ml-auto size-11 md:size-9" aria-label={`Remover linha ${k + 1} de ${item.label}`} onClick={() => set(rows.filter((x) => x.id !== r.id))}><Trash2Icon /></Button>
              </div>
              <div className="grid gap-3 @lg:grid-cols-2">
                {item.columns.map((c) => (
                  <FillItem key={c.id} item={c} sub scope={`${r.id}-`} answer={r.answers[c.id]} actor={actor}
                    onChange={(a) => set(rows.map((x) => (x.id === r.id ? { ...x, answers: Object.fromEntries(Object.entries({ ...x.answers, [c.id]: a }).filter(([, v]) => v)) as GroupRow["answers"] } : x)))} />
                ))}
              </div>
            </li>
          ))}
        </ol>
        <Button variant="outline" className="min-h-11 w-fit md:min-h-9" onClick={() => set([...rows, { id: rowId("row"), answers: {} }])}><PlusIcon data-icon="inline-start" />Linha</Button>
      </fieldset>
    )
  }

  // verificacao
  const lines = answer?.t === "verificacao" ? answer.lines : {}
  const choices = lineChoices(item, state.optionLists)
  const setLine = (lineId: string, patch: { a?: string; note?: string }) => {
    const prev = lines[lineId]
    const a = patch.a ?? prev?.a
    if (!a) return
    const note = patch.note ?? (patch.a ? undefined : prev?.note)
    onChange({ t: "verificacao", lines: { ...lines, [lineId]: { a, ...(note ? { note } : {}) } } })
  }
  // Tapping the chosen answer again takes it back (the line is unanswered again).
  const clearLine = (lineId: string) => {
    const rest = Object.fromEntries(Object.entries(lines).filter(([k]) => k !== lineId))
    onChange(Object.keys(rest).length ? { t: "verificacao", lines: rest } : null)
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2">{head}</legend>
      {/* One list with dividers (not a box per line); the answer column lines up on the right. */}
      <ul className="flex flex-col divide-y rounded-lg border">
        {item.lines.map((line) => {
          const ans = lines[line.id]
          const blocks = !!ans && line.blockOn.includes(ans.a)
          const needsNote = !!ans && line.noteOn.includes(ans.a)
          return (
            <li key={line.id} className="relative flex flex-col gap-2 px-3 py-2.5 first:rounded-t-lg last:rounded-b-lg">
              {blocks && <span className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_SOLID.stop)} aria-hidden />}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className={cn("flex flex-1 items-start gap-2 type-body", blocks && cn("font-medium", TONE_TEXT.stop))}>
                  {blocks && <OctagonXIcon role="img" aria-label="Impede a etapa" className="mt-0.5 size-4 shrink-0" />}{line.label}
                </span>
                <ToggleGroup type="single" variant="outline" spacing={0} value={ans?.a ?? ""} onValueChange={(v) => (v ? setLine(line.id, { a: v }) : clearLine(line.id))} aria-label={line.label} className="w-full sm:w-auto">
                  {choices.map((c) => <ToggleGroupItem key={c.id} value={c.id} className="min-h-11 flex-1 bg-background px-4 data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary-hover data-[state=on]:font-semibold sm:flex-none md:min-h-9">{c.label}</ToggleGroupItem>)}
                </ToggleGroup>
              </div>
              {needsNote && <DeferredText aria-label={`Justificativa: ${line.label}`} placeholder="Justificativa" value={ans?.note ?? ""} onCommit={(note) => setLine(line.id, { note })} className={FIELD} />}
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

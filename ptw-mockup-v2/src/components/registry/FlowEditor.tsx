import { Fragment, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, EqualNotIcon, LockIcon, PenLineIcon, PlusIcon, SplitIcon, UsersIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { uuidv7 } from "@/lib/id"
import { normalizeSeparation, separationKey } from "@/core/templateVersions"
import type { Condition, TemplateContent, Person, RegistryState, SignSlot, Stage } from "@/registry/types"
import { checkRoleAt, checkSlotAt, rolesText, slotKind, type RoleCheck, type RoleReq, type SlotRef } from "@/core/eligibility"
import { checksForSlot as coreChecksForSlot, checksForTemplate as coreChecksForTemplate, signatureProblems as coreSignatureProblems } from "@/core/templateChecks"
import { ConditionEditor, conditionText, InlineName, insertAt as putBack, removedToast, StageSections, type SetTpl } from "./FormEditor"
import { ConfirmRemove, Stepper, ToggleField, TOGGLE_ON } from "./common"
import { PickList } from "./PickList"
import { SourceDisclosure } from "./origem"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * Fixed by the product, always the tail of every template: Emissão, Aceite no campo, Entrega,
 * Aceite da área. The supervisor adds free stages before Emissão.
 */
export function defaultStages(): Stage[] {
  const slot = (meaning: string): SignSlot => ({ id: uuidv7(), meaning, kind: "cargo", roleIds: [], personId: null, min: 1, required: true })
  return [
    { id: uuidv7(), name: "Solicitação", kind: "solicitacao", slots: [slot("Solicita a PT")] },
    { id: uuidv7(), name: "Emissão", kind: "emissao", locked: true, slots: [slot("Emite a PT")] },
    { id: uuidv7(), name: "Aceite no campo", kind: "aceite_campo", locked: true, slots: [slot("Aceita no campo")] },
    { id: uuidv7(), name: "Entrega", kind: "entrega", locked: true, slots: [slot("Entrega a área")] },
    { id: uuidv7(), name: "Aceite da área", kind: "aceite_area", locked: true, slots: [slot("Encerra a PT")] },
  ]
}

export type { RoleCheck } from "@/core/eligibility"
export { slotKind }

/** Thin wrappers: the rules live in src/core/eligibility.ts and receive today's date explicitly. */
export const checkSlot = (people: Person[], tpl: TemplateContent, sl: SlotRef, pathIds: string[] | null, today: string): RoleCheck[] =>
  checkSlotAt(people, tpl, sl, pathIds, today)
export const checkRole = (people: Person[], roleId: RoleReq, pathIds: string[] | null, today: string, signer = true): RoleCheck[] =>
  checkRoleAt(people, roleId, pathIds, signer, today)

/** The rules live in src/core/templateChecks.ts (pure, shared with the package import). */
export const checksForTemplate = (state: RegistryState, tpl: TemplateContent, roleId: RoleReq, today: string): RoleCheck[] => coreChecksForTemplate(state, tpl, roleId, today)
export const checksForSlot = (state: RegistryState, tpl: TemplateContent, sl: SlotRef, today: string): RoleCheck[] => coreChecksForSlot(state, tpl, sl, today)
export const signatureProblems = (t: TemplateContent, state: RegistryState, today: string): string[] => coreSignatureProblems(t, state, today)

/* ====================================================================== */
/*  Fluxo: per stage, what is filled in and who signs it                   */
/* ====================================================================== */

export function FlowEditor({ tpl, set }: { tpl: TemplateContent; set: SetTpl }) {
  const { state } = useRegistry()
  const { today } = useSim()

  const roleLabel = (id: string) => label(state.roleTypes, id)
  const roleOptions = state.roleTypes.map((r) => ({ id: r.id, label: r.label }))
  const checksFor = (sl: SlotRef) => checksForSlot(state, tpl, sl, today)
  const people = state.people.filter((p) => p.status !== "inativo")

  const allSlots = tpl.stages.flatMap((s) => s.slots)
  const formItems = (tpl.form?.sections ?? []).flatMap((s) => s.items)
  const slotLabels = new Map<string, string>()
  tpl.stages.forEach((st, i) => st.slots.forEach((sl) => slotLabels.set(sl.id, `${i + 1}. ${sl.meaning || "sem descrição"}`)))
  const protectedSlots = new Set(tpl.separation.filter((r) => r.locked).flatMap((r) => [r.slotA, r.slotB]))
  /** "Pessoa" chosen but nobody picked yet: kept on screen only (the database needs the person with the kind). */
  const [pendingPerson, setPendingPerson] = useState<Set<string>>(new Set())
  /**
   * "Obrigatória só quando" while no answer is chosen yet: kept on screen only, since the database
   * stores the condition with at least one value (required_when_values).
   */
  const [pendingCond, setPendingCond] = useState<Record<string, Condition>>({})
  const setCondition = (stId: string, sl: SignSlot, c: Condition | undefined) => {
    setPendingCond((cur) => { const n = { ...cur }; if (c && !c.anyOf.length) n[sl.id] = c; else delete n[sl.id]; return n })
    const stored = c && c.anyOf.length ? c : undefined
    if (stored || sl.requiredWhen) setSlot(stId, sl.id, { requiredWhen: stored })
  }
  const togglePending = (id: string, on: boolean) => setPendingPerson((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n })
  const firstLocked = tpl.stages.findIndex((s) => s.locked)
  const insertLimit = firstLocked === -1 ? tpl.stages.length : firstLocked

  const newSlot = (): SignSlot => ({ id: uuidv7(), meaning: null, kind: "cargo", roleIds: [], personId: null, min: 1, required: true })
  const setStage = (id: string, patch: Partial<Stage>) => set({ stages: tpl.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const setSlot = (stId: string, slId: string, patch: Partial<SignSlot>) =>
    set({ stages: tpl.stages.map((s) => (s.id === stId ? { ...s, slots: s.slots.map((x) => (x.id === slId ? { ...x, ...patch } : x)) } : s)) })
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= tpl.stages.length || tpl.stages[j].locked) return
    const next = [...tpl.stages]
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ stages: next })
  }
  /** A signature is a loose item: removed at once, with "Desfazer" that puts it (and its rules) back in place. */
  const removeSlot = (stId: string, slId: string) => {
    const at = tpl.stages.find((s) => s.id === stId)?.slots.findIndex((x) => x.id === slId) ?? -1
    const slot = tpl.stages.find((s) => s.id === stId)?.slots[at]
    if (!slot) return
    const rules = tpl.separation.map((r, k) => ({ r, k })).filter(({ r }) => r.slotA === slId || r.slotB === slId)
    set({
      stages: tpl.stages.map((s) => (s.id === stId ? { ...s, slots: s.slots.filter((x) => x.id !== slId) } : s)),
      separation: tpl.separation.filter((p) => p.slotA !== slId && p.slotB !== slId),
    })
    removedToast("Assinatura removida", slot.meaning?.trim() ?? "", () => set((cur) => ({
      stages: cur.stages.map((s) => (s.id === stId ? { ...s, slots: putBack(s.slots, at, slot) } : s)),
      separation: rules.reduce((list, { r, k }) => putBack(list, k, r), cur.separation),
    })))
  }
  const removeRule = (key: string, other: string) => {
    const k = tpl.separation.findIndex((x) => separationKey(x) === key)
    const rule = tpl.separation[k]
    set({ separation: tpl.separation.filter((x) => separationKey(x) !== key) })
    removedToast("Regra removida", `Pessoa diferente de ${other}`, () => set((cur) => ({ separation: putBack(cur.separation, k, rule) })))
  }
  /** A removed stage takes its form sections and its separation rules with it. */
  const removeStage = (st: Stage) =>
    set({
      stages: tpl.stages.filter((s) => s.id !== st.id),
      separation: tpl.separation.filter((p) => !st.slots.some((x) => x.id === p.slotA || x.id === p.slotB)),
      form: { ...tpl.form, sections: (tpl.form?.sections ?? []).filter((s) => s.stageId !== st.id) },
    })
  /** One stage open at a time: the rail above picks it. */
  const [openId, setOpenId] = useState<string | undefined>(tpl.stages[0]?.id)
  const open = tpl.stages.find((s) => s.id === openId) ?? tpl.stages[0]
  const insertAt = (k: number) => {
    const next = [...tpl.stages]
    const id = uuidv7()
    next.splice(k, 0, { id, name: "Nova etapa", slots: [newSlot()] })
    set({ stages: next })
    setOpenId(id)
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
    <nav aria-label="Etapas do modelo" className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch xl:min-w-0">
        {tpl.stages.map((st, i) => {
          const on = st.id === open?.id
          const items = (tpl.form?.sections ?? []).filter((x) => x.stageId === st.id).reduce((n, x) => n + x.items.length, 0)
          return (
            <Fragment key={st.id}>
              {i > 0 && (i <= insertLimit
                ? <li className="flex items-center"><Button variant="ghost" size="icon" className="size-11 text-muted-foreground md:size-8" aria-label={`Nova etapa antes de ${st.name}`} onClick={() => insertAt(i)}><PlusIcon /></Button></li>
                : <li aria-hidden className="flex items-center px-1"><span className="h-px w-5 bg-border-strong" /></li>)}
              <li className="min-w-0 xl:flex-1">
                <button type="button" aria-current={on ? "step" : undefined} onClick={() => setOpenId(st.id)}
                  className={cn("flex min-h-14 w-full min-w-28 flex-col items-start gap-0.5 border px-3 py-2 text-left xl:min-w-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-background hover:border-primary")}>
                  <span className={cn("text-[0.6875rem] leading-4 font-semibold tracking-[0.07em] uppercase tabular-nums", !on && "text-muted-foreground")}>Etapa {i + 1}</span>
                  <span className="type-section max-w-full truncate whitespace-nowrap">{st.name}</span>
                  <span className={cn("type-data", !on && "text-muted-foreground")}>{items} {items === 1 ? "item" : "itens"} · {st.slots.length} ass.</span>
                </button>
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
    <ol className="flex flex-col">
      {tpl.stages.map((st, i) => {
        if (st.id !== open?.id) return null
        const parallel = st.slots.length > 1
        const lockedHere = st.slots.some((s) => protectedSlots.has(s.id))
        return (
          <Fragment key={st.id}>
            <li className="relative">
              <section aria-label={`Etapa ${i + 1}: ${st.name}`} className={cn("@container flex flex-col gap-4 rounded-lg p-3 md:p-4", "border bg-card")}>
                <header className="flex min-h-11 flex-wrap items-center gap-2">
                  {st.locked ? (
                    <>
                      <h3 className="type-title min-w-0 flex-1 truncate">{st.name}</h3>
                      <Tooltip>
                        <TooltipTrigger asChild><span tabIndex={0} className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span></TooltipTrigger>
                        <TooltipContent>Etapa do esqueleto. Não pode ser removida nem movida.</TooltipContent>
                      </Tooltip>
                    </>
                  ) : (
                    <>
                      <InlineName value={st.name} notEmpty maxLength={80} onCommit={(name) => setStage(st.id, { name })} aria-label={`Nome da etapa ${i + 1}`} inputClassName="text-lg leading-6 font-semibold tracking-[-0.01em] md:text-lg" />
                      {/* Solicitação starts every permit: it keeps its place, only its name can change. */}
                      {st.kind && (
                        <Tooltip>
                          <TooltipTrigger asChild><span tabIndex={0} className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span></TooltipTrigger>
                          <TooltipContent>Primeira etapa do esqueleto. Não pode ser removida nem movida; o nome pode mudar.</TooltipContent>
                        </Tooltip>
                      )}
                      {!st.kind && (
                        <div className="flex shrink-0 items-center">
                          <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Mover ${st.name} para cima`} disabled={i === 0 || !!tpl.stages[i - 1]?.kind} onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
                          <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Mover ${st.name} para baixo`} disabled={i === tpl.stages.length - 1 || !!tpl.stages[i + 1]?.locked} onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
                          <ConfirmRemove what={st.name || "etapa"} disabled={lockedHere} detail={(tpl.form?.sections ?? []).some((s) => s.stageId === st.id) ? "Leva junto as seções do formulário e as regras de pessoa diferente desta etapa." : "Leva junto as regras de pessoa diferente desta etapa."} onConfirm={() => removeStage(st)} />
                        </div>
                      )}
                    </>
                  )}
                </header>
                <SourceDisclosure id={st.id} className="-mt-3" />

                {/* 1 · what is filled in at this stage (its "+ Seção" sits on the group's heading row, DESIGN.md) */}
                <div className="flex flex-col gap-3 border-t pt-3">
                  <StageSections tpl={tpl} set={set} stageId={st.id} stageName={st.name} />
                </div>

                {/* 2 · who signs it: its own labeled area, rows with dividers, never cards in the card (DESIGN.md) */}
                <div className="flex flex-col gap-2 border-t pt-3">
                  <div className="flex min-h-11 flex-wrap items-center gap-x-2 md:min-h-9">
                    <h4 className="flex items-center gap-1.5 type-subtitle"><PenLineIcon className="size-4 text-muted-foreground" aria-hidden />Assinar</h4>
                    {st.slots.length > 0 && <span className="type-meta tabular-nums">{st.slots.length} {st.slots.length === 1 ? "assinatura" : "assinaturas"}</span>}
                    {parallel && <span className="flex items-center gap-1 type-meta"><SplitIcon className="size-3.5" aria-hidden />em paralelo</span>}
                    <Button variant="ghost" className="ml-auto min-h-11 md:min-h-9" onClick={() => setStage(st.id, { slots: [...st.slots, newSlot()] })}><PlusIcon data-icon="inline-start" />Assinatura</Button>
                  </div>
                  <div className="flex min-w-0 flex-col gap-5">
                    {st.slots.length === 0 && <p className={cn("type-body", TONE_TEXT.stop)}>Adicione ao menos uma assinatura.</p>}
                    {st.slots.map((sl) => {
                      const kind = pendingPerson.has(sl.id) ? "pessoa" : slotKind(sl)
                      const named = state.people.find((p) => p.id === sl.personId)
                      const chosen = kind === "pessoa" ? !!named : sl.roleIds.length > 0
                      const checks = chosen ? checksFor(sl) : []
                      const elig = checks.filter((c) => c.ok)
                      const short = chosen && elig.length < sl.min
                      const noRemove = (st.locked && st.slots.length === 1) || protectedSlots.has(sl.id)
                      const rules = tpl.separation.filter((r) => r.slotA === sl.id || r.slotB === sl.id)
                      const paired = new Set(rules.map((r) => (r.slotA === sl.id ? r.slotB : r.slotA)))
                      const free = allSlots.filter((o) => o.id !== sl.id && !paired.has(o.id))
                      /* "Assina: A, B ou C · 2 assinaturas · obrigatória só quando …": the slot read in one line. */
                      const who = kind === "pessoa" ? (named?.name ?? "pessoa a escolher") : sl.roleIds.length ? rolesText(sl.roleIds, roleLabel) : "cargo a escolher"
                      const cond = sl.requiredWhen ?? pendingCond[sl.id]
                      const need = !sl.required ? "opcional" : cond ? `obrigatória só quando ${conditionText(cond, formItems, state.optionLists)}` : "obrigatória"
                      const summary = [`Assina: ${who}`, kind === "cargo" && sl.min > 1 ? `${sl.min} assinaturas` : "", need].filter(Boolean).join(" · ")
                      return (
                        <div key={sl.id} className="flex min-w-0 flex-col gap-3 border-l-2 border-border-strong pl-2 sm:pl-3">
                          <div className="flex items-center gap-1">
                            <InlineName value={sl.meaning ?? ""} maxLength={120} onCommit={(m) => setSlot(st.id, sl.id, { meaning: m.trim() ? m : null })} placeholder="O que a pessoa assina" aria-label="O que a pessoa assina" aria-invalid={!sl.meaning?.trim()} inputClassName="font-medium" />
                            {noRemove ? (
                              <Tooltip>
                                <TooltipTrigger asChild><span tabIndex={0} role="img" className="inline-flex size-11 items-center justify-center text-muted-foreground md:size-9" aria-label="Assinatura protegida, não pode ser removida"><LockIcon className="size-4" /></span></TooltipTrigger>
                                <TooltipContent>Protegida pelo esqueleto.</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button variant="ghost" size="icon" className="size-11 md:size-9" aria-label={`Remover assinatura ${sl.meaning ?? ""}`} onClick={() => removeSlot(st.id, sl.id)}><XIcon /></Button>
                            )}
                          </div>
                          {/* The editor below already shows who signs, how many and when: the one-line summary is for a named person only. */}
                          {kind !== "cargo" && <p className="-mt-2 break-words type-meta">{summary}</p>}
                          <SourceDisclosure id={sl.id} className="-mt-2" />

                          <div className="flex flex-col gap-2 @md:flex-row @md:items-start">
                            <ToggleGroup type="single" variant="outline" spacing={0} value={kind} className="w-full @md:w-fit" aria-label={`Quem assina: ${sl.meaning ?? ""}`}
                              onValueChange={(v) => {
                                if (v === "pessoa" && sl.kind !== "pessoa") togglePending(sl.id, true)
                                else if (v === "cargo") { togglePending(sl.id, false); if (sl.kind === "pessoa") setSlot(st.id, sl.id, { kind: "cargo", personId: null, delegable: false }) }
                              }}>
                              <ToggleGroupItem value="cargo" className={cn("min-h-11 flex-1 px-3 md:min-h-9", TOGGLE_ON)}>Cargo</ToggleGroupItem>
                              <ToggleGroupItem value="pessoa" className={cn("min-h-11 flex-1 px-3 md:min-h-9", TOGGLE_ON)}>Pessoa</ToggleGroupItem>
                            </ToggleGroup>
                            {kind === "cargo" ? (
                              // Any of the chosen cargos signs ("Gerente industrial, Gerente de manutenção ou Gerente da área").
                              <div className="min-w-0 @md:flex-1">
                                <PickList options={roleOptions} value={sl.roleIds} onChange={(ids) => setSlot(st.id, sl.id, { roleIds: ids })} addLabel="Cargo"
                                  ariaLabel={`Cargos que assinam: ${sl.meaning ?? ""}`} empty="Escolha ao menos um cargo." invalid={sl.roleIds.length === 0} />
                              </div>
                            ) : (
                              <Select value={sl.personId ?? ""} onValueChange={(v) => { togglePending(sl.id, false); setSlot(st.id, sl.id, { kind: "pessoa", personId: v, min: 1 }) }}>
                                <SelectTrigger className={cn("min-h-11 w-full min-w-0 bg-surface-row @md:flex-1 md:min-h-9", !named && "border-destructive")} aria-label="Pessoa que assina"><SelectValue placeholder="Pessoa" /></SelectTrigger>
                                <SelectContent><SelectGroup>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.company}</SelectItem>)}</SelectGroup></SelectContent>
                              </Select>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            {kind === "cargo" && <Stepper label="Assinaturas" value={sl.min} onChange={(n) => setSlot(st.id, sl.id, { min: n })} />}
                            <ToggleField label={st.locked ? "Obrigatória (fixa)" : "Obrigatória"} checked={sl.required} disabled={st.locked} onChange={(v) => setSlot(st.id, sl.id, { required: v, ...(v ? {} : { requiredWhen: undefined }) })} />
                          </div>
                          {!st.kind && kind === "pessoa" && <div className="space-y-3 rounded-lg border p-3">
                            <ToggleField label="Aprovação administrativa delegável" checked={sl.delegable === true} onChange={(v) => setSlot(st.id, sl.id, { delegable: v })} />
                            {sl.delegable && <><p className="type-meta">Somente aprovação administrativa. Delegante e substituto precisam de um destes cargos válidos; a assinatura continua em nome de quem age.</p><PickList options={roleOptions} value={sl.roleIds} onChange={(ids) => setSlot(st.id, sl.id, { roleIds: ids })} addLabel="Cargo" ariaLabel={`Cargos da delegação: ${sl.meaning ?? ""}`} empty="Escolha ao menos um cargo para esta aprovação administrativa." invalid={!sl.roleIds.length} /></>}
                          </div>}
                          {/* A signature the paper asks only in some cases (e.g. "Vigia, quando houver espaço confinado"). The fixed stages always need theirs. */}
                          {sl.required && !st.locked && (
                            <ConditionEditor idBase={`${sl.id}-rw`} value={sl.requiredWhen ?? pendingCond[sl.id]} lists={state.optionLists}
                              sources={tpl.stages.slice(0, i + 1).flatMap((x) => (tpl.form?.sections ?? []).filter((s) => s.stageId === x.id || (s.stageId === undefined && x === tpl.stages[0]))).flatMap((s) => s.items).filter((x) => x.kind === "marcacao" || x.kind === "verificacao")}
                              legend="Obrigatória só quando" toggle="Obrigatória só quando uma pergunta tiver certa resposta"
                              onChange={(c) => setCondition(st.id, sl, c)} />
                          )}

                          {chosen && (
                            <span className={cn("flex items-start gap-1.5 type-meta", short ? cn("font-medium", TONE_TEXT.stop) : TONE_TEXT.ok)}>
                              <UsersIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                              <span>{kind === "pessoa"
                                ? (elig.length ? `${named?.name} pode assinar` : `${named?.name} não pode assinar hoje`)
                                : elig.length === 0 ? `Ninguém elegível com ${rolesText(sl.roleIds, roleLabel)} nos locais do modelo` : `Elegíveis: ${elig.map((c) => c.person.name).join(", ")}`}</span>
                            </span>
                          )}

                          {/* Separation, where it applies: "a different person from …". */}
                          <div className="flex flex-col gap-1.5">
                            {rules.map((r) => {
                              const other = r.slotA === sl.id ? r.slotB : r.slotA
                              return (
                                <div key={separationKey(r)} className="flex min-h-11 items-center gap-2 md:min-h-9">
                                  <EqualNotIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                  <span className="min-w-0 flex-1 truncate type-body">Pessoa diferente de {slotLabels.get(other)}</span>
                                  {r.locked
                                    ? <span className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span>
                                    : <Button variant="ghost" size="icon" className="size-11 shrink-0 md:size-9" aria-label={`Remover regra com ${slotLabels.get(other)}`} onClick={() => removeRule(separationKey(r), slotLabels.get(other) ?? "")}><XIcon /></Button>}
                                </div>
                              )
                            })}
                            {free.length > 0 && (
                              <Select value="" onValueChange={(v) => set({ separation: [...tpl.separation, normalizeSeparation(sl.id, v)] })}>
                                <SelectTrigger className="min-h-11 w-full min-w-0 border-dashed bg-transparent text-muted-foreground shadow-none md:min-h-9" aria-label={`Exigir pessoa diferente para ${sl.meaning ?? ""}`}>
                                  <SelectValue placeholder="+ Pessoa diferente de…" />
                                </SelectTrigger>
                                <SelectContent><SelectGroup>{free.map((o) => <SelectItem key={o.id} value={o.id}>{slotLabels.get(o.id)}</SelectItem>)}</SelectGroup></SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            </li>
          </Fragment>
        )
      })}
    </ol>
    </div>
  )
}

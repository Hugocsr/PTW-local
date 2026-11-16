/** Testar: simulate a permit of this version end to end. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AssetIcon } from "@/components/shell/TypeIcon"
import { useAudit } from "@/audit/store"
import { BoxIcon, CheckCircle2Icon, CheckIcon, CircleDotIcon, CircleIcon, MapPinIcon, OctagonXIcon, PenLineIcon, TriangleAlertIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { fmtDateTime, useSim } from "@/sim/SimProvider"
import { label, locationPath, useRegistry } from "@/registry/store"
import { type SignSlot, type Stage, type TemplateContent } from "@/registry/types"
import type { PermitAttachment } from "@/permit/types"
import { uuidv7 } from "@/lib/id"
import { accessEvent, sha256Hex } from "@/core/audit"
import { checkSlot, slotKind, type RoleCheck } from "../FlowEditor"
import { rolesText } from "@/core/eligibility"
import { NotRequired, NotRequiredGroup, StageCard, type StageCardStatus } from "../../work/StageCard"
import { needSuffix, sectionStatus, slotNeed, slotRequired, type FormAnswers, type SlotNeed } from "@/core/form"
import { FillContext, FormFilesContext, useFormContext, type FormFiles } from "../FormFill"
import { TONE_SOLID, TONE_TEXT, type StatusTone } from "@/components/shell/Status"
import { sectionsOf } from "./shared"

/* =============================================================== */
/*  Testar: simulate a permit of this version end to end           */
/* =============================================================== */

function shortHash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, "0")
}

/** erro = stop (blocks the test), aviso = attention (to review), falta = pending (still yours to fill in). */
type Level = "ok" | "aviso" | "erro" | "falta"
const LEVEL_ICON = { ok: CheckIcon, aviso: TriangleAlertIcon, erro: OctagonXIcon, falta: CircleDotIcon }
const LEVEL_TONE: Record<Level, StatusTone> = { ok: "ok", aviso: "attention", erro: "stop", falta: "pending" }

/**
 * A setup block of the test (local, ativos). Its marker carries the block's icon, not a number, so
 * the stages that follow keep the PT's own numbering (1 to N), the same as Etapas and the summary.
 */
function Step({ id, icon: Icon, title, done, need, children }: { id: string; icon: typeof MapPinIcon; title: string; done: boolean; need?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-labelledby={`try-${id}`} className="flex flex-col gap-3 rounded-lg bg-surface-well p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* done = ok (filled marker with a check), still to do = pending (outlined, the action is yours). */}
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2", done ? cn("border-transparent text-white", TONE_SOLID.ok) : cn("border-current", TONE_TEXT.pending))} aria-hidden>
          {done ? <CheckIcon className="size-4" /> : <Icon className="size-3.5" />}
        </span>
        <h3 id={`try-${id}`} className="type-section">{title}</h3>
        {need && <div className="flex flex-wrap items-center gap-1">{need}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Testar: a rehearsal of a real permit on the same stage cards people fill in (the PT's Etapas tab).
 * Pick a place and assets, then each stage in order: fill in its part and sign "as" an eligible
 * person. Separation rules apply, and a stage opens only when the previous one is complete. Nothing
 * is saved and no permit is created.
 */
export function TryPanel({ tpl, head }: { tpl: TemplateContent; head: { templateId: string; name: string; version: number; versionId: string } }) {
  const { state } = useRegistry()
  const { today, now } = useSim()
  const { locations, assets, people, assetTypes, locationTypes, roleTypes } = state
  const [locId, setLocId] = useState("")
  const [assetIds, setAssetIds] = useState<string[]>([])
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [signed, setSigned] = useState<Record<string, { personId: string; at: string }[]>>({})

  const loc = locations.find((l) => l.id === locId)
  const path = useMemo(() => (loc ? locationPath(locations, loc.id) : []), [loc, locations])
  const pathIds = path.map((p) => p.id)
  const subtree = useMemo(() => {
    const out = new Set<string>()
    if (!loc) return out
    const walk = (id: string) => { out.add(id); locations.filter((l) => l.parentId === id).forEach((k) => walk(k.id)) }
    walk(loc.id)
    return out
  }, [loc, locations])

  const candidateAssets = loc ? assets.filter((a) => a.status !== "inativo" && tpl.assetTypeIds.includes(a.typeId) && a.locationIds.some((id) => subtree.has(id) || pathIds.includes(id))) : []
  const slotChecks = (sl: SignSlot) => checkSlot(people, tpl, sl, loc ? pathIds : null, today)
  const slots = tpl.stages.flatMap((st) => st.slots.map((sl) => ({ ...sl, stage: st.name })))
  const who = (id: string) => people.find((x) => x.id === id)?.name ?? id
  const signersOf = (slotId: string) => (signed[slotId] ?? []).map((g) => g.personId)
  /** People a separation rule keeps off this slot: whoever signed the other side. */
  const barred = (slotId: string) => new Set(tpl.separation.flatMap((r) => (r.slotA === slotId ? signersOf(r.slotB) : r.slotB === slotId ? signersOf(r.slotA) : [])))
  const ready = !!loc && assetIds.length > 0
  const stageDone = (st: Stage) => st.slots.filter((sl) => slotRequired(sl, answers)).every((sl) => signersOf(sl.id).length >= sl.min)
  const formCtx = useFormContext()
  const cur = ready ? tpl.stages.findIndex((st) => !stageDone(st)) : -1
  const finished = ready && cur === -1
  const audit = useAudit()
  // Testar is an access, not a write (acesso.modelo.teste): nothing is saved, only that it happened.
  const testNote = (kind: "iniciado" | "reiniciado") => audit.record([accessEvent("acesso.modelo.teste", { data: { modelo: head.templateId, versao: head.versionId, numero: head.version, teste: kind } }, audit.ctx())])
  useEffect(() => { testNote("iniciado") }, [head.versionId]) // eslint-disable-line react-hooks/exhaustive-deps
  const files = useTestFiles()
  const clear = () => { setAnswers({}); setSigned({}) }
  const reset = () => { clear(); testNote("reiniciado") }

  const issues: { level: Level; text: string }[] = []
  if (loc) {
    if (!assetIds.length) issues.push({ level: "erro", text: `Falta ativo: ${tpl.assetTypeIds.map((t) => label(assetTypes, t)).join(" ou ")}` })
    for (const sl of slots.filter((x) => slotRequired(x, answers))) {
      const n = slotChecks(sl).filter((c) => c.ok).length
      if (n < sl.min) issues.push({ level: "erro", text: `${sl.meaning || sl.stage}: ${n === 0 ? "ninguém elegível" : `só ${n} de ${sl.min} elegíveis`} neste local` })
    }
    for (const id of assetIds) {
      const a = assets.find((x) => x.id === id)
      if (a?.status === "em_revisao") issues.push({ level: "aviso", text: `Ativo ${a.code} em revisão no cadastro` })
    }
  }
  // The stage under test: answers that stop it, then what is still missing (the same gate as its card).
  if (cur >= 0) {
    const st = tpl.stages[cur]
    const gate = sectionsOf(tpl, st).map((x) => sectionStatus(x, answers, formCtx))
    for (const b of gate.flatMap((g) => g.blocked)) issues.push({ level: "erro", text: `Etapa ${cur + 1} · ${b}` })
    const missing = gate.flatMap((g) => g.missing)
    if (missing.length) issues.push({ level: "falta", text: `Etapa ${cur + 1} · falta ${missing.length}: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "…" : ""}` })
  }

  const snapshot = loc && {
    template: { id: head.templateId, name: head.name, version: head.version, versionId: head.versionId },
    location: { id: loc.id, code: loc.code, name: loc.name, type: label(locationTypes, loc.typeId), path: path.map((p) => p.name) },
    assets: assetIds.map((id) => { const a = assets.find((x) => x.id === id)!; return { id: a.id, code: a.code, name: a.name, type: label(assetTypes, a.typeId), recordRevision: a.revision } }),
    signatures: slots.map((sl) => ({ stage: sl.stage, meaning: sl.meaning, role: slotKind(sl) === "pessoa" ? "pessoa indicada" : rolesText(sl.roleIds, (id) => label(roleTypes, id)), required: sl.required, people: signersOf(sl.id).map((id) => ({ id, name: who(id) })) })),
    form: answers,
  }
  const snapJson = snapshot ? JSON.stringify(snapshot, null, 2) : ""

  return (
    // One column inside the version's main column (its side panel already takes the right): the test's
    // own status card first, then the setup and the stages.
    <div className="flex min-w-0 max-w-3xl flex-col gap-4">
      <div className="order-2 flex min-w-0 flex-col gap-4">
        <Step id="local" icon={MapPinIcon} title="Local" done={!!loc} need={tpl.locationTypeIds.map((t) => <Badge key={t} variant="outline">{label(locationTypes, t)}</Badge>)}>
          <Select value={locId} onValueChange={(v) => { setLocId(v); setAssetIds([]); clear() }}>
            <SelectTrigger className="h-auto min-h-11 w-full min-w-0 bg-surface-row text-left whitespace-normal md:min-h-9 *:data-[slot=select-value]:line-clamp-none" aria-label="Local do trabalho"><SelectValue placeholder="Escolha no cadastro" /></SelectTrigger>
            <SelectContent><SelectGroup>
              {locations.filter((l) => tpl.locationTypeIds.includes(l.typeId) && l.status !== "inativo").map((l) => (
                <SelectItem key={l.id} value={l.id}>{locationPath(locations, l.id).map((p) => p.name).join(" › ")}</SelectItem>
              ))}
            </SelectGroup></SelectContent>
          </Select>
        </Step>

        <Step id="ativos" icon={BoxIcon} title="Ativos" done={assetIds.length > 0} need={tpl.assetTypeIds.map((t) => <Badge key={t} variant="outline">{label(assetTypes, t)}</Badge>)}>
          {!loc ? <p className="type-meta">Escolha o local primeiro.</p>
            : candidateAssets.length === 0 ? <p className="type-meta">Nenhum ativo deste tipo no local.</p>
            : candidateAssets.map((a) => (
              // The whole row is the label: the touch target is the line, not the 16 px box.
              <Label key={a.id} htmlFor={`a-${a.id}`} className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-2 font-normal md:min-h-9">
                <Checkbox id={`a-${a.id}`} checked={assetIds.includes(a.id)} onCheckedChange={(c) => setAssetIds((s) => (c ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
                <AssetIcon id={a.id} /><span className="type-data shrink-0 whitespace-nowrap">{a.code}</span>{a.name}
              </Label>
            ))}
        </Step>

        <FillContext.Provider value={{ assetIds, ...(loc ? { pathIds } : {}) }}>
        <FormFilesContext.Provider value={files}>
        <ol className="flex flex-col gap-4" aria-label="Etapas da PT">
          {tpl.stages.map((st, i) => {
            const status: StageCardStatus = !ready || (cur !== -1 && i > cur) ? "futura" : i === cur ? "atual" : "feita"
            const isCur = i === cur
            return (
              <StageCard key={st.id} n={i + 1} stage={st} stages={tpl.stages} sections={sectionsOf(tpl, st)} answers={answers}
                status={status} turn={isCur ? "Em teste" : undefined} editing={isCur} actor={{ id: "teste", now }}
                onAnswer={(id, a) => setAnswers((x) => { const next = { ...x }; if (a) next[id] = a; else delete next[id]; return next })}
                signatures={({ done, blocked }) => (
                  <TrySignatures stage={st} answers={answers} active={isCur} scoped={ready} formDone={done}
                    whyTone={blocked.length ? "stop" : "pending"}
                    why={blocked.length ? "Uma resposta impede a etapa: não prossiga." : ""}
                    checks={slotChecks} signed={signed} barred={barred} who={who} roleLabel={(id) => label(roleTypes, id)}
                    need={(sl) => slotNeed(sl, answers, tpl.form ?? { sections: [] }, state.optionLists)}
                    onSign={(slotId, personId) => setSigned((x) => ({ ...x, [slotId]: [...(x[slotId] ?? []), { personId, at: now }] }))} />
                )} />
            )
          })}
        </ol>
        </FormFilesContext.Provider>
        </FillContext.Provider>
        {ready && (
          <div className="flex flex-col gap-2">
            {finished && <p className="flex items-center gap-2 type-body font-medium"><CheckCircle2Icon className={cn("size-5", TONE_TEXT.ok)} aria-hidden />Teste concluído: a PT passou por todas as etapas.</p>}
            <Button variant="outline" className="min-h-11 w-fit md:min-h-9" onClick={reset}>Recomeçar as etapas</Button>
          </div>
        )}
      </div>

      <Card className="order-1 min-w-0 gap-3">
        <div className="px-(--card-spacing) type-meta">Teste: nada é salvo e nenhuma PT é criada.</div>
        <CardHeader className="flex flex-row items-center gap-3">
          {!loc ? <span className="type-meta">Escolha um local para começar</span> : finished ? (
            <><CheckCircle2Icon className={cn("size-6 shrink-0", TONE_TEXT.ok)} aria-hidden /><span className="font-medium">Todas as etapas concluídas</span></>
          ) : ready ? (
            <><span className={cn("grid size-7 shrink-0 place-items-center rounded-full type-meta font-medium text-white tabular-nums", TONE_SOLID.pending)} aria-hidden>{cur + 1}</span><span className="font-medium">Etapa {cur + 1} de {tpl.stages.length}: {tpl.stages[cur].name}</span></>
          ) : (
            <><TriangleAlertIcon className={cn("size-6 shrink-0", TONE_TEXT.stop)} aria-hidden /><span className="font-medium">Escolha ao menos um ativo</span></>
          )}
        </CardHeader>
        {snapshot && (
          <CardContent>
            <Tabs defaultValue="pend">
              <TabsList className="w-full">
                <TabsTrigger value="pend">Pendências</TabsTrigger>
                <TabsTrigger value="snap">Instantâneo</TabsTrigger>
              </TabsList>
              <TabsContent value="pend" className="mt-3 flex flex-col gap-2">
                {issues.length === 0 && <p className="type-meta">Nenhum impedimento neste local.</p>}
                {issues.map((i, k) => {
                  const I = LEVEL_ICON[i.level]
                  return <div key={k} className="flex items-start gap-2 type-body"><I className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[LEVEL_TONE[i.level]])} aria-hidden />{i.text}</div>
                })}
              </TabsContent>
              <TabsContent value="snap" className="mt-3 flex flex-col gap-2">
                <ScrollArea className="h-72 rounded-md border bg-muted/40"><pre className="p-3 type-data">{snapJson}</pre></ScrollArea>
                <span className="type-data text-muted-foreground">código {shortHash(snapJson)} · prévia, não é uma PT</span>
              </TabsContent>
            </Tabs>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

/**
 * Testar's files: kept in this browser tab only (object URLs), with the SHA-256 of their bytes, the
 * same shape a PT keeps. Nothing reaches the PT's data and nothing is recorded.
 */
function useTestFiles(): FormFiles {
  const [attachments, setAttachments] = useState<PermitAttachment[]>([])
  const urls = useRef(new Map<string, string>())
  useEffect(() => { const m = urls.current; return () => m.forEach((u) => URL.revokeObjectURL(u)) }, [])
  const { now } = useSim()
  return {
    attachments,
    urlOf: (sha) => urls.current.get(sha),
    capture: async (itemId, kind, file) => {
      const sha256 = sha256Hex(new Uint8Array(await file.arrayBuffer()))
      if (!urls.current.has(sha256)) urls.current.set(sha256, URL.createObjectURL(file))
      const a: PermitAttachment = {
        id: uuidv7(), permitId: "", itemId, kind, sha256, fileName: file.name.slice(0, 255) || "arquivo", previewSha256: null,
        width: null, height: null, durationMs: null, capturedBy: "", capturedAt: now,
      }
      setAttachments((cur) => [...cur, a])
      return a
    },
  }
}

/**
 * Who signs a stage in the test: the same per-signature cards as the PT. On the stage under test,
 * each open signature offers the eligible people (minus anyone a separation rule bars) and signs
 * as the chosen one once the stage's part of the form is complete.
 */
function TrySignatures({ stage, active, scoped, formDone, why, whyTone, checks, signed, barred, who, roleLabel, need: needOf, onSign }: {
  stage: Stage; answers: FormAnswers; need: (sl: SignSlot) => SlotNeed; active: boolean; scoped: boolean; formDone: boolean; why: string; whyTone: StatusTone
  checks: (sl: SignSlot) => RoleCheck[]
  signed: Record<string, { personId: string; at: string }[]>
  barred: (slotId: string) => Set<string>
  who: (id: string) => string; roleLabel: (id: string) => string
  onSign: (slotId: string, personId: string) => void
}) {
  const [pick, setPick] = useState<Record<string, string>>({})
  // As on the PT: several signatures the answers do not require read as one muted line.
  const idle = stage.slots.filter((sl) => needOf(sl).need === "nao_exigida" && !(signed[sl.id] ?? []).length)
  const folded = idle.length >= 2
  return (
    <div className="@container flex flex-col gap-2">
      {active && !formDone && why && (
        <p className={cn("flex items-start gap-1.5 type-meta", TONE_TEXT[whyTone])}>{whyTone === "stop" ? <OctagonXIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <CircleDotIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />}{why}</p>
      )}
      {/* Rows with dividers, not cards: they already sit inside the stage card (DESIGN.md). */}
      <div className="flex flex-col divide-y">
        {stage.slots.filter((sl) => !folded || !idle.includes(sl)).map((sl) => {
          const done = signed[sl.id] ?? []
          const satisfied = done.length >= sl.min
          const bar = barred(sl.id)
          const all = checks(sl)
          const pending = all.filter((c) => !done.some((g) => g.personId === c.person.id))
          const options = pending.filter((c) => c.ok && !bar.has(c.person.id))
          const chosen = options.some((c) => c.person.id === pick[sl.id]) ? pick[sl.id] : options[0]?.person.id
          const need = needOf(sl)
          if (need.need === "nao_exigida" && done.length === 0) return (
            <div key={sl.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <span className="type-body font-medium text-muted-foreground">{sl.meaning || stage.name}<span className="type-meta font-normal"> · {slotKind(sl) === "pessoa" ? "pessoa indicada" : (rolesText(sl.roleIds, roleLabel) || "sem cargo")}{sl.min > 1 ? ` · ${sl.min}×` : ""}</span></span>
              <NotRequired when={need.when} />
            </div>
          )
          return (
            <div key={sl.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <span className="type-body font-medium">{sl.meaning || stage.name}<span className="type-meta font-normal"> · {slotKind(sl) === "pessoa" ? "pessoa indicada" : (rolesText(sl.roleIds, roleLabel) || "sem cargo")}{sl.min > 1 ? ` · ${sl.min}×` : ""}{needSuffix(need)}</span></span>
              {done.map((g) => (
                <span key={g.personId} className="flex items-center gap-1.5 type-body"><CheckIcon className={cn("size-4 shrink-0", TONE_TEXT.ok)} aria-hidden />{who(g.personId)}<span className="type-meta">· {fmtDateTime(g.at)} · teste</span></span>
              ))}
              {/* As on the PT's Etapas: who may still sign, and why someone may not. */}
              {!satisfied && (
                <div className="flex flex-col gap-0.5 type-meta">
                  {/* Stage under test: the signature is yours to give (pending); a later stage waits (neutral). */}
                  <span className={cn("flex items-center gap-1.5", TONE_TEXT[active ? "pending" : "neutral"])}><CircleIcon className="size-3.5 shrink-0" aria-hidden />Aguardando assinatura</span>
                  {scoped && pending.length === 0 && <span className={cn("pl-5", TONE_TEXT.stop)}>Ninguém elegível agora.</span>}
                  {scoped && pending.map((c) => {
                    const no = !c.ok ? `não elegível: ${c.reasons.join(", ")}` : bar.has(c.person.id) ? "não pode: já assinou do outro lado da regra de pessoa diferente" : ""
                    return <span key={c.person.id} className="pl-5">{c.person.name}{no && <span className={TONE_TEXT.stop}> · {no}</span>}</span>
                  })}
                </div>
              )}
              {!satisfied && active && (
                options.length === 0 ? (
                  <span className={cn("type-meta", TONE_TEXT.stop)}>Ninguém pode assinar neste local{bar.size ? " (regra de pessoa diferente)" : ""}.</span>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {/* One eligible person needs no choice: the button already names them. */}
                    {options.length > 1 && (
                      <Select value={chosen} onValueChange={(v) => setPick((x) => ({ ...x, [sl.id]: v }))}>
                        <SelectTrigger className="min-h-11 w-full min-w-0 bg-background sm:w-56 md:min-h-9" aria-label={`Assinar como: ${sl.meaning ?? stage.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectGroup>{options.map((c) => <SelectItem key={c.person.id} value={c.person.id}>{c.person.name}</SelectItem>)}</SelectGroup></SelectContent>
                      </Select>
                    )}
                    <Button className="min-h-11 md:min-h-9" disabled={!formDone || !chosen} onClick={() => chosen && onSign(sl.id, chosen)}>
                      <PenLineIcon data-icon="inline-start" />Assinar como {who(chosen ?? "").split(" ")[0]}
                    </Button>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
      {folded && <NotRequiredGroup slots={idle.map((sl) => { const n = needOf(sl); return { meaning: sl.meaning || stage.name, when: n.need === "nao_exigida" ? n.when : "" } })} />}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AssetIcon, LocationIcon } from "@/components/shell/TypeIcon"
import { useAudit } from "@/audit/store"
import { AttachmentOpenContext } from "@/audit/attachmentOpen"
import { accessEvent, auditGroup, eventIso, type AuditEvent } from "@/core/audit"
import { dmy, hms } from "@/core/time"
import { auditLook } from "../audit/look"
import { useEventReader } from "../audit/reader"
import { pathIds } from "@/core/permitView"
import { equipmentOf } from "./useMyWork"
import {
  CalendarClockIcon, CircleAlertIcon, EyeIcon, HourglassIcon, KeyRoundIcon, LockIcon, OctagonXIcon, PenLineIcon, PrinterIcon, UserRoundIcon,
} from "lucide-react"
import { TONE_TEXT, type StatusTone } from "../shell/Status"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { TOGGLE_ON } from "../registry/common"
import { NAV } from "../shell/nav"
import { Page, PageHeader } from "../shell/Page"
import { isFinalState, nextLabel, railOf, waitsFor, type StageView } from "@/core/permitView"
import { actionLabel, canReturn, planSign } from "@/core/signing"
import { HolderText } from "./HolderText"
import { canStop, needsResume, planResume, resumeCandidates, STOPPABLE } from "@/core/stopResume"
import type { Permit } from "@/permit/types"
import type { TemplateVersion } from "@/registry/types"
import { usePermits } from "@/permit/store"
import { fmtDate, label, locationPath, useRegistry } from "@/registry/store"
import { fmtDateTime, useSim } from "@/sim/SimProvider"
import { DataTable, type Column } from "../registry/DataTable"
import { PersonAvatar } from "../registry/common"
import { permitName, fmtWindow } from "@/core/permitFormat"
import { backTarget, goBack, navigate } from "./nav"
import { AssinarDialog } from "./AssinarDialog"
import { PermitFormTab } from "./PermitFormTab"
import { ResumeDialog } from "./ResumeDialog"
import { ExtendDialog } from "./ExtendDialog"
import { ElectricalPanel } from "./ElectricalPanel"
import { planExtend } from "@/core/extension"
import { StopSheet } from "./StopSheet"
import { DownBanner, EstadoAutorizacao } from "./state"
import { StageRail } from "./StageRail"
import { PermitSheet } from "./PermitSheet"
import { useData } from "@/data/context"
import { usePermitHistory } from "@/data/hooks"
import { NewPermitView } from "./NewPermitView"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

export const PERMIT_TABS = ["etapas", "equipe", "historico"] as const
export type PermitTab = (typeof PERMIT_TABS)[number]
const TAB_TITLE: Record<PermitTab, string> = { etapas: "Formulário", equipe: "Equipe", historico: "Histórico" }

/** Back to the screen the permit was opened from (Minha área, Quadro…); the Quadro when opened directly. */
const back = () => goBack("quadro")
/** The back link's text: the real name of where "Voltar" goes (DESIGN.md), never just "Voltar". */
function useBackLabel(): string {
  const { permits } = usePermits()
  const from = backTarget("quadro")
  const [head, id] = from.split("/")
  if (head === "pt") { const p = permits.find((x) => x.id === id); return p ? permitName(p) : "PT" }
  if (from === "minha-area/eu") return "Seus cargos e conta"
  return (NAV as Record<string, { title: string }>)[head]?.title ?? NAV.quadro.title
}
/** Tabs replace the history entry: "Voltar" leaves the PT in one step. */
const toTab = (id: string, tab: string) => navigate(`pt/${id}/${tab}`, { replace: true })

export function PermitDetailView({ id, tab }: { id: string; tab: string }) {
  const { state } = useRegistry()
  const data = usePermits()
  const port = useData()
  const [loaded, setLoaded] = useState<{ id: string; error: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [blank, setBlank] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [reason, setReason] = useState("")
  const [discardBusy, setDiscardBusy] = useState(false)
  const [discardError, setDiscardError] = useState("")
  const sim = useSim()
  const backLabel = useBackLabel()
  const permit = data.permits.find((p) => p.id === id)
  useEffect(() => {
    let live = true
    void port.permits.load(id).then(() => { if (live) setLoaded({ id, error: "" }) }, (e: unknown) => {
      if (live) setLoaded({ id, error: e && typeof e === "object" && "message" in e ? String(e.message) : "O servidor não respondeu" })
    })
    return () => { live = false }
  }, [id, port])
  const tpl = state.templates.find((t) => t.id === permit?.templateId)
  const ver = tpl?.versions.find((v) => v.id === permit?.versionId)
  // Old names (and the removed Resumo) open Formulário.
  const wanted = tab === "formulario" || tab === "assinaturas" || tab === "resumo" ? "etapas" : tab
  const current: PermitTab = (PERMIT_TABS as readonly string[]).includes(wanted) ? (wanted as PermitTab) : "etapas"
  // An unknown or old tab name is rewritten to the one shown, without a new history entry.
  useEffect(() => { if (permit && tab !== current) toTab(id, current) }, [permit, id, tab, current])
  // Opening a PT is a read the audit log keeps (tab changes are not new reads).
  const { record, ctx } = useAudit()
  const found = !!permit
  const permitRef = useRef(permit)
  const attachmentsRef = useRef(data.attachments)
  useEffect(() => { permitRef.current = permit; attachmentsRef.current = data.attachments })
  useEffect(() => {
    const p = permitRef.current
    if (p) record([accessEvent("acesso.pt.aberta", { permit: { id: p.id, revision: p.revision } }, ctx())])
  }, [id, found, record, ctx])
  const openedFile = useCallback((attachmentId: string, how: "visto" | "baixado") => {
    const p = permitRef.current
    const a = attachmentsRef.current.find((x) => x.id === attachmentId)
    if (p && a) record([accessEvent(`acesso.anexo.${how}`, { permit: { id: p.id, revision: p.revision }, attachment: { id: a.id, permitId: a.permitId, fileName: a.fileName, kind: a.kind, sha256: a.sha256 } }, ctx())])
  }, [record, ctx])
  const rail = useMemo(
    () => (permit && ver ? railOf(permit, ver, data.signatures, state.people, state.locations, sim.today, sim.now, state.delegations) : []),
    [permit, ver, data.signatures, state.people, state.locations, sim.today, sim.now, state.delegations],
  )

  if (!permit || !tpl || !ver) {
    return (
      <Page>
        <PageHeader back={{ label: backLabel, onClick: back }} title={loaded?.id !== id ? "Carregando PT…" : loaded.error ? "Não foi possível abrir a PT" : "PT não encontrada"} meta={loaded?.id === id ? loaded.error || "O endereço não corresponde a nenhuma PT." : undefined} />
      </Page>
    )
  }
  const stopped = !sim.serverDown && (permit.state === "suspensa" || permit.holdReason !== null)
  const resumers = needsResume(permit) ? resumeCandidates(permit, ver, state.people, state.locations, sim.today, sim.now) : []
  const next = nextLabel(permit, rail, state.people, resumers)
  const nextMine = waitsFor(permit, rail, sim.personId, resumers)
  const tplName = `${tpl.name} v${ver.number}`
  const canEdit = permit.authorId === sim.personId && (permit.state === "rascunho" || permit.state === "devolvida")
  if (editing && canEdit) return <NewPermitView permit={permit} onBack={() => setEditing(false)} />
  const discard = async () => {
    if (discardBusy || !reason.trim()) return
    setDiscardBusy(true); setDiscardError("")
    const e = await port.permits.discard?.(permit.id, reason.trim())
    setDiscardBusy(false)
    if (e) { setDiscardError(e.message); return }
    setDiscarding(false); toast.success("Rascunho descartado")
  }

  // The PT header reads in one order: identity (number, then the service) → state, once, in the
  // authorization block → who acts next and the actions → the facts. No badge or meta line repeats
  // the state, the model or the location (they live in the block and in the facts).
  // The printed sheet is the Formulário (every stage with its answers and signatures): go there first.
  // Printing never shows the screen: it prints the PT as a paper form (`PermitSheet`), filled or blank.
  const print = (asBlank = false) => {
    setBlank(asBlank)
    setTimeout(() => window.print(), 150)
  }
  const printer = state.people.find((x) => x.id === sim.personId)?.name ?? "—"
  return (
    <Page>
      <PermitSheet permit={permit} form={data.formOf(permit, ver) ?? { sections: [] }} rail={rail} registry={state} tplName={tplName} versionNumber={ver.number}
        printedBy={printer} now={sim.now} url={`${window.location.origin}/#pt/${permit.id}`} blank={blank} />
      <div className="contents print:hidden">
      {stopped && (
        <div role="alert" className="-mx-4 -mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 bg-st-stop-solid px-4 py-3 text-white md:-mx-6 md:-mt-6 md:px-6 lg:-mx-8 lg:px-8">
          <OctagonXIcon className="size-6 shrink-0" aria-hidden />
          <strong className="text-lg leading-6 font-bold tracking-[0.04em] uppercase">Trabalho parado</strong>
          <span className="type-body">{permit.holdReason ?? "Aguarda Retomada e novo Aceite no campo."}{permit.holdAt ? ` · ${hms(permit.holdAt)}` : ""}</span>
        </div>
      )}
      <PageHeader back={{ label: backLabel, onClick: back }} title={permit.scope || permitName(permit)}
        meta={<span className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-foreground"><span className={permit.number ? "type-data-title" : "type-section"}>{permit.number ?? "Rascunho"}</span><span className="type-label">Permissão de trabalho · Revisão {permit.revision}</span></span>}
        actions={{ secondary: [{ label: "Imprimir", icon: PrinterIcon, onClick: () => print() }], menu: [{ label: "Imprimir em branco", onClick: () => print(true) }, ...(canEdit ? [
          { label: "Editar rascunho", disabled: sim.serverDown, onClick: () => setEditing(true) },
          ...(permit.state === "rascunho" ? [{ label: "Descartar rascunho", destructive: true, disabled: sim.serverDown, onClick: () => { setReason(""); setDiscardError(""); setDiscarding(true) } }] : []),
        ] : [])] }} />
      <Dialog open={discarding} onOpenChange={(o) => { if (!discardBusy) setDiscarding(o) }}><DialogContent><DialogHeader><DialogTitle>Descartar rascunho</DialogTitle><DialogDescription>O rascunho será cancelado. O registro e seu histórico continuam na auditoria.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="discard-reason">Motivo</FieldLabel><Textarea id="discard-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={discardBusy} /></Field>{discardError && <p role="alert" className={TONE_TEXT.stop}>{discardError}</p>}<DialogFooter><Button variant="outline" className="min-h-11 md:min-h-9" onClick={() => setDiscarding(false)} disabled={discardBusy}>Voltar</Button><Button variant="destructive" className="min-h-11 md:min-h-9" disabled={discardBusy || sim.serverDown || !reason.trim()} onClick={() => void discard()}>{discardBusy ? "Descartando…" : "Descartar rascunho"}</Button></DialogFooter></DialogContent></Dialog>
      {sim.serverDown && <DownBanner now={sim.now} note="Preencher, assinar, devolver e retomar voltam com o servidor. Parar continua disponível." />}
      {/* The PT header band: state and actions on the left, the facts beside them from lg (stacked
          below it). The form below gets the full width of the frame (no side column). */}
      <section aria-label="Estado e ações da PT"
        className="grid min-w-0 gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <ActionPanel permit={permit} rail={rail} ver={ver} next={next} nextMine={nextMine} />
        <PermitFacts permit={permit} tplName={tplName} holdsEquipment={ver.holdsEquipment} />
      </section>
      <StageRail rail={rail} onPick={(stageId) => { if (current !== "etapas") toTab(id, "etapas"); requestAnimationFrame(() => document.getElementById(`pf-${stageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })) }} />
      <div className="flex min-w-0 flex-col gap-4">
        <Tabs value={current} onValueChange={(t) => toTab(id, t)} className="min-w-0 gap-4">
          <TabsList className="w-full lg:w-fit print:hidden">
            {PERMIT_TABS.map((t) => <TabsTrigger key={t} value={t}>{TAB_TITLE[t]}</TabsTrigger>)}
          </TabsList>
          {PERMIT_TABS.map((t) => (
            <TabsContent key={t} value={t} className="flex min-w-0 flex-col gap-3">
              <h2 className="sr-only">{TAB_TITLE[t]}</h2>
              {t === "etapas" ? <AttachmentOpenContext.Provider value={openedFile}><PermitFormTab permit={permit} ver={ver} rail={rail} /></AttachmentOpenContext.Provider>
                : t === "equipe" ? <Team permit={permit} />
                : <History permit={permit} />}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      </div>
    </Page>
  )
}

/* ---------- Properties ---------- */

/**
 * The permit's facts as a compact grid, label over value, each fact once: where (Local, Ativos, with the
 * location code beside its name), when (Janela), what form (Modelo; "Não prende o equipamento" when its
 * version does not hold it), who asked (Solicitante), Revisão.
 * Long values take the full row on a phone; beside the actions from lg (one column, two from xl,
 * three from 2xl); stacked under the actions below lg (two columns).
 */
function PermitFacts({ permit, tplName, holdsEquipment }: { permit: Permit; tplName: string; holdsEquipment: boolean }) {
  const { state } = useRegistry()
  const path = locationPath(state.locations, permit.locationId)
  const here = path.at(-1)
  const author = state.people.find((p) => p.id === permit.authorId)
  const assets = permit.assetIds.map((a) => state.assets.find((s) => s.id === a))
  const code = (c: string | undefined) => c ? <span className="type-data whitespace-nowrap text-muted-foreground">{c}</span> : null
  const facts: { label: string; value: ReactNode; wide?: boolean }[] = [
    {
      label: "Local", wide: true,
      value: <span className="flex items-start gap-2"><LocationIcon id={permit.locationId} className="mt-0.5" /><span className="min-w-0">{path.slice(0, -1).map((l) => l.name).join(" › ")}{path.length > 1 && " › "}<span className="font-medium">{here?.name ?? "—"}</span> {code(here?.code)}</span></span>,
    },
    {
      label: permit.assetIds.length === 1 ? "Ativo" : "Ativos", wide: true,
      value: assets.length
        ? <span className="flex flex-col">{assets.map((x, i) => <span key={x?.id ?? i} className="flex items-start gap-2"><AssetIcon id={x?.id} className="mt-0.5" /><span className="min-w-0">{x ? <>{x.name} {code(x.code)}</> : "—"}</span></span>)}</span>
        : "—",
    },
    { label: "Janela", wide: true, value: <span className="tabular-nums">{fmtWindow(permit)}</span> },
    {
      label: "Modelo", wide: true,
      // A model that does not hold equipment (e.g. disabling an interlock) coexists with another open PT on it.
      value: holdsEquipment ? tplName : <span className="flex flex-col">{tplName}<span className="type-meta">Não prende o equipamento</span></span>,
    },
    { label: "Solicitante", value: author?.name ?? "—" },
    { label: "Revisão", value: <span className="tabular-nums">{permit.revision}</span> },
  ]
  return (
    <dl aria-label="Dados da PT" className="doc-block min-w-0 grid-cols-2 xl:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className={cn("doc-cell flex flex-col gap-1", f.wide && "max-sm:col-span-2")}>
          <dt className="type-label">{f.label}</dt>
          <dd className="min-w-0 break-words type-body">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- Assinaturas: the rail ---------- */

/* ---------- Equipe ---------- */

function Team({ permit }: { permit: Permit }) {
  const { state } = useRegistry()
  const { today } = useSim()
  type R = { personId: string; roleId: string }
  const rows: R[] = Object.entries(permit.team).flatMap(([roleId, ids]) => ids.map((personId) => ({ personId, roleId })))
  const person = (r: R) => state.people.find((p) => p.id === r.personId)
  const assignment = (r: R) => person(r)?.roles.find((a) => a.roleId === r.roleId)
  const columns: Column<R>[] = [
    { id: "name", header: "Pessoa", sort: (a, b) => (person(a)?.name ?? "").localeCompare(person(b)?.name ?? "", "pt-BR"), cell: (r) => <span className="flex items-center gap-2 font-medium"><PersonAvatar name={person(r)?.name ?? "?"} className="size-6" />{person(r)?.name}</span> },
    { id: "role", header: "Cargo", cell: (r) => label(state.roleTypes, r.roleId) },
    { id: "company", header: "Empresa", className: "hidden lg:table-cell", cell: (r) => person(r)?.company },
    { id: "valid", header: "Cargo até", className: "hidden lg:table-cell tabular-nums", cell: (r) => { const a = assignment(r); return a ? <span className={a.validUntil < today ? cn("font-medium", TONE_TEXT.stop) : undefined}>{fmtDate(a.validUntil)}{a.validUntil < today && " (vencido)"}</span> : "—" } },
    { id: "login", header: "Login", cell: (r) => (person(r)?.login ? <span className="flex items-center gap-1"><KeyRoundIcon className="size-4" aria-hidden />Com login</span> : <span className="flex items-center gap-1 text-muted-foreground"><UserRoundIcon className="size-4" aria-hidden />Sem login</span>) },
  ]
  return <DataTable<R> rows={rows} rowKey={(r) => `${r.roleId}${r.personId}`} columns={columns} noun={["pessoa", "pessoas"]} searchLabel="Buscar pessoa ou cargo" searchText={(r) => `${person(r)?.name} ${label(state.roleTypes, r.roleId)}`} empty={<p className="type-meta">Ninguém na equipe desta PT.</p>} />
}

/* ---------- Histórico ---------- */

/**
 * The PT's history is the audit log filtered by this permit: changes and denied attempts (denied in red).
 * Reads of the PT are counted, not listed; the count links to Auditoria filtered by this PT.
 */
function History({ permit }: { permit: Permit }) {
  const { canAudit } = useSim()
  const store = usePermits()
  const { revisions } = store
  const history = usePermitHistory(permit.id)
  const [view, setView] = useState<"todos" | "assinou" | "negado" | "revisoes">("todos")
  const mine = history.items
  const all = mine.filter((e) => { const g = auditGroup(e); return g === "alteracao" || g === "negada" })
  const reads = history.accesses
  const ev = view === "negado" ? all.filter((e) => !e.ok) : view === "assinou" ? all.filter((e) => e.action.startsWith("pt.assinatura")) : all
  const rv = revisions.filter((r) => r.permitId === permit.id)
  const rvCols: Column<(typeof rv)[number]>[] = [
    { id: "rev", header: "Revisão", sort: (a, b) => a.rev - b.rev, cell: (r) => `r${r.rev}` },
    { id: "at", header: "Hora", className: "tabular-nums", cell: (r) => fmtDateTime(r.at) },
    { id: "reason", header: "Motivo", className: "whitespace-normal", cell: (r) => r.reason },
    { id: "hash", header: "Impressão digital", className: "type-data", cell: (r) => <span title={r.sha256}>{r.sha256.slice(0, 12)}…</span> },
  ]
  return (
    <div className="flex flex-col gap-3">
      {/* One level under the tabs: the filters and the revisions share one group. */}
      <ToggleGroup type="single" variant="outline" value={view} aria-label="Ver no histórico" className="justify-start flex-wrap" onValueChange={(v) => v && setView(v as typeof view)}>
        {([["todos", "Todos"], ["assinou", "Assinaturas"], ["negado", "Negados"], ["revisoes", "Revisões"]] as const).map(([v, l]) => <ToggleGroupItem key={v} value={v} className={cn("min-h-11 md:min-h-9", TOGGLE_ON)}>{l}</ToggleGroupItem>)}
      </ToggleGroup>
      {view !== "revisoes" ? (
        <>
          {history.loading ? <p role="status" className="type-meta">Carregando o histórico…</p> : history.error ? <p role="alert" className="type-meta">Não foi possível carregar o histórico: {history.error.message}</p>
            : <Timeline events={ev} />}
          {history.nextBefore !== null && <p className="type-meta">Os 500 eventos mais recentes.{canAudit && " Consulte a auditoria para buscar eventos anteriores."}</p>}
          <p className="flex flex-wrap items-center gap-x-2 type-meta">
            <EyeIcon className="size-4" aria-hidden />Acessos: {history.loading ? "…" : history.error ? "Não disponível" : reads ?? "—"}
            {canAudit && <Button asChild variant="link" className="h-auto min-h-11 px-0 type-meta md:min-h-9"><a href={`#auditoria/pt/${permit.id}`}>Ver na auditoria</a></Button>}
          </p>
        </>
      ) : (
        <DataTable key="rv" rows={rv} rowKey={(r) => String(r.rev)} columns={rvCols} noun={["revisão", "revisões"]} searchLabel="Buscar revisão" searchText={(r) => `r${r.rev} ${r.reason}`} defaultSort={{ id: "rev", dir: "desc" }} empty={<p className="type-meta">Só a primeira revisão.</p>} />
      )}
    </div>
  )
}

/** The PT's history as a timeline: one day per group, newest first; a denied attempt reads red with the word. */
function Timeline({ events }: { events: AuditEvent[] }) {
  const { who, title: textOf, lines: changesOf } = useEventReader()
  if (!events.length) return <p className="type-meta">Nenhum evento registrado.</p>
  const sorted = [...events].sort((a, b) => b.seq - a.seq)
  const days: { day: string; items: AuditEvent[] }[] = []
  for (const e of sorted) {
    const day = dmy(eventIso(e))
    const last = days.at(-1)
    if (last && last.day === day) last.items.push(e); else days.push({ day, items: [e] })
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((d) => (
        <section key={d.day} className="flex flex-col">
          <h3 className="mb-3 flex items-center gap-3 type-label text-foreground"><span className="tabular-nums">{d.day}</span><span aria-hidden className="h-px flex-1 bg-foreground" /><span className="tabular-nums">{d.items.length}</span></h3>
          <ol className="flex flex-col">
            {d.items.map((e, i) => {
              const { tone, icon: Icon } = auditLook(e)
              const t = e.ok ? tone : "stop"
              return (
                <li key={e.seq} className="relative grid grid-cols-[4.25rem_1.5rem_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
                  <time className="pt-1 text-right type-data text-muted-foreground">{hms(eventIso(e))}</time>
                  <span className="relative flex justify-center">
                    {i < d.items.length - 1 && <span aria-hidden className="absolute top-6 -bottom-4 w-px bg-border" />}
                    <span className={cn("relative z-10 grid size-6 place-items-center rounded-full border bg-background", TONE_TEXT[t], !e.ok && "border-st-stop-solid")}><Icon className="size-3.5" aria-hidden /></span>
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className={cn("type-body break-words", !e.ok && cn("font-medium", TONE_TEXT.stop))}>{!e.ok && "Negado · "}{textOf(e)}</p>
                    {changesOf(e).slice(0, 4).map((c) => <p key={c} className="type-meta break-words">{c}</p>)}
                    <p className="type-meta">{who(e.actor)}{e.rev ? ` · r${e.rev}` : ""}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

/**
 * "Próxima: …" under the state block. Mine: blue with the pen and "você" (pending); nobody eligible:
 * red (stop); someone else: grey hourglass (neutral, waiting for them).
 */
function NextLine({ next, mine }: { next: string; mine: boolean }) {
  const none = next.startsWith("Sem elegível")
  const tone: StatusTone = mine ? "pending" : none ? "stop" : "neutral"
  const Icon = mine ? PenLineIcon : none ? CircleAlertIcon : HourglassIcon
  return (
    <p className={cn("flex items-start gap-1.5 type-body", TONE_TEXT[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>Próxima: <strong>{next}</strong>{mine && " (você)"}</span>
    </p>
  )
}

/** Panel buttons: 44 px at every width (DESIGN.md exception: safety actions, Fitts); the primary fills the action column; a long label wraps instead of being cut. */
const PANEL_BTN = "h-auto min-h-11 w-full whitespace-normal py-2 text-center"
/** Secondaries and Parar: one row that shares the column's width, wrapping when it has to. */
const ROW_BTN = "h-auto min-h-11 min-w-[7.5rem] flex-1 whitespace-normal py-2"

/**
 * The PT's action block (DESIGN.md), always in this order: state → next person → primary (Retomar,
 * Assinar…) → secondaries (Devolver) → Parar. Parar shows whenever the PT is in the field and no stop
 * already waits for its Retomada, red, and stays enabled without the server; disabled with its
 * reason only when this person has no active login. Assinar only for the person eligible for the
 * pending signature, blocked with its reason visible; never on a finished PT. Devolver stays
 * reachable while the person's part of the form is still open (refusing does not require filling it in).
 */
function ActionPanel({ permit, rail, ver, next, nextMine }: { permit: Permit; rail: StageView[]; ver: TemplateVersion; next: string; nextMine: boolean }) {
  const { state } = useRegistry()
  const { permits, formOf } = usePermits()
  const sim = useSim()
  const [sign, setSign] = useState<{ id: string; returning: boolean } | null>(null)
  const [stopId, setStopId] = useState<string | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [extendId, setExtendId] = useState<string | null>(null)
  const me = state.people.find((p) => p.id === sim.personId)

  // Assinar / Enviar / Entregar…
  const plan = me && !isFinalState(permit.state) ? planSign({ permit, ver, rail, permits, signer: me, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, timezone: state.units[0]?.timezone, serverDown: sim.serverDown, equipment: equipmentOf(state), people: state.people, form: formOf(permit, ver), pathIds: pathIds(state.locations, permit.locationId), lists: state.optionLists }) : null
  const mine = !!me && !!plan?.slot && plan.slot.eligible.some((e) => e.person.id === me.id) && !plan.slot.signed.some((g) => g.personId === me.id)
  const signFail = mine && plan && !plan.fillOnly ? plan.checks.find((c) => !c.ok) : undefined
  const pending = mine && plan ? plan.checks.filter((c) => c.fill && !c.ok) : []
  // "Preencher e …" only when filling is what stands between the person and the act.
  const signText = mine && plan ? actionLabel(permit, plan, pending.length > 0 && !signFail) : ""
  const giveBack = mine && !!plan && !!me && pending.length > 0 && !signFail && canReturn(permit, plan, me.id)
  const onSign = () => {
    if (!pending.length) return setSign({ id: permit.id, returning: false })
    toTab(permit.id, "etapas")
    setTimeout(() => document.getElementById("pf-mine")?.scrollIntoView({ block: "start", behavior: "smooth" }), 50)
  }

  // Parar / Retomar
  const waiting = needsResume(permit)
  const stop = me ? canStop(permit, me, sim.now) : null
  const resume = waiting && me ? planResume({ permit, ver, signer: me, people: state.people, locations: state.locations, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, serverDown: sim.serverDown }) : null
  const resumeFail = resume?.checks.find((c) => !c.ok)
  // Prorrogar: only for whoever may issue it, while emitida or ativa and the window has not ended; without the server, disabled with the reason.
  const ext = me ? planExtend({ permit, ver, signer: me, people: state.people, locations: state.locations, roleLabel: (id) => label(state.roleTypes, id), now: sim.now, today: sim.today, timezone: state.units[0]?.timezone, serverDown: sim.serverDown }) : null
  const showExtend = !!ext && ext.checks.every((c) => c.ok || c.id === "server")
  const extendFail = ext?.checks.find((c) => !c.ok)
  // In the field and no stop already waiting for its Retomada (disabled only when the person has no active login).
  const showStop = !!stop && !waiting && STOPPABLE.includes(permit.state)

  return (
    <div className="flex flex-col gap-4">
      <EstadoAutorizacao permit={permit} serverDown={sim.serverDown} now={sim.now} />
      <ElectricalPanel permit={permit} ver={ver} form={formOf(permit, ver)} />
      {next !== "—" && <NextLine next={next} mine={nextMine} />}

      {(waiting || mine || showStop || showExtend) && (
        <div className="flex flex-col gap-2 print:hidden">
          {/* The primary (Retomar or the person's act) takes its own row, its reason right under it. */}
          {waiting && (
            <div className="flex flex-col gap-1">
              <Button variant={resumeFail ? "outline" : "default"} className={PANEL_BTN} disabled={!!resumeFail} aria-describedby={resumeFail ? "resume-why" : undefined} onClick={() => setResumeId(permit.id)}>Retomar</Button>
              {resumeFail && <p id="resume-why" className={cn("flex items-start gap-1.5 type-meta", TONE_TEXT.neutral)}><LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span>Retomar bloqueado: {resumeFail.text}</span></p>}
            </div>
          )}
          {mine && (
            <div className="flex flex-col gap-1">
              <Button variant={signFail ? "outline" : "default"} className={PANEL_BTN} disabled={!!signFail} aria-describedby={signFail ? "sign-why" : undefined} onClick={onSign}>{signText}</Button>
              {/* What is missing is marked on the stage itself ("Preencher e …" leads there); only a block is said here. */}
              {signFail && (
                <p id="sign-why" className={cn("flex items-start gap-1.5 type-meta", TONE_TEXT.neutral)}>
                  {signFail.holder && <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                  <span>Bloqueado: <HolderText text={signFail.text} holders={signFail.holder ? [signFail.holder] : []} /></span>
                </p>
              )}
            </div>
          )}
          {/* Secondaries share one row, Parar last (always at the row's end, red); reasons below the row. */}
          {(giveBack || showExtend || showStop) && (
            <div className="flex flex-wrap gap-2">
              {giveBack && <Button variant="outline" className={ROW_BTN} onClick={() => setSign({ id: permit.id, returning: true })}>Devolver</Button>}
              {showExtend && (
                <Button variant="outline" className={ROW_BTN} disabled={!!extendFail} aria-describedby={extendFail ? "extend-why" : undefined} onClick={() => setExtendId(permit.id)}>
                  <CalendarClockIcon data-icon="inline-start" />Prorrogar
                </Button>
              )}
              {showStop && stop && (
                <Button variant="stop" className={ROW_BTN} disabled={!stop.ok} aria-describedby={!stop.ok ? "stop-why" : undefined} onClick={() => setStopId(permit.id)}>
                  <OctagonXIcon data-icon="inline-start" />Parar
                </Button>
              )}
            </div>
          )}
          {showExtend && extendFail && <p id="extend-why" className={cn("type-meta", TONE_TEXT.stop)}>Prorrogar: {extendFail.text}</p>}
          {showStop && stop && !stop.ok && <p id="stop-why" className={cn("type-meta", TONE_TEXT.stop)}>Parar: {stop.reason}</p>}
        </div>
      )}

      {showStop && stop?.ok && (
        <>
          <div aria-hidden className="h-16 md:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-foreground bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
            <Button variant="stop" className="h-14 w-full text-base font-bold tracking-[0.06em] uppercase" onClick={() => setStopId(permit.id)}><OctagonXIcon data-icon="inline-start" className="size-5" />Parar o trabalho</Button>
          </div>
        </>
      )}
      <AssinarDialog permitId={sign?.id ?? null} returning={sign?.returning} onClose={() => setSign(null)} />
      <StopSheet permitId={stopId} onClose={() => setStopId(null)} />
      <ResumeDialog permitId={resumeId} onClose={() => setResumeId(null)} />
      <ExtendDialog permitId={extendId} onClose={() => setExtendId(null)} />
    </div>
  )
}

/** Importar modelo: the list of everything the import will create. */
import { Fragment, type ReactNode } from "react"
import { CheckIcon, EqualNotIcon, LockIcon, OctagonXIcon, PencilLineIcon, PlusIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageSection } from "@/components/shell/Page"
import { StatusBadge, TONE_TEXT } from "@/components/shell/Status"
import { cn } from "@/lib/utils"
import { lineAnswerLabel, optionsOf } from "@/core/form"
import { maxWindowText } from "@/core/windowLimit"
import { normalizar, type PacoteModelo, type Pendencia, type Problema, type ResultadoImportacao } from "@/core/templatePackage"
import { useRegistry } from "@/registry/store"
import type { Condition, FormItem, OptionList, TypeDef } from "@/registry/types"
import { ToggleField } from "../common"
import { itemMeta, KINDS } from "../FormEditor"
import { Excerpt, SourceDisclosure, SuggestedBadge } from "../origem"
import { CAMPO, Novo, goTo, n } from "./shared"

export function IssueList({ tone, rows }: { tone: "stop" | "attention"; rows: { key: string; onde?: string; text: string; sugestao?: string; alvo?: string; origem?: Pendencia["origem"] }[] }) {
  const Icon = tone === "stop" ? OctagonXIcon : TriangleAlertIcon
  return (
    <ul className="flex flex-col divide-y border-y">
      {rows.map((x) => (
        <li key={x.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3">
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_TEXT[tone])} aria-hidden />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="break-words type-body">{x.text}</span>
              {x.sugestao && <span className="break-words type-meta">Sugestão: {x.sugestao}</span>}
              {x.onde && <span className="break-words type-meta">{x.onde}</span>}
              {x.origem && <Excerpt x={x.origem} />}
            </span>
          </span>
          {x.alvo && <Button variant="ghost" className="min-h-11 w-fit shrink-0 self-start max-sm:ml-4 md:min-h-9" onClick={() => goTo(x.alvo!)}>Ver na lista</Button>}
        </li>
      ))}
    </ul>
  )
}

/** Stop marker for an element that has blocking problems. */
function Flag({ id, byAlvo }: { id: string; byAlvo: Map<string, Problema[]> }) {
  const ps = byAlvo.get(id)
  if (!ps?.length) return null
  return <span className={cn("flex items-start gap-1 type-meta font-medium", TONE_TEXT.stop)}><OctagonXIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{ps.map((x) => x.mensagem).join(" · ")}</span>
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="type-section">{title}</h3>
      {children}
    </div>
  )
}

export function Created({ r, p, state, byAlvo, showAll, setShowAll }: {
  r: ResultadoImportacao; p: PacoteModelo; state: ReturnType<typeof useRegistry>["state"]; byAlvo: Map<string, Problema[]>; showAll: boolean; setShowAll: (v: boolean) => void
}) {
  const d = r.previa!
  const v = d.versao
  const lists: OptionList[] = [...state.optionLists, ...d.listasNovas]
  const allRoles: TypeDef[] = [...state.roleTypes, ...d.cargosNovos]
  const items = (v.form?.sections ?? []).flatMap((s) => s.items)
  const slots = v.stages.flatMap((s, i) => s.slots.map((sl) => ({ sl, i })))
  const slotName = (id: string) => { const x = slots.find((s) => s.sl.id === id); return x ? `${x.i + 1}. ${x.sl.meaning ?? "sem significado"}` : "?" }
  const newLoc = new Set(d.tiposDeLocalNovos.map((x) => x.id))
  const newAsset = new Set(d.tiposDeAtivoNovos.map((x) => x.id))
  const newList = new Set(d.listasNovas.map((x) => x.id))
  const newRole = new Set(d.cargosNovos.map((x) => x.id))
  const typeRow = (id: string, pool: TypeDef[], novo: boolean) => (
    <li key={id} className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
      <span className="type-body">{pool.find((x) => x.id === id)?.label ?? id}</span><Novo novo={novo} />
    </li>
  )
  const when = (w: Condition | undefined, lead: string) => {
    if (!w) return null
    const src = items.find((x) => x.id === w.itemId)
    if (!src) return null
    const vals = src.kind === "marcacao"
      ? w.anyOf.map((a) => optionsOf(src, lists, true).find((o) => o.id === a)?.label ?? a)
      : src.kind === "verificacao" ? w.anyOf.map((a) => lineAnswerLabel(src, a, lists))
      : w.anyOf
    const line = src.kind === "verificacao" ? src.lines.find((l) => l.id === w.lineId)?.label : undefined
    return `${lead} “${line ?? src.label}” for ${vals.join(" ou ")}`
  }
  const cond = (i: FormItem) => when(i.showWhen, "Mostrar quando")

  return (
    <PageSection title="O que será criado" action={<ToggleField small label="Mostrar todas as origens" checked={showAll} onChange={setShowAll} />}>
      <div className="flex flex-col gap-8">
        <Group title="Modelo e versão">
          <ul className="flex flex-col divide-y border-y">
            <li className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
              <span className="type-label w-28 shrink-0">Modelo</span>
              <span className="type-body font-medium">{d.modeloNome}</span>
              {d.modeloExistente ? <StatusBadge tone="ok" icon={CheckIcon}>Existe · nova versão</StatusBadge> : <Novo novo />}
            </li>
            <li className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
              <span className="type-label w-28 shrink-0">Versão</span>
              <span className="type-body font-medium">Versão {v.number}</span>
              <StatusBadge tone="attention" icon={PencilLineIcon}>Rascunho</StatusBadge><SuggestedBadge />
            </li>
            <li className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
              <span className="type-label w-28 shrink-0">Nota</span>
              <span className="min-w-0 break-words type-body">{v.note}</span>
            </li>
            <li className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
              <span className="type-label w-28 shrink-0">Janela</span>
              <span className="min-w-0 break-words type-body">{v.maxWindowHours != null ? `Prazo máximo ${maxWindowText(v.maxWindowHours)}` : "Sem prazo máximo"}</span>
            </li>
            <li className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
              <span className="type-label w-28 shrink-0">Equipamento</span>
              <span className="min-w-0 break-words type-body">{v.holdsEquipment ? "Prende o equipamento: uma PT aberta por equipamento" : "Não prende: convive com outra PT aberta no mesmo equipamento"}</span>
              <Flag id="modelo.prende_equipamento" byAlvo={byAlvo} />
            </li>
          </ul>
        </Group>

        <div className="grid gap-8 md:grid-cols-2 md:gap-6">
          <Group title="Tipos de local">
            {v.locationTypeIds.length ? <ul className="flex flex-col divide-y border-y">{v.locationTypeIds.map((id) => typeRow(id, [...state.locationTypes, ...d.tiposDeLocalNovos], newLoc.has(id)))}</ul> : <p className="type-meta">Nenhum</p>}
          </Group>
          <Group title="Tipos de ativo">
            {v.assetTypeIds.length ? <ul className="flex flex-col divide-y border-y">{v.assetTypeIds.map((id) => typeRow(id, [...state.assetTypes, ...d.tiposDeAtivoNovos], newAsset.has(id)))}</ul> : <p className="type-meta">Nenhum</p>}
          </Group>
        </div>

        <Group title="Cargos (assinaturas e itens de pessoa)">
          <ul className="flex flex-col divide-y border-y">
            {[...new Set([...slots.flatMap((s) => s.sl.roleIds), ...items.flatMap((i) => (i.kind === "pessoa" && i.roleId ? [i.roleId] : []))].filter(Boolean))].map((id) => (
              <li key={id} className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 md:min-h-9">
                <span className="type-body">{allRoles.find((x) => x.id === id)?.label ?? id}</span><Novo novo={newRole.has(id)} />
                {newRole.has(id) && <span className={cn("type-meta", TONE_TEXT.attention)}>Ninguém tem este cargo: ninguém assina até alguém recebê-lo em Pessoas</span>}
              </li>
            ))}
            {slots.some((s) => s.sl.roleIds.length === 0) && <li className={cn("flex min-h-11 items-center gap-2 py-1.5 type-body md:min-h-9", TONE_TEXT.attention)}><TriangleAlertIcon className="size-4 shrink-0" aria-hidden />{n(slots.filter((s) => s.sl.roleIds.length === 0).length, "assinatura sem cargo", "assinaturas sem cargo")}: escolha no Fluxo</li>}
          </ul>
        </Group>

        <Group title="Listas de opções">
          {[...new Set(d.listasNovas.map((l) => l.id).concat(items.flatMap(listIdsOf)))].length === 0 ? <p className="type-meta">Nenhuma lista</p> : (
            <ul className="flex flex-col divide-y border-y">
              {[...new Set(d.listasNovas.map((l) => l.id).concat(items.flatMap(listIdsOf)))].map((id) => {
                const l = lists.find((x) => x.id === id)
                if (!l) return null
                return (
                  <li key={id} id={`imp-lista:${normalizar(l.name)}`} tabIndex={-1} className="flex flex-col gap-1 py-2">
                    <span className="flex flex-wrap items-center gap-2"><span className="type-body font-medium">{l.name}</span><Novo novo={newList.has(id)} /></span>
                    {l.items.some((x) => x.active)
                      ? <span className="type-meta break-words">{l.items.filter((x) => x.active).map((x) => x.label).join(" · ")}</span>
                      : <span className={cn("flex items-center gap-1.5 type-meta", TONE_TEXT.attention)}><TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />Sem itens: inclua em Configuração › Catálogos antes de ativar</span>}
                    <Flag id={`lista:${normalizar(l.name)}`} byAlvo={byAlvo} />
                    <SourceDisclosure id={id} />
                  </li>
                )
              })}
            </ul>
          )}
        </Group>

        <Group title={`Etapas (${v.stages.length}), na ordem`}>
          <ol className="flex flex-col gap-4">
            {v.stages.map((st, i) => {
              const secs = (v.form?.sections ?? []).filter((s) => s.stageId === st.id || (s.stageId === undefined && st === v.stages[0]))
              const added = !r.previa?.versao.importSource?.trechos[st.id] && r.pendencias.some((x) => x.alvo === st.id && x.motivo === "etapa_ausente")
              return (
                <li key={st.id} id={`imp-${st.id}`} tabIndex={-1} className={cn("flex flex-col gap-4 rounded-xl p-3 md:p-4", st.locked ? "bg-surface-fixed" : "bg-surface-well")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary font-semibold text-primary-foreground type-meta tabular-nums" aria-hidden>{i + 1}</span>
                    <h4 className="type-title">{st.name}</h4>
                    {st.kind && <span className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span>}
                    {added && <StatusBadge tone="attention" icon={TriangleAlertIcon}>Incluída pelo produto</StatusBadge>}
                  </div>
                  <Flag id={st.id} byAlvo={byAlvo} />
                  <SourceDisclosure id={st.id} />

                  <div className="flex flex-col gap-2 border-t pt-4">
                    <h5 className="type-subtitle">Assinar <span className="type-meta font-normal tabular-nums">{n(st.slots.length, "assinatura", "assinaturas")}</span></h5>
                    <ul className="flex flex-col divide-y">
                      {st.slots.map((sl) => {
                        const roles = sl.roleIds.map((id) => allRoles.find((x) => x.id === id)).filter((x): x is TypeDef => !!x)
                        const asked = d.cargoPedido[sl.id]
                        const rules = v.separation.filter((x) => x.slotA === sl.id || x.slotB === sl.id)
                        return (
                          <li key={sl.id} id={`imp-${sl.id}`} tabIndex={-1} className="flex flex-col gap-1 py-2">
                            <span className="type-body font-medium">{sl.meaning ?? "Sem significado: escrever na revisão"}</span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta">
                              {roles.length ? roles.map((role, k) => (
                                <span key={role.id} className={cn("flex items-center gap-1", newRole.has(role.id) ? TONE_TEXT.attention : TONE_TEXT.ok)}>
                                  {k > 0 && <span className="text-muted-foreground">ou</span>}
                                  {newRole.has(role.id) ? <PlusIcon className="size-3.5" aria-hidden /> : <CheckIcon className="size-3.5" aria-hidden />}{role.label}{newRole.has(role.id) ? " (cargo novo)" : ""}
                                </span>
                              )) : (
                                <span className={cn("flex items-center gap-1", asked ? TONE_TEXT.stop : TONE_TEXT.attention)}>
                                  {asked ? <OctagonXIcon className="size-3.5" aria-hidden /> : <TriangleAlertIcon className="size-3.5" aria-hidden />}{asked ? `“${asked.join(" ou ")}” sem par` : "Sem cargo: escolher na revisão"}
                                </span>
                              )}
                              <span>· {sl.min > 1 ? `${sl.min} assinaturas` : "1 assinatura"}</span>
                              <span>· {sl.required ? "obrigatória" : "opcional"}</span>
                            </span>
                            {sl.requiredWhen && <span className="type-meta">{when(sl.requiredWhen, "Obrigatória só quando")}</span>}
                            {rules.map((x) => (
                              <span key={`${x.slotA}|${x.slotB}`} className="flex items-center gap-1.5 type-meta"><EqualNotIcon className="size-3.5 shrink-0" aria-hidden />Pessoa diferente de {slotName(x.slotA === sl.id ? x.slotB : x.slotA)}{x.locked ? " · fixa" : ""}</span>
                            ))}
                            <Flag id={sl.id} byAlvo={byAlvo} />
                            <SourceDisclosure id={sl.id} />
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-2 border-t pt-4">
                    <h5 className="type-subtitle">Preencher <span className="type-meta font-normal tabular-nums">{n(secs.reduce((k, s) => k + s.items.length, 0), "item", "itens")}</span></h5>
                    {secs.length === 0 && <p className="type-meta">Nada a preencher nesta etapa.</p>}
                    {secs.map((sec) => (
                      <div key={sec.id} id={`imp-${sec.id}`} tabIndex={-1} className="flex flex-col gap-1 pt-3">
                        <h6 className="type-heading">{sec.title}</h6>
                        <Flag id={sec.id} byAlvo={byAlvo} />
                        <SourceDisclosure id={sec.id} />
                        <ul className="flex flex-col divide-y border-y">
                          {sec.items.map((it) => <ItemRow key={it.id} it={it} lists={lists} roles={allRoles} cond={cond(it)} byAlvo={byAlvo} />)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </li>
              )
            })}
          </ol>
        </Group>

        <Group title="Pessoas diferentes">
          {v.separation.length === 0 ? <p className="type-meta">Nenhuma regra</p> : (
            <ul className="flex flex-col divide-y border-y">
              {v.separation.map((x) => (
                <li key={`${x.slotA}|${x.slotB}`} className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 type-body md:min-h-9">
                  <EqualNotIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />{slotName(x.slotA)} ≠ {slotName(x.slotB)}
                  {x.locked && <span className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span>}
                </li>
              ))}
            </ul>
          )}
        </Group>

        {p.campos_do_sistema.length > 0 && (
          <Group title="Não vira item: o sistema já guarda">
            <ul className="flex flex-col divide-y border-y">
              {p.campos_do_sistema.map((c, k) => (
                <li key={k} className="flex flex-col gap-1 py-2">
                  <span className="type-body">{c.rotulo} <span className="type-meta">→ {CAMPO[c.corresponde_a]}</span></span>
                  {showAll ? <Excerpt x={c.origem} className="border-l-2 pl-3" /> : null}
                </li>
              ))}
            </ul>
          </Group>
        )}
      </div>
    </PageSection>
  )
}

/** Lists an item reads: its options' list or its answers' list. */
const listIdsOf = (i: FormItem): string[] => (i.kind === "marcacao" && i.listId ? [i.listId] : i.kind === "verificacao" && i.answerListId ? [i.answerListId] : [])

function ItemRow({ it, lists, roles, cond, byAlvo }: { it: FormItem; lists: OptionList[]; roles: TypeDef[]; cond: string | null; byAlvo: Map<string, Problema[]> }) {
  const K = KINDS[it.kind]
  const text = it.kind === "aviso" ? it.text : it.label
  const sub: { id: string; label: string; meta?: string }[] =
    it.kind === "verificacao" ? it.lines.map((l) => ({ id: l.id, label: l.label, meta: [l.blockOn.length ? `${l.blockOn.map((a) => `“${lineAnswerLabel(it, a, lists)}”`).join(", ")} impede` : "", l.noteOn.length ? `${l.noteOn.map((a) => `“${lineAnswerLabel(it, a, lists)}”`).join(", ")} pede justificativa` : ""].filter(Boolean).join(" · ") }))
    : it.kind === "marcacao" && !it.listId ? it.options.map((o) => ({ id: o.id, label: o.label, ...(o.blocks ? { meta: "impede a etapa" } : {}) }))
    : it.kind === "grupo" ? it.columns.map((c) => ({ id: c.id, label: `Coluna: ${c.label}`, meta: [KINDS[c.kind].title, itemMeta(c, lists), c.required ? "obrigatória" : "opcional"].filter(Boolean).join(" · ") }))
    : []
  return (
    <li id={`imp-${it.id}`} tabIndex={-1} className="flex flex-col gap-1 py-2">
      <span className="flex items-start gap-2">
        <K.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={K.title} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words type-body font-medium">{text}</span>
          <span className="break-words type-meta">{[K.title, itemMeta(it, lists, roles), it.kind === "aviso" ? "" : it.required ? "obrigatório" : "opcional"].filter(Boolean).join(" · ")}</span>
          {cond && <span className="break-words type-meta">{cond}</span>}
        </span>
      </span>
      {sub.length > 0 && (
        <ul className="ml-6 flex flex-col gap-1 border-l pl-3">
          {sub.map((x) => (
            <Fragment key={x.id}>
              <li className="flex flex-col">
                <span className="break-words type-body">{x.label}</span>
                {x.meta && <span className="type-meta">{x.meta}</span>}
                <SourceDisclosure id={x.id} />
              </li>
            </Fragment>
          ))}
        </ul>
      )}
      <Flag id={it.id} byAlvo={byAlvo} />
      <SourceDisclosure id={it.id} className="ml-6" />
    </li>
  )
}

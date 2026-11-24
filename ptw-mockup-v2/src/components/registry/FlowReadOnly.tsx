import { EqualNotIcon, EyeIcon, LockIcon, PenLineIcon, ClipboardListIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { label, useRegistry } from "@/registry/store"
import { rolesText, slotKind } from "@/core/eligibility"
import type { FormSection, SignSlot, Stage, TemplateContent } from "@/registry/types"
import { conditionText, itemMeta, KindIcon, KINDS } from "./FormEditor"
import { TONE_TEXT } from "@/components/shell/Status"

/**
 * The Fluxo of a version nobody can change any more (em uso, arquivada): stages → sections → items →
 * signatures as plain text. No buttons, pickers or switches: a disabled editor looks like a draft
 * that is broken, this looks like a document (DESIGN.md).
 */
export function FlowReadOnly({ tpl }: { tpl: TemplateContent }) {
  const { state } = useRegistry()
  const people = state.people
  const allSections = tpl.form?.sections ?? []
  const inStage = (s: FormSection, id: string) => s.stageId === id || (s.stageId === undefined && id === tpl.stages[0]?.id)
  const ordered = tpl.stages.flatMap((st) => allSections.filter((s) => inStage(s, st.id))).flatMap((s) => s.items)
  const slotLabels = new Map<string, string>()
  tpl.stages.forEach((st, i) => st.slots.forEach((sl) => slotLabels.set(sl.id, `${i + 1}. ${sl.meaning || "sem descrição"}`)))
  const roleLabel = (id: string) => label(state.roleTypes, id)

  const slotText = (sl: SignSlot) => {
    const kind = slotKind(sl)
    const who = kind === "pessoa" ? (people.find((p) => p.id === sl.personId)?.name ?? "pessoa removida") : sl.roleIds.length ? rolesText(sl.roleIds, roleLabel) : "cargo não definido"
    const need = !sl.required ? "opcional" : sl.requiredWhen ? `obrigatória só quando ${conditionText(sl.requiredWhen, ordered, state.optionLists)}` : "obrigatória"
    return [`Assina: ${who}`, kind === "cargo" && sl.min > 1 ? `${sl.min} assinaturas` : "", need].filter(Boolean).join(" · ")
  }

  return (
    <ol className="flex max-w-3xl flex-col gap-4">
      {tpl.stages.map((st: Stage, i) => {
        const sections = allSections.filter((s) => inStage(s, st.id))
        return (
          <li key={st.id}>
            <section aria-label={`Etapa ${i + 1}: ${st.name}`} className={cn("flex flex-col gap-4 rounded-lg p-3 md:p-4", st.locked ? "bg-surface-fixed" : "bg-surface-well")}>
              <header className="flex min-h-9 flex-wrap items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary font-semibold text-primary-foreground type-meta tabular-nums" aria-hidden>{i + 1}</span>
                <h3 className="type-title min-w-0 flex-1 break-words">{st.name}</h3>
                {(st.locked || st.kind) && <span className="flex items-center gap-1 type-meta"><LockIcon className="size-3.5" aria-hidden />Fixa</span>}
              </header>

              {sections.some((s) => s.items.length > 0) && <div className="flex flex-col gap-3 border-t pt-3">
                <h4 className="flex items-center gap-1.5 type-subtitle"><ClipboardListIcon className="size-4 text-muted-foreground" aria-hidden />Preencher</h4>
                {sections.map((s, k) => (
                  <section key={s.id} aria-label={`Seção ${k + 1}: ${s.title}`} className="flex min-w-0 flex-col gap-1 border-l-2 border-border-strong pl-2 sm:pl-3">
                    <span className="type-label tabular-nums">Seção {k + 1} · {s.items.length} {s.items.length === 1 ? "item" : "itens"}</span>
                    <h5 className="break-words text-[0.9375rem] leading-[1.375rem] font-semibold">{s.title.trim() || "Sem título"}</h5>
                    {s.items.length > 0 && (
                      <ul className="flex flex-col divide-y border-t">
                        {s.items.map((item) => {
                          const K = KINDS[item.kind]
                          const text = (item.kind === "aviso" ? item.text : item.label).trim()
                          const meta = [item.kind === "texto" ? (item.long ? "longo" : "curto") : itemMeta(item, state.optionLists, state.roleTypes), item.kind === "aviso" ? "" : item.required ? "obrigatório" : "opcional"].filter(Boolean).join(" · ")
                          return (
                            <li key={item.id} className="flex items-start gap-2 py-2 sm:gap-3">
                              <KindIcon kind={item.kind} />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="break-words type-body font-medium">{text || `${K.title} sem rótulo`}</span>
                                <span className="break-words type-meta"><span className="font-medium text-foreground/80">{K.title}</span>{meta ? ` · ${meta}` : ""}</span>
                                {item.showWhen && <span className="flex items-center gap-1 type-meta"><EyeIcon className="size-3.5 shrink-0" aria-hidden />Mostrar quando {conditionText(item.showWhen, ordered, state.optionLists)}</span>}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </section>
                ))}
              </div>}

              <div className="flex flex-col gap-2 border-t pt-3">
                <h4 className="flex items-center gap-1.5 type-subtitle"><PenLineIcon className="size-4 text-muted-foreground" aria-hidden />Assinar</h4>
                {st.slots.length === 0 && <p className={cn("type-body", TONE_TEXT.stop)}>Nenhuma assinatura.</p>}
                {st.slots.map((sl) => {
                  const rules = tpl.separation.filter((r) => r.slotA === sl.id || r.slotB === sl.id)
                  return (
                    <div key={sl.id} className="flex min-w-0 flex-col gap-1 border-l-2 border-border-strong pl-2 sm:pl-3">
                      <span className="break-words type-body font-medium">{sl.meaning?.trim() || "Sem descrição"}</span>
                      <span className="break-words type-meta">{slotText(sl)}</span>
                      {rules.map((r) => (
                        <span key={`${r.slotA}-${r.slotB}`} className="flex items-center gap-1.5 type-meta">
                          <EqualNotIcon className="size-3.5 shrink-0" aria-hidden />Pessoa diferente de {slotLabels.get(r.slotA === sl.id ? r.slotB : r.slotA)}
                        </span>
                      ))}
                    </div>
                  )
                })}
              </div>
            </section>
          </li>
        )
      })}
    </ol>
  )
}

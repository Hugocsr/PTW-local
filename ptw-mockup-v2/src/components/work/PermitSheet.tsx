import { useMemo } from "react"
import { slotRequired, visibleItems } from "@/core/form"
import { locationPath } from "@/registry/store"
import { PERMIT_STATE_LABEL } from "@/core/permitState"
import type { StageView } from "@/core/permitView"
import { dmHms } from "@/core/time"
import { useBrand } from "@/data/brand"
import { qrPath } from "@/lib/qr"
import type { Permit } from "@/permit/types"
import type { FormSpec, RegistryState } from "@/registry/types"
import { BrandLogo, BrandMark } from "../shell/BrandMark"
import { SheetItem, type SheetCtx } from "./SheetItem"

const STAGE_STATUS = { feita: "Concluída", atual: "Em andamento", futura: "Não iniciada", pulada: "Não realizada" } as const
const css = (s: string) => s.replace(/[\\"]/g, "").replace(/\s+/g, " ")

/**
 * The PT as a paper form (printed only; hidden on screen): the plant's mark, the number and a QR code that
 * opens this PT in the system; the identification; then each stage as a numbered band with its questions
 * as fields and its signatures as boxes. `blank` prints the same form empty, to fill in by hand in the
 * field. The sheet does not follow the PT: its foot says when it was printed and that the system is what
 * authorizes work.
 */
export function PermitSheet({ permit, form, rail, registry, tplName, versionNumber, printedBy, now, url, blank }: {
  permit: Permit; form: FormSpec; rail: StageView[]; registry: RegistryState; tplName: string; versionNumber: number; printedBy: string; now: string; url: string; blank: boolean
}) {
  const brand = useBrand()
  const qr = useMemo(() => qrPath(url), [url])
  const ctx: SheetCtx = { lists: registry.optionLists, people: registry.people }
  const person = (id: string | null | undefined) => registry.people.find((p) => p.id === id)?.name ?? ""
  const role = (id: string) => registry.roleTypes.find((r) => r.id === id)?.label ?? ""
  const path = locationPath(registry.locations, permit.locationId)
  const assets = permit.assetIds.map((id) => registry.assets.find((a) => a.id === id)).filter((a) => !!a)
  const team = Object.entries(permit.team).filter(([, ids]) => ids.length > 0).map(([roleId, ids]) => `${role(roleId)}: ${ids.map(person).filter(Boolean).join(", ")}`)
  const first = rail[0]?.stage.id
  const answers = blank ? {} : permit.answers
  const foot = `${permit.number ?? "Rascunho"} · impresso por ${printedBy} em ${dmHms(now)}`
  return (
    <article className="sheet">
      {/* The number and the page count on every page (the browser draws the page margins). */}
      <style>{`@media print { @page { size: A4; margin: 12mm 12mm 16mm; @bottom-left { content: "${css(foot)}"; font: 7.5pt var(--font-sans, sans-serif); } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt var(--font-sans, sans-serif); } } }`}</style>

      <header className="sheet-head">
        <div className="sheet-brand">
          {brand.logoUrl ? <BrandLogo className="h-[9mm]" /> : <BrandMark className="size-[10mm] rounded-[2mm] text-[10pt] font-semibold" />}
          <div><strong>{brand.name}</strong><span>{registry.units[0]?.name}</span></div>
        </div>
        <div className="sheet-title">
          <span>Permissão de trabalho</span>
          <strong>{permit.number ?? "Rascunho"}</strong>
          <span>Revisão {permit.revision}{blank ? " · folha em branco" : ""}</span>
        </div>
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="sheet-qr" role="img" aria-label="Código para abrir esta PT no sistema" shapeRendering="crispEdges">
          <rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" />
        </svg>
      </header>

      {!blank && permit.holdReason !== null && (
        <p className="sheet-stop">Trabalho parado{permit.holdAt ? ` em ${dmHms(permit.holdAt)}` : ""}: {permit.holdReason}</p>
      )}
      {!blank && permit.revalidation && <p className="sheet-stop">Revalidação de turno em {dmHms(permit.revalidation.at)} · {person(permit.revalidation.personId)} · turno de {dmHms(permit.revalidation.shiftStart)} a {dmHms(permit.revalidation.shiftEnd)} · {permit.revalidation.reason}. Confira o novo aceite no campo.</p>}

      <dl className="sheet-ident">
        <div className="sheet-c4 sheet-main"><dt>Serviço</dt><dd>{permit.scope}</dd></div>
        <div className="sheet-c2"><dt>Local</dt><dd>{path.map((l) => l.name).join(" › ")}{path.at(-1)?.code ? ` (${path.at(-1)!.code})` : ""}</dd></div>
        <div className="sheet-c2"><dt>{assets.length === 1 ? "Ativo" : "Ativos"}</dt><dd>{assets.length ? assets.map((a) => `${a.name} (${a.code})`).join("; ") : "—"}</dd></div>
        <div><dt>Início da janela</dt><dd className="sheet-mono">{dmHms(permit.windowStart)}</dd></div>
        <div><dt>Fim da janela</dt><dd className="sheet-mono">{dmHms(permit.windowEnd)}</dd></div>
        <div><dt>Estado na impressão</dt><dd>{PERMIT_STATE_LABEL[permit.state]}</dd></div>
        <div><dt>Solicitante</dt><dd>{person(permit.authorId) || "—"}</dd></div>
        <div className="sheet-c4"><dt>Modelo</dt><dd>{tplName} · versão {versionNumber}</dd></div>
        {team.length > 0 && <div className="sheet-c4"><dt>Equipe</dt><dd>{team.join(" · ")}</dd></div>}
      </dl>

      {rail.map((view, i) => {
        const { stage } = view
        const sections = form.sections.filter((s) => s.stageId === stage.id || (s.stageId === undefined && stage.id === first))
        // On the filled sheet, a signature that is not asked of this PT is left out; the blank sheet has them all.
        const slots = view.slots.filter((v) => blank || !v.slot.requiredWhen || slotRequired(v.slot, permit.answers))
        return (
          <section key={stage.id} className="sheet-stage">
            <h2 className="sheet-band"><span>{i + 1}</span><span>{stage.name}</span>{!blank && <em>{STAGE_STATUS[view.status]}</em>}</h2>
            {sections.map((s) => {
              const items = blank ? s.items : visibleItems(s, permit.answers)
              return items.length === 0 ? null : (
                <div key={s.id} className="sheet-section">
                  <h3>{s.title}</h3>
                  <div className="sheet-grid">{items.map((item) => <SheetItem key={item.id} item={item} answer={answers[item.id]} ctx={ctx} />)}</div>
                </div>
              )
            })}
            {slots.length > 0 && (
              <div className="sheet-signs">
                {slots.map(({ slot, signed }) => {
                  const who = slot.kind === "pessoa" ? person(slot.personId) : slot.roleIds.map(role).filter(Boolean).join(" ou ")
                  const done = blank ? [] : signed
                  return (
                    <div key={slot.id} className="sheet-sign">
                      <strong>{slot.meaning}</strong>
                      <span className="sheet-sub">{who}</span>
                      {done.length > 0
                        ? done.map((g) => <p key={g.id} className="sheet-signed"><b>{person(g.personId)}</b>{g.representedPersonId && <span>Em nome de {person(g.representedPersonId)} · delegação {g.delegationId}</span>}<span>Assinado no sistema em {dmHms(g.signedAt)} · revisão {g.rev}</span></p>)
                        : <><span className="sheet-line">Nome</span><span className="sheet-line">Assinatura</span><span className="sheet-line">Data e hora</span></>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      <p className="sheet-foot">{blank ? "Folha para preencher à mão. Só a PT no sistema autoriza o trabalho." : "Cópia impressa. O estado válido é o do sistema."}</p>
    </article>
  )
}

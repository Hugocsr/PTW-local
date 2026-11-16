import type { ReactNode } from "react"
import { dateBr, ENERGY_LABEL, formatNumber, lineChoices, optionsOf, type ItemAnswer } from "@/core/form"
import type { ColumnItem, FormItem, OptionList, Person } from "@/registry/types"

/** What a field of the printed sheet needs besides its item: the lists and the people of the register. */
export interface SheetCtx { lists: OptionList[]; people: Person[] }

/** A tick box of the paper form; `on` draws the X (filled sheet). */
export const Box = ({ on = false }: { on?: boolean }) => <span aria-hidden className="sheet-box" data-on={on || undefined} />

const Choices = ({ options, chosen }: { options: { id: string; label: string }[]; chosen: string[] }) => (
  <span className="sheet-choices">
    {options.map((o) => <span key={o.id} className="sheet-choice"><Box on={chosen.includes(o.id)} />{o.label}</span>)}
  </span>
)

const name = (ctx: SheetCtx, id: string | undefined) => ctx.people.find((p) => p.id === id)?.name ?? ""

/** A column's answer as plain text, for the cells of a repeatable group. */
function cellText(col: ColumnItem, a: ItemAnswer | undefined, ctx: SheetCtx): string {
  if (!a) return ""
  if (col.kind === "texto" && a.t === "texto") return a.v
  if (col.kind === "numero" && a.t === "numero") return `${formatNumber(a.v, col.decimals)} ${col.unit}`.trim()
  if (col.kind === "horario" && a.t === "horario") return a.v
  if (col.kind === "marcacao" && a.t === "marcacao") return [...optionsOf(col, ctx.lists, true).filter((o) => a.ids.includes(o.id)).map((o) => o.label), ...(a.other ? [a.other] : [])].join(", ")
  if (col.kind === "verificacao" && a.t === "verificacao") {
    const choices = lineChoices(col, ctx.lists, true)
    return col.lines.map((l) => choices.find((c) => c.id === a.lines[l.id]?.a)?.label).filter(Boolean).join(", ")
  }
  return ""
}

const Table = ({ columns, rows, empty }: { columns: string[]; rows: string[][]; empty: number }) => (
  <table className="sheet-table">
    <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>
      {rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}
      {Array.from({ length: empty }, (_, i) => <tr key={`e${i}`}>{columns.map((c) => <td key={c} className="sheet-empty" />)}</tr>)}
    </tbody>
  </table>
)

/** Kinds that take the whole width of the sheet. */
export const isWide = (item: FormItem) =>
  item.kind === "aviso" || item.kind === "verificacao" || item.kind === "isolamento" || item.kind === "grupo" || (item.kind === "texto" && item.long)
  || (item.kind === "marcacao" && (item.listId !== undefined || item.options.length > 3))

/**
 * One question of the PT as a field of the paper form. With an answer, the field shows it (the chosen
 * option gets the X, the others stay on the sheet, as on paper); without one, or on the blank sheet, the
 * field is the empty space to write in.
 */
export function SheetItem({ item, answer, ctx }: { item: FormItem; answer: ItemAnswer | undefined; ctx: SheetCtx }) {
  if (item.kind === "aviso") return <p className="sheet-note sheet-wide">{item.text || item.label}</p>
  const a = answer
  const body = ((): ReactNode => {
    switch (item.kind) {
      case "texto":
        return <span className={item.long ? "sheet-write sheet-write-long" : "sheet-write"}>{a?.t === "texto" ? a.v : ""}</span>
      case "marcacao": {
        const chosen = a?.t === "marcacao" ? a.ids : []
        const all = optionsOf(item, ctx.lists, chosen.length > 0)
        // A long list already answered: only what was chosen (the list itself is in the system).
        const options = chosen.length > 0 && all.length > 8 ? all.filter((o) => chosen.includes(o.id)) : all
        return <><Choices options={options} chosen={chosen} />{(item.other || (a?.t === "marcacao" && a.other)) && <span className="sheet-inline">Outro: <span className="sheet-write">{a?.t === "marcacao" ? a.other ?? "" : ""}</span></span>}</>
      }
      case "verificacao": {
        const choices = lineChoices(item, ctx.lists, true)
        const lines = a?.t === "verificacao" ? a.lines : {}
        return (
          <table className="sheet-table sheet-check">
            <thead><tr><th />{choices.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
            <tbody>
              {item.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.label}{lines[l.id]?.note && <span className="sheet-sub">{lines[l.id]!.note}</span>}</td>
                  {choices.map((c) => <td key={c.id}><Box on={lines[l.id]?.a === c.id} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
      case "numero":
        return <span className="sheet-inline"><span className="sheet-write sheet-short">{a?.t === "numero" ? formatNumber(a.v, item.decimals) : ""}</span>{item.unit}</span>
      case "horario":
        return <span className="sheet-write sheet-short sheet-mono">{a?.t === "horario" ? a.v : "      :"}</span>
      case "data":
        return <span className="sheet-write sheet-short sheet-mono">{a?.t === "data" ? dateBr(a.v) : "      /      /"}</span>
      case "documento":
        return (
          <span className="sheet-inline">
            Nº <span className="sheet-write">{a?.t === "documento" ? a.code : ""}</span>
            {item.validity && <>Validade <span className="sheet-write sheet-short sheet-mono">{a?.t === "documento" && a.validUntil ? dateBr(a.validUntil) : "      /      /"}</span></>}
          </span>
        )
      case "pessoa":
        return <span className="sheet-write">{a?.t === "pessoa" ? a.ids.map((id) => name(ctx, id)).filter(Boolean).join(", ") : ""}</span>
      case "anexo": {
        const n = a?.t === "anexo" ? a.files.length : 0
        return <span className="sheet-sub">{n > 0 ? `${n} ${n === 1 ? "arquivo anexado" : "arquivos anexados"} no sistema` : "Foto, vídeo ou arquivo: anexar no sistema"}</span>
      }
      case "isolamento": {
        const rows = a?.t === "isolamento" ? a.rows : []
        return <Table columns={["Ponto", "Energia", "Método", "Cadeado / etiqueta", "Energia zero", "Aplicado por"]}
          rows={rows.map((r) => [r.point, r.energy ? ENERGY_LABEL[r.energy] : "", r.method, r.lock, r.zero === "sim" ? "Sim" : r.zero === "nao" ? "Não" : "", name(ctx, r.by)])}
          empty={Math.max(0, Math.max(item.minRows, 3) - rows.length)} />
      }
      case "grupo": {
        const rows = a?.t === "grupo" ? a.rows : []
        return <Table columns={item.columns.map((c) => c.label)} rows={rows.map((r) => item.columns.map((c) => cellText(c, r.answers[c.id], ctx)))}
          empty={Math.max(0, Math.max(item.minRows, 3) - rows.length)} />
      }
    }
  })()
  return (
    <div className={isWide(item) ? "sheet-field sheet-wide" : "sheet-field"}>
      <span className="sheet-label">{item.label}{item.required ? " *" : ""}</span>
      {body}
    </div>
  )
}

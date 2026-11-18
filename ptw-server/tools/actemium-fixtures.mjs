/** Fictional answers for local software tests only; never operational electrical instructions. */
export function fixtureForPermit(item, permit, context) {
  if (item.kind === "isolamento" && !permit.assetIds?.length) throw new Error("O ensaio de isolamento exige um ativo selecionado na PT")
  return fixtureAnswer(item, { ...context, assetId: permit.assetIds[0], windowStart: permit.windowStart, windowEnd: permit.windowEnd })
}

export function fixtureAnswer(item, { personId, assetId, attachmentId, timezone, windowStart, windowEnd }) {
  const local = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)).replace(" ", "T")
  const shift = item.id.startsWith("el_shift_e") ? local(Date.parse(windowEnd) + 60000) : local(Date.parse(windowStart) - 3600000)
  switch (item.kind) {
    case "texto": return { t: "texto", v: "FICTÍCIO — ensaio local Actemium; APR e procedimento para homologação" }
    case "numero": return { t: "numero", v: 0 }
    case "data": return { t: "data", v: shift.slice(0, 10) }
    case "horario": return { t: "horario", v: item.id.startsWith("el_shift_") ? shift.slice(11, 16) : item.seconds ? "10:00:00" : "10:00" }
    case "marcacao": return { t: "marcacao", ids: [item.id === "el_kind" ? "nao_rotineiro" : item.options[0].id] }
    case "pessoa": return { t: "pessoa", ids: [personId] }
    case "isolamento": return { t: "isolamento", rows: [{ id: "p1", point: "FICTÍCIO — ponto 01 do ativo selecionado nesta PT", assetId, energy: "eletrica", method: "Procedimento fictício PROC-ACT-001 rev.02", lock: "FICTICIO-01", zero: "sim", by: personId }] }
    case "verificacao": return { t: "verificacao", lines: Object.fromEntries(item.lines.map((line) => [line.id, { a: item.answers === "confirmo" ? "confirmo" : "sim" }])) }
    case "documento": return { t: "documento", code: "FICTICIO-" + item.id + "-REV02", files: [attachmentId], validUntil: "2028-12-31" }
    case "anexo": return { t: "anexo", files: [attachmentId] }
    case "aviso": return undefined
    default: throw new Error("Tipo não coberto pelo roteiro fictício: " + item.kind)
  }
}

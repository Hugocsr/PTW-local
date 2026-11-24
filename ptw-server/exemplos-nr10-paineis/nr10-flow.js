// Cenário NR-10 · painéis elétricos Actemium no PTW Local. Roda na página do PTW (mesma origem da API).
// window.NR10.setup(opts): áreas, equipamentos, alimentação, cargos da equipe e ativação do modelo.
// window.NR10.flow(opts): uma PT elétrica do rascunho ao encerramento, cada etapa com a pessoa do cargo.
// opts.password: senha de teste (LDAP local); sem ela usa dev-login (ambiente de teste).
(() => {
  const log = []
  const say = (m) => { log.push(m); console.log("[NR10]", m) }
  let csrf = ""
  let who = ""
  async function login(user, opts) {
    const r = await fetch(opts.password ? "/api/v1/session/login" : "/api/v1/session/dev-login", {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify(opts.password ? { login: user, password: opts.password } : { login: user }),
    })
    const b = await r.json()
    if (!r.ok) throw new Error(`login ${user}: ${r.status} ${b.message ?? ""}`)
    csrf = b.csrfToken; who = user
  }
  async function api(method, path, body, extra = {}) {
    const headers = { "x-ptw-csrf": csrf, ...extra }
    if (body !== undefined && !(body instanceof Blob)) headers["content-type"] = "application/json"
    if (method !== "GET" && method !== "PUT" && !headers["idempotency-key"]) headers["idempotency-key"] = crypto.randomUUID()
    const r = await fetch("/api/v1" + path, { method, credentials: "include", headers, body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body) })
    const text = await r.text()
    let json; try { json = JSON.parse(text) } catch { json = text }
    if (!r.ok) throw new Error(`${who} ${method} ${path} → ${r.status} ${json?.code ?? ""} ${json?.message ?? text}`.slice(0, 400))
    return json
  }
  const items = (x) => x.items ?? x

  // ---------- cadastro ----------
  const TPL = "PT elétrica NR-10 — Painéis BT/MT"
  const ELE = "Eletricista autorizado (NR-10)"
  const A = (o) => ({ fabricante: "Actemium", statusOp: "operando", catSap: "E", iwerk: "BR01", ingrp: "ELE", ...o })

  async function setup(opts) {
    log.length = 0
    await login("marina.costa", opts)
    const types = items(await api("GET", "/types"))
    const type = (family, label) => types.find((t) => t.family === family && t.label === label)?.id ?? (() => { throw new Error(`tipo ausente: ${label}`) })()
    const locs = items(await api("GET", "/locations?limit=500"))
    const norte = locs.find((l) => l.code === "PNO")
    const areaType = type("local", "Área")
    const area = async (code, name, attrs) => locs.find((l) => l.code === code) ?? api("POST", "/locations", { parentId: norte.id, typeId: areaType, code, name, attrs })
    const se = await area("PNO-SE01", "Subestação principal SE-01 (13,8 kV)", { tplnr: "BR-PNO-SE01", beber: "07", kostl: "CC-1701" })
    const elc = await area("PNO-ELC02", "Eletrocentro E-02 (sala elétrica da Caldeiraria)", { tplnr: "BR-PNO-ELC02", beber: "07", kostl: "CC-1702" })
    say(`Áreas: ${se.code}, ${elc.code}`)

    const existing = items(await api("GET", "/assets?limit=500"))
    const T = { painel: type("ativo", "Painel / CCM"), mt: type("ativo", "Cubículo de média tensão"), gaveta: type("ativo", "Gaveta de CCM"), trafo: type("ativo", "Transformador de força"), inv: type("ativo", "Painel de inversores"), ret: type("ativo", "Retificador / serviços auxiliares") }
    const made = {}
    const asset = async (key, typeId, code, name, loc, attrs) => {
      made[key] = existing.find((a) => a.code === code) ?? await api("POST", "/assets", { typeId, code, name, locationIds: [loc.id], attrs })
    }
    await asset("qgmt", T.mt, "QGMT-01", "Painel de média tensão PA4 — 13,8 kV", se, A({ equnr: "10003001", modelo: "PA4 · classe 17,5 kV · 1250 A · 31,5 kA · IAC AFLR · LSC2B", nserie: "ACT-PA4-2025-0412", tplnr: "BR-PNO-SE01-QGMT01", kostl: "CC-1701" }))
    await asset("qgmtE", T.mt, "QGMT-01-E1", "Cubículo de entrada — disjuntor a vácuo 1250 A", se, A({ equnr: "10003002", modelo: "PA4 · entrada", tplnr: "BR-PNO-SE01-QGMT01-E1" }))
    await asset("qgmtS", T.mt, "QGMT-01-S1", "Cubículo de saída do TR-01", se, A({ equnr: "10003003", modelo: "PA4 · saída transformador", tplnr: "BR-PNO-SE01-QGMT01-S1" }))
    await asset("tr", T.trafo, "TR-01", "Transformador de força 13,8/0,48 kV — 2.000 kVA", se, { equnr: "10003010", modelo: "Óleo · 2.000 kVA · Dyn1", statusOp: "operando", catSap: "E", tplnr: "BR-PNO-SE01-TR01", kostl: "CC-1701" })
    await asset("qgbt", T.painel, "QGBT-01", "Quadro geral de BT / CDC CM4 — 480 V", se, A({ equnr: "10003020", modelo: "CM4 · 690 V · 4000 A · 65 kA · forma 4b · IEC/TR 61641", nserie: "ACT-CM4-2025-1180", tplnr: "BR-PNO-SE01-QGBT01", kostl: "CC-1701" }))
    await asset("ccm", T.painel, "CCM-02", "CCM inteligente CM4 — 480 V (Caldeiraria)", elc, A({ equnr: "10003030", modelo: "CM4 · CCM extraível · 2500 A · 50 kA · forma 4b", nserie: "ACT-CM4-2025-1203", tplnr: "BR-PNO-ELC02-CCM02", kostl: "CC-1702" }))
    await asset("g2a", T.gaveta, "CCM-02-2A", "Gaveta 2A — partida direta da BP-201 (55 kW)", elc, A({ equnr: "10003031", modelo: "CM4 · gaveta extraível · partida direta", tplnr: "BR-PNO-ELC02-CCM02-2A" }))
    await asset("g3b", T.gaveta, "CCM-02-3B", "Gaveta 3B — soft-starter do agitador", elc, A({ equnr: "10003032", modelo: "CM4 · gaveta extraível · soft-starter", tplnr: "BR-PNO-ELC02-CCM02-3B" }))
    await asset("g4c", T.gaveta, "CCM-02-4C", "Gaveta 4C — reserva equipada", elc, A({ equnr: "10003033", modelo: "CM4 · gaveta extraível", statusOp: "parado", tplnr: "BR-PNO-ELC02-CCM02-4C" }))
    await asset("inv", T.inv, "PINV-01", "Painel de inversores de frequência — bombas de polpa", elc, A({ equnr: "10003040", modelo: "Painel de inversores · 480 V", tplnr: "BR-PNO-ELC02-PINV01", kostl: "CC-1702" }))
    await asset("clp", T.painel, "PCLP-01", "Painel de CLP / remota de I/O da Caldeiraria", elc, A({ equnr: "10003050", modelo: "Painel de CLP · 24 Vcc", tplnr: "BR-PNO-ELC02-PCLP01" }))
    await asset("ret", T.ret, "RET-01", "Retificador e banco de baterias 125 Vcc", elc, A({ equnr: "10003060", modelo: "Retificador 125 Vcc · serviços auxiliares", tplnr: "BR-PNO-ELC02-RET01" }))
    await asset("qdl", T.painel, "QDL-01", "Quadro de distribuição de iluminação", elc, A({ equnr: "10003070", modelo: "Quadro de iluminação · 220/127 V", tplnr: "BR-PNO-ELC02-QDL01" }))
    say(`Equipamentos: ${Object.keys(made).length}`)

    const kinds = items(await api("GET", "/types?family=relacao"))
    const parte = kinds.find((k) => k.systemKey === "parte_de")?.id ?? types.find((t) => t.systemKey === "parte_de").id
    const alimenta = types.find((t) => t.family === "relacao" && t.label === "alimenta").id
    const rels = items(await api("GET", "/asset-relations?limit=500"))
    const rel = async (from, to, kindId) => { if (!rels.some((r) => r.fromId === from.id && r.toId === to.id && r.kindId === kindId)) await api("POST", "/asset-relations", { fromId: from.id, toId: to.id, kindId }) }
    const motor = existing.find((a) => a.code === "M-201")
    for (const k of ["qgmtE", "qgmtS"]) await rel(made[k], made.qgmt, parte)
    for (const k of ["g2a", "g3b", "g4c"]) await rel(made[k], made.ccm, parte)
    await rel(made.qgmtS, made.tr, alimenta); await rel(made.tr, made.qgbt, alimenta)
    for (const k of ["ccm", "inv", "ret", "qdl", "clp"]) await rel(made.qgbt, made[k], alimenta)
    if (motor) await rel(made.g2a, motor, alimenta)
    say("Relações: aninhados (é parte de) e alimentação QGMT → TR-01 → QGBT-01 → CCM-02 → M-201")

    // Equipe autorizada NR-10 na Planta Norte (reciclagem bienal, 10.8.8) e líderes na planta.
    const roles = types.filter((t) => t.family === "cargo")
    const ele = roles.find((r) => r.label === ELE)?.id
    const lider = roles.find((r) => r.label === "Líder de equipe").id
    if (!ele) throw new Error("Importe o modelo antes: o cargo “Eletricista autorizado (NR-10)” vem com ele")
    const people = items(await api("GET", "/people?limit=500"))
    const grant = async (login, add) => {
      const p = people.find((x) => x.login === login)
      const roles = [...p.roles]
      for (const a of add) if (!roles.some((r) => r.roleId === a.roleId && r.scopeLocationId === a.scopeLocationId)) roles.push(a)
      if (roles.length === p.roles.length) return
      await api("PUT", `/people/${p.id}`, { name: p.name, company: p.company, employeeId: p.employeeId, login: p.login, enabled: p.enabled, accountExpires: p.accountExpires, adObjectGuid: p.adObjectGuid, roles }, { "if-match": `"${p.revision}"` })
    }
    await grant("sergio.dias", [{ roleId: ele, scopeLocationId: norte.id, validUntil: "2028-05-31" }])
    await grant("paulo.lima", [{ roleId: ele, scopeLocationId: norte.id, validUntil: "2028-03-15" }, { roleId: lider, scopeLocationId: norte.id, validUntil: "2027-12-31" }])
    await grant("beatriz.souza", [{ roleId: lider, scopeLocationId: norte.id, validUntil: "2027-12-31" }])
    say("Pessoas: Sérgio e Paulo eletricistas autorizados NR-10 na Planta Norte; Paulo e Beatriz líderes na Planta Norte")

    if (opts.activate !== false) {
      const t = items(await api("GET", "/templates")).find((x) => x.name === TPL)
      const v = t.versions.find((x) => x.status === "rascunho")
      if (v) { await api("POST", `/templates/${t.id}/versions/${v.id}/activate`, undefined, { "if-match": `"${v.revision}"` }); say(`Modelo ativado: v${v.number}`) }
    }
    return { log: [...log], se: se.id, elc: elc.id, assets: Object.fromEntries(Object.entries(made).map(([k, a]) => [k, a.id])) }
  }

  // ---------- arquivos de teste (gerados na página) ----------
  async function sha(blob) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join("") }
  function pdf(title, lines) {
    const text = [title, ...lines].map((l, i) => `BT /F1 ${i ? 11 : 15} Tf 50 ${780 - i * 20} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n")
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    let out = "%PDF-1.4\n"; const offs = []
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    return new Blob([out], { type: "application/pdf" })
  }
  async function photo(lines) {
    const c = document.createElement("canvas"); c.width = 960; c.height = 640
    const g = c.getContext("2d")
    g.fillStyle = "#1f2937"; g.fillRect(0, 0, 960, 640)
    g.fillStyle = "#9ca3af"; g.fillRect(80, 90, 360, 460)
    g.fillStyle = "#d81e1e"; g.fillRect(470, 250, 120, 150)
    g.fillStyle = "#facc15"; g.fillRect(620, 220, 230, 200)
    g.fillStyle = "#111827"; g.font = "bold 26px sans-serif"; g.fillText("NÃO LIGUE", 645, 300); g.font = "18px sans-serif"; g.fillText("Equipamento bloqueado", 640, 340)
    g.fillStyle = "#fff"; g.font = "bold 22px sans-serif"
    g.fillText(lines[0], 40, 50); g.font = "20px sans-serif"; lines.slice(1).reverse().forEach((l, i) => g.fillText(l, 40, 610 - i * 28))
    return await new Promise((ok) => c.toBlob(ok, "image/png"))
  }
  async function attach(permitId, itemId, kind, blob, fileName) {
    const h = await sha(blob)
    await api("PUT", `/blobs/${h}`, blob, { "content-type": blob.type })
    return api("POST", `/permits/${permitId}/attachments`, { itemId, kind, sha256: h, fileName })
  }

  // ---------- fluxo da PT ----------
  async function flow(opts) {
    log.length = 0
    await login("rafael.nunes", opts)
    const t = items(await api("GET", "/templates")).find((x) => x.name === TPL)
    const ver = t.versions.find((v) => v.status === "ativa")
    const full = await api("GET", `/templates/${t.id}/versions/${ver.id}`)
    const form = full.form ?? ver.form
    const item = (label) => form.sections.flatMap((s) => s.items).find((i) => (i.label ?? i.title ?? i.text) === label) ?? (() => { throw new Error(`item ausente: ${label}`) })()
    const stages = full.stages ?? ver.stages
    const slot = (meaning) => stages.flatMap((s) => s.slots).find((s) => s.meaning === meaning).id
    const types = items(await api("GET", "/types"))
    const ele = types.find((r) => r.family === "cargo" && r.label === ELE).id
    const locs = items(await api("GET", "/locations?limit=500"))
    const elc = locs.find((l) => l.code === "PNO-ELC02")
    const assets = items(await api("GET", "/assets?limit=500"))
    const as = (code) => assets.find((a) => a.code === code).id
    const people = items(await api("GET", "/people?limit=500"))
    const pid = (login) => people.find((p) => p.login === login).id
    const now = Date.now()
    const iso = (ms) => new Date(ms).toISOString()

    // 1) Solicitação — Rafael (Técnico de manutenção)
    let p = await api("POST", "/permits", {
      templateId: t.id, locationId: elc.id, assetIds: (opts.assets ?? ["CCM-02", "CCM-02-2A"]).map(as),
      team: { [ele]: [pid("sergio.dias"), pid("paulo.lima")] },
      windowStart: iso(now - 5 * 60e3), windowEnd: iso(now + 8 * 3600e3),
      scope: "Troca do contator e do relé de sobrecarga da gaveta 2A (partida direta da BP-201) no CCM-02",
    })
    const id = p.permit?.id ?? p.id
    say(`Rascunho criado por Rafael: ${id}`)
    const answer = (label, value) => api("PUT", `/permits/${id}/answers/${item(label).id}`, value)
    const lines = (label, a) => { const it = item(label); return { t: "verificacao", lines: Object.fromEntries(it.lines.map((l) => [l.id, { a: typeof a === "function" ? a(l) : a }])) } }
    const opt = (label, wanted) => { const it = item(label); return { t: "marcacao", ids: wanted.map((w) => it.options.find((o) => o.label === w).id) } }
    await answer("Descrição detalhada do serviço no painel", { t: "texto", v: "Gaveta 2A do CCM-02 (CM4): substituir contator K1 e relé térmico F2 da partida direta da bomba BP-201. Gaveta em posição extraída, barramento vertical permanece energizado (zona controlada protegida por shutter e anteparo)." })
    await answer("Ordem de serviço (10.11.2)", { t: "documento", code: "OS-2026-118734", files: [] })
    const valid = new Date(now + 180 * 86400e3).toISOString().slice(0, 10)
    for (const [label, title, code] of [["Procedimento de trabalho (10.11.1)", "PT-ELE-PRO-014 rev.3 - Intervenção em gaveta de CCM extraível", "PRO-ELE-014"], ["Análise de risco / APR (10.2.1)", "APR-2026-0457 - Troca de contator CCM-02 gaveta 2A", "APR-2026-0457"], ["Autorizações NR-10 da equipe (10.8.4 / 10.8.8)", "Autorizações NR-10 - Sérgio Dias e Paulo Lima (reciclagem em dia)", "AUT-NR10-0332"]]) {
      const att = await attach(id, item(label).id, "arquivo", pdf(title, ["Documento de TESTE gerado para o ensaio do PTW Local.", "Referência NR-10: " + label]), `${code}.pdf`)
      await answer(label, { t: "documento", code, files: [att.id], validUntil: valid })
    }
    await answer("Condição da instalação no ponto de trabalho", opt("Condição da instalação no ponto de trabalho", ["Desenergizada com partes energizadas na zona controlada"]))
    await answer("Nível de tensão do painel", opt("Nível de tensão do painel", ["Baixa tensão (até 1 kV CA)"]))
    await answer("Riscos adicionais", opt("Riscos adicionais", ["Arco elétrico"]))
    await answer("Antes de enviar", lines("Antes de enviar", (l) => (l.label.startsWith("Em AT") ? "na" : "sim")))
    p = await api("GET", `/permits/${id}`)
    p = await api("POST", `/permits/${id}/submit`, undefined, { "if-match": `"${p.permit.rowVersion}"` })
    say(`Enviada por Rafael: ${p.permit.number} · ${p.permit.state}`)

    const sign = async (meaning) => {
      const cur = await api("GET", `/permits/${id}`)
      const r = await api("POST", `/permits/${id}/signatures`, { id: crypto.randomUUID(), slotId: slot(meaning), rev: cur.permit.revision })
      say(`${who} assinou “${meaning}” → ${r.permit.state}`)
      return r
    }
    // 2) Desenergização 10.5.1 — Sérgio executa, Beatriz confere
    await login("sergio.dias", opts)
    await answer("Dispositivos seccionados e bloqueados", { t: "isolamento", rows: [
      { id: "b1", point: "CCM-02 · gaveta 2A · seccionadora Q1", assetId: as((opts.assets ?? ["CCM-02-2A"]).at(-1)), energy: "eletrica", method: "Gaveta extraída para posição teste/seccionada; Q1 aberta", lock: "Cadeado 0457 + etiqueta Sérgio Dias", zero: "sim", by: pid("sergio.dias") },
      { id: "b2", point: "CCM-02 · gaveta 2A · circuito de comando 220 Vca", assetId: as((opts.assets ?? ["CCM-02-2A"]).at(-1)), energy: "eletrica", method: "Disjuntor de comando F1 aberto", lock: "Cadeado 0458", zero: "sim", by: pid("sergio.dias") },
    ] })
    for (const label of ["a) Seccionamento", "b) Impedimento de reenergização", "c) Ausência de tensão", "d) Aterramento temporário", "e) Proteção da zona controlada", "f) Sinalização"]) await answer(label, lines(label, "sim"))
    await answer("Tensão medida após o seccionamento (maior leitura entre fases e fase-terra)", { t: "numero", v: 0 })
    await sign("Executa a desenergização")
    await login("beatriz.souza", opts)
    await sign("Confere a desenergização")
    if (opts.until === "emissao") return { log: [...log], permitId: id }

    // 3) Emissão — Marina (Supervisora), foto do bloqueio
    await login("marina.costa", opts)
    await answer("Antes de emitir", lines("Antes de emitir", "confirmo"))
    const att = await attach(id, item("Foto do bloqueio e da sinalização").id, "foto", await photo(["FOTO DE TESTE — PTW Local", "CCM-02 gaveta 2A · Q1 aberta", "Cadeado 0457 · etiqueta Sérgio Dias"]), "bloqueio-ccm02-2A.png")
    await answer("Foto do bloqueio e da sinalização", { t: "anexo", files: [att.id] })
    await sign("Emite a PT (responsável autorizado)")

    // 4) Aceite no campo e 5) Entrega — Paulo (Líder)
    await login("paulo.lima", opts)
    await answer("Equipe e ponto de trabalho", lines("Equipe e ponto de trabalho", "sim"))
    await sign("Aceita no campo (líder da equipe)")
    if (opts.until === "campo") return { log: [...log], permitId: id }
    await answer("Antes de entregar", lines("Antes de entregar", "confirmo"))
    await answer("Observações da entrega", { t: "texto", v: "Contator K1 e relé F2 substituídos; teste funcional a vazio feito na posição teste. Gaveta pronta para inserção." })
    await sign("Entrega a área (serviço concluído)")

    // 6) Reenergização 10.5.2 — Joana (Supervisora)
    await login("joana.reis", opts)
    for (const label of ["a) Ferramentas retiradas", "b) Zona controlada liberada", "c) Aterramento removido", "d) Sinalização removida", "e) Religação"]) await answer(label, lines(label, "sim"))
    const end = await sign("Autoriza a reenergização e encerra a PT")
    return { log: [...log], permitId: id, number: end.permit.number, state: end.permit.state }
  }

  // Casos negativos: regras NR-10 que o sistema precisa recusar.
  async function negatives(opts) {
    log.length = 0
    await login("rafael.nunes", opts)
    const t = items(await api("GET", "/templates")).find((x) => x.name === TPL)
    const ver = t.versions.find((v) => v.status === "ativa")
    const full = await api("GET", `/templates/${t.id}/versions/${ver.id}`)
    const form = full.form ?? ver.form
    const item = (label) => form.sections.flatMap((s) => s.items).find((i) => i.label === label)
    const locs = items(await api("GET", "/locations?limit=500")), assets = items(await api("GET", "/assets?limit=500"))
    const now = Date.now(), iso = (ms) => new Date(ms).toISOString()
    const tryIt = async (name, fn) => { try { await fn(); say(`FALHOU ${name}: foi aceito`) } catch (e) { say(`OK ${name}: recusado (${String(e.message).replace(/^.*→ /, "").slice(0, 140)})`) } }
    const types = items(await api("GET", "/types")), people = items(await api("GET", "/people?limit=500"))
    const team = { [types.find((r) => r.family === "cargo" && r.label === ELE).id]: [people.find((x) => x.login === "sergio.dias").id] }
    const longo = await api("POST", "/permits", { templateId: t.id, locationId: locs.find((l) => l.code === "PNO-ELC02").id, assetIds: [assets.find((a) => a.code === "RET-01").id], team, windowStart: iso(now), windowEnd: iso(now + 13 * 3600e3), scope: "Caso negativo: janela de 13 h" })
    const lid = longo.permit?.id ?? longo.id
    const lcur = await api("GET", `/permits/${lid}`)
    await tryIt("enviar com janela acima do prazo de 12 h", () => api("POST", `/permits/${lid}/submit`, undefined, { "if-match": `"${lcur.permit.rowVersion}"` }))
    await api("POST", `/permits/${lid}/discard`, { reason: "Caso de teste negativo" }, { "if-match": `"${lcur.permit.rowVersion}"` }).catch((e) => say(`descartar: ${e.message}`))
    const p = await api("POST", "/permits", { templateId: t.id, locationId: locs.find((l) => l.code === "PNO-ELC02").id, assetIds: [assets.find((a) => a.code === "QDL-01").id], windowStart: iso(now), windowEnd: iso(now + 4 * 3600e3), scope: "Caso negativo: envio sem equipe e sem documentos" })
    const id = p.permit?.id ?? p.id
    await tryIt("sequência 10.5.1 fora de ordem (c antes de a)", async () => { const it = item("c) Ausência de tensão"); await api("PUT", `/permits/${id}/answers/${it.id}`, { t: "verificacao", lines: { [it.lines[0].id]: { a: "sim" } } }) })
    const cur = await api("GET", `/permits/${id}`)
    await tryIt("envio sem equipe NR-10 e sem documentos obrigatórios", () => api("POST", `/permits/${id}/submit`, undefined, { "if-match": `"${cur.permit.rowVersion}"` }))
    await api("POST", `/permits/${id}/discard`, { reason: "Caso de teste negativo" }, { "if-match": `"${cur.permit.rowVersion}"` }).catch((e) => say(`descartar: ${e.message}`))
    return [...log]
  }

  window.NR10 = { setup, flow, negatives, login, api }
})()

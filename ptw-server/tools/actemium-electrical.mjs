/** Local training fixtures. Technical procedures and their revisions must be approved by engineering/SST. */
export function electricalContent(content, baseline) {
  const form = content.form ??= { sections: [] }
  const stage = (kind) => content.stages.find((s) => s.kind === kind)?.id
  const preparation = content.stages.find((s) => !s.kind)?.id
  if (!preparation) throw new Error("Modelo de origem precisa da etapa Preparação")
  const text = (id, label) => ({ id, label, kind: "texto", required: true, long: true })
  const doc = (id, label) => ({ id, label, kind: "documento", required: true, attach: true, validity: true })
  const check = (id, label) => ({ id, label, kind: "verificacao", required: true, answers: "sim_nao", lines: [{ id: "ok", label, blockOn: ["nao"], noteOn: [] }] })
  const tag = baseline ? "NR-10 vigente" : "NR-10 2027"
  const request = [
    { id: "el_kind", kind: "marcacao", label: "Classificação do serviço", required: true, multiple: false, other: false,
      options: [{ id: "rotineiro", label: "Rotineiro — procedimento aprovado" }, { id: "nao_rotineiro", label: "Não rotineiro — PT precedida de análise de riscos" }] },
    { id: "el_service_date", kind: "data", label: "Data do serviço", required: true, notBeforeToday: false },
    doc("el_procedure", "Procedimento de intervenção e manobras — código, revisão e aprovação técnica"),
    doc("el_risk", "Análise de riscos — revisão e medidas de prevenção"),
    doc("el_auth", "Relação de envolvidos e autorizações — escopo, capacitação e validade"),
    text("el_measures", "Medidas de prevenção definidas na análise de riscos"),
    text("el_impediments", "Condições impeditivas e critérios para interromper o trabalho"),
    text("el_emergency", "Plano de emergência, resgate, primeiros socorros e comunicação"),
    check("el_team", "Relação anexa corresponde a todos os envolvidos e suas autorizações para esta atividade"),
    check("el_supervisor", "Supervisor da equipe indicado e responsabilidades conferidas"),
  ]
  if (!baseline) for (const [id, label, kind] of [
    ["el_shift_sd", "Data do início do turno", "data"], ["el_shift_st", "Hora do início do turno", "horario"],
    ["el_shift_ed", "Data do fim do turno", "data"], ["el_shift_et", "Hora do fim do turno", "horario"],
  ]) request.push({ id, label, kind, required: true, ...(kind === "data" ? { notBeforeToday: false } : { seconds: false }) })
  form.sections.push({ id: "el_request", title: `${tag} · documentação e planejamento`, stageId: stage("solicitacao"), items: request })
  const riskLines = [
    ["local", "Local, entorno, circulação, isolamento e sinalização avaliados"],
    ["weather", "Condições meteorológicas e influências externas avaliadas"],
    ["simultaneous", "Trabalhos simultâneos e fontes de energia de outras equipes avaliados"],
    ["protection", "EPC, EPI e instrumentos selecionados, inspecionados e adequados ao serviço"],
    ["emergency", "Resgate, primeiros socorros, comunicação e supervisão disponíveis"],
    ["unforeseen", "Avaliação no local não identificou situações imprevistas ou impeditivas sem controle"],
  ]
  if (!baseline) riskLines.push(
    ["door", "Condição da porta atende ao procedimento e às exceções técnicas de intervenção"],
    ["voltage", "Sinalização do nível de tensão conferida"],
    ["shock", "Advertência de choque elétrico conferida"],
    ["arc", "Advertência de arco elétrico conferida"],
    ["access", "Restrição de acesso por pessoas não autorizadas conferida"],
    ["arc_study", "Aplicabilidade do estudo de energia incidente e das proteções contra arco avaliada pela engenharia"],
  )
  else riskLines.push(["signage", "Identificação de circuitos, bloqueios, advertências e restrição de acesso conferidas"])
  form.sections.push({ id: "el_field", title: `${tag} · avaliação no local`, stageId: stage("emissao"), items: riskLines.map(([id, label]) => check(`el_field_${id}`, label)) })
  if (!baseline) form.sections.at(-1).items.push(doc("el_arc_basis", "Referência técnica para proteção contra arco — estudo aplicável ou justificativa técnica de não aplicabilidade"))
  const isolation = baseline ? [
    "Seccionamento conforme procedimento aprovado",
    "Impedimento de reenergização aplicado",
    "Ausência de tensão constatada",
    "Aterramento temporário e equipotencialização instalados conforme procedimento",
    "Elementos energizados na zona controlada protegidos",
    "Sinalização de impedimento de reenergização instalada",
  ] : [
    "Seccionamento ou desligamento conforme procedimento aprovado",
    "Ausência de tensão constatada antes do impedimento de reenergização",
    "Impedimento de reenergização aplicado",
    "Ausência de tensão verificada para o aterramento; instalação do aterramento temporário e equipotencialização registrada conforme procedimento",
    "Elementos energizados protegidos e proteções contra efeitos do arco elétrico conferidas",
    "Sinalização de impedimento de reenergização instalada",
    "Área de trabalho delimitada e sinalizada",
  ]
  const restoration = [
    "Autorização do responsável para iniciar a reenergização registrada",
    ...(!baseline ? ["Obstáculos de delimitação e sinalização do espaço seguro retirados conforme procedimento"] : []),
    "Ferramentas, utensílios e equipamentos retirados",
    "Trabalhadores não envolvidos na reenergização retirados das imediações",
    ...(baseline ? ["Aterramento temporário, equipotencialização e proteções adicionais removidos conforme procedimento"]
      : ["Aterramento temporário e equipotencialização removidos conforme procedimento", "Proteções dos elementos energizados nas imediações retiradas conforme procedimento"]),
    "Sinalização de impedimento de reenergização removida",
    "Desbloqueio e religação executados pelo responsável autorizado conforme procedimento",
  ]
  const sequence = (prefix, labels) => labels.map((label, i) => check(`${prefix}_${i + 1}`, `${i + 1}. ${label}`))
  const isoItems = sequence("el_iso", isolation), restoreItems = sequence("el_return", restoration)
  form.sections.push({ id: "el_isolation", title: `${tag} · sequência do procedimento de desenergização`, stageId: preparation, items: [
    { id: "el_iso_notice", kind: "aviso", label: "Procedimento aplicável", required: false,
      text: "Registre a execução na ordem do procedimento técnico aprovado e identificado na Solicitação. Peculiaridades e alternativas exigem justificativa técnica previamente formalizada e revisão do modelo." },
    { id: "el_points", kind: "isolamento", label: "Pontos de isolamento e bloqueios identificados", required: true, minRows: 1 }, ...isoItems,
  ] })
  form.sections.push({ id: "el_delivery", title: "Conclusão do serviço e entrega da área", stageId: stage("entrega"), items: [
    check("el_finished", "Serviço concluído, pendências registradas e área entregue ao responsável"),
    text("el_pending", "Condição final e pendências — informar expressamente quando não houver"),
  ] })
  form.sections.push({ id: "el_restoration", title: `${tag} · autorização e registro da reenergização`, stageId: stage("aceite_area"), items: [
    { id: "el_operator", kind: "pessoa", label: "Responsável autorizado pelas manobras", required: true, multiple: false,
      roleId: content.stages.find((s) => !s.kind).slots[0].roleIds[0], mustBeEligible: true }, ...restoreItems,
  ] })
  form.electrical = { standard: baseline ? "vigente2019" : "preparacao2027", procedure: "el_procedure", riskAssessment: "el_risk", authorizations: "el_auth", workKind: "el_kind",
    isolation: isoItems.map((i) => i.id), restoration: restoreItems.map((i) => i.id),
    ...(!baseline ? { shift: { startDate: "el_shift_sd", startTime: "el_shift_st", endDate: "el_shift_ed", endTime: "el_shift_et" } } : {}) }
  content.note = `${tag}; cenário fictício Actemium. Procedimento versionado e validação de engenharia/SST obrigatórios antes de uso operacional. Modelo 2027 antecipa vigência em 01/06/2027.`
  return content
}

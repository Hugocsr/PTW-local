/**
 * Report in Portuguese (CLI and the import screen).
 */
import type { FormItemKind } from "@/registry/types"
import { KIND_WORD } from "./import.ts"
import type { Casamento, ResultadoImportacao } from "./types.ts"

export function relatorio(r: ResultadoImportacao): string {
  const out: string[] = []
  const erros = r.problemas.filter((p) => p.nivel === "erro")
  const avisos = r.problemas.filter((p) => p.nivel === "aviso")
  if (r.resumo) {
    const k = r.resumo.itens
    const itens = (Object.keys(k) as FormItemKind[]).filter((x) => k[x]).map((x) => `${k[x]} ${KIND_WORD[x]}`).join(", ") || "nenhum"
    out.push(`Modelo: ${r.resolucao.modelo?.nome ?? "?"} (${r.resolucao.modelo?.situacao === "nova_versao" ? `nova versão ${r.resolucao.modelo.versao} de um modelo existente` : "modelo novo"})`)
    out.push(`Etapas: ${r.resumo.etapas} · Assinaturas: ${r.resumo.assinaturas} · Separações: ${r.resumo.separacoes} · Seções: ${r.resumo.secoes}`)
    out.push(`Itens: ${itens} · Linhas de verificação: ${r.resumo.linhas} · Campos do sistema: ${r.resumo.camposDoSistema}`)
    out.push(`Regras do modelo: ${r.resumo.prendeEquipamento ? "prende o equipamento (uma PT aberta por equipamento)" : "não prende o equipamento (convive com outra PT aberta)"} · prazo máximo da janela: ${r.resumo.prazoMaximoHoras != null ? `${r.resumo.prazoMaximoHoras} h` : "sem limite"}`)
  }
  const nomes = (t: string, cs: Casamento[]) => cs.length && out.push(`${t}: ${cs.map((c) => `${c.nome} (${{ encontrado: "encontrado", criar: "será criado", sem_par: "SEM PAR", nao_conferido: "não conferido" }[c.situacao]})`).join("; ")}`)
  nomes("Cargos", r.resolucao.cargos)
  nomes("Tipos de local", r.resolucao.tiposDeLocal)
  nomes("Tipos de ativo", r.resolucao.tiposDeAtivo)
  nomes("Listas", r.resolucao.listas)
  if (erros.length) { out.push("", `Erros (${erros.length}):`); for (const p of erros) out.push(`  ✗ ${p.onde}: ${p.mensagem}`) }
  if (avisos.length) { out.push("", `Avisos (${avisos.length}):`); for (const p of avisos) out.push(`  ! ${p.onde}: ${p.mensagem}`) }
  if (r.pendencias.length) { out.push("", `Pendências para a revisão (${r.pendencias.length}):`); for (const p of r.pendencias) out.push(`  ? ${p.onde ? `${p.onde}: ` : ""}${p.descricao}${p.sugestao ? ` (sugestão: ${p.sugestao})` : ""}`) }
  out.push("", erros.length ? "Resultado: o pacote tem erros e não pode ser importado." : "Resultado: pacote válido. Importe no app como rascunho; uma pessoa revisa e ativa.")
  return out.join("\n")
}

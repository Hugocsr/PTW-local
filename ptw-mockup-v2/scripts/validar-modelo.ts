/**
 * Valida um pacote "ptw.modelo/1" e imprime o relatório em português.
 *
 *   node scripts/validar-modelo.ts <arquivo.ptw-modelo.json> [--cadastro <cadastro.json> | --cadastro-exemplo] [--json]
 *   node scripts/validar-modelo.ts --esquema <saida.schema.json>     (grava o JSON Schema)
 *
 * Node ≥ 22.18 roda TypeScript direto (sem tsx). Sem cadastro, os nomes (cargos, tipos, listas) não
 * são conferidos; todo o resto é. Código de saída 1 quando há erro.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { esquemaJson, importarModelo, lerPacote, relatorio, validarPacote, type Cadastro } from "../src/core/templatePackage.ts"

const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1] }

if (args.includes("--esquema")) {
  const out = opt("--esquema")
  if (!out) { console.error("Informe o arquivo de saída: --esquema <arquivo>"); process.exit(2) }
  writeFileSync(out, esquemaJson())
  console.log(`Esquema gravado em ${out}`)
  process.exit(0)
}

const file = args.find((a, i) => !a.startsWith("--") && !["--cadastro"].includes(args[i - 1]))
if (!file) {
  console.error("Uso: node scripts/validar-modelo.ts <arquivo.json> [--cadastro <cadastro.json> | --cadastro-exemplo] [--json]")
  process.exit(2)
}

let raw: string
try { raw = readFileSync(file, "utf8") } catch { console.error(`Não foi possível ler ${file}`); process.exit(2) }
const { pacote, erro } = lerPacote(raw)
if (erro) { console.error(erro); process.exit(1) }

let cadastro: Cadastro | undefined
if (args.includes("--cadastro-exemplo")) {
  cadastro = (await import("../src/registry/seed.ts")).seed
} else if (opt("--cadastro")) {
  const c = lerPacote(readFileSync(opt("--cadastro")!, "utf8"))
  if (c.erro) { console.error(`Cadastro: ${c.erro}`); process.exit(2) }
  const x = c.pacote as Partial<Cadastro>
  cadastro = { roleTypes: x.roleTypes ?? [], locationTypes: x.locationTypes ?? [], assetTypes: x.assetTypes ?? [], optionLists: x.optionLists ?? [], templates: x.templates ?? [] }
}

const agora = new Date().toISOString()
const r = cadastro ? importarModelo(pacote, cadastro, { agora }) : validarPacote(pacote, undefined, agora)
if (args.includes("--json")) console.log(JSON.stringify({ problemas: r.problemas, pendencias: r.pendencias, resolucao: r.resolucao, resumo: r.resumo }, null, 2))
else {
  console.log(`Arquivo: ${file}${cadastro ? "" : " (sem cadastro: nomes não conferidos)"}\n`)
  console.log(relatorio(r))
}
process.exit(r.problemas.some((p) => p.nivel === "erro") ? 1 : 0)

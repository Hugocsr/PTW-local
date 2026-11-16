// Atualiza o pacote estático de carga a partir dos exemplos usados pelos testes do app.
// Rode no host, na raiz da API: node scripts/export-seed.mjs (Node 22.15+).
import { registerHooks } from "node:module"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, "../../../ptw-mockup-v2/src")
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) specifier = pathToFileURL(resolve(source, specifier.slice(2))).href
  if (specifier.startsWith(".") || specifier.startsWith("file:")) {
    const url = new URL(specifier, context.parentURL)
    if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts")) return next(url.href + ".ts", context)
  }
  return next(specifier, context)
} })
const { seed } = await import(pathToFileURL(resolve(source, "registry/seed.ts")).href)
const dest = resolve(here, "../seed/dados")
mkdirSync(dest, { recursive: true })
writeFileSync(resolve(dest, "exemplo.json"), JSON.stringify(seed, null, 2) + "\n")
console.log("Pacote de carga atualizado: seed/dados/exemplo.json")

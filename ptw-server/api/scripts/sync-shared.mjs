// Copia, sem mudar uma linha, o núcleo de importação/exportação de modelos do app para src/shared/
// (mesma árvore de pastas; o alias "@/" do tsconfig aponta para src/shared). O Docker da API só
// enxerga ptw-server/api, então a cópia é versionada; test/templates.test.ts confere que ela é
// idêntica ao app (a menos da primeira linha, "@ts-nocheck": o app não usa noUncheckedIndexedAccess). Uso: node scripts/sync-shared.mjs [--check]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const appSrc = resolve(here, "../../../ptw-mockup-v2/src")
const dest = resolve(here, "../src/shared")
const banner = (f) => `// @ts-nocheck — cópia de ptw-mockup-v2/src/${f}; não edite (node scripts/sync-shared.mjs)
`
const copy = (f) => banner(f) + readFileSync(join(appSrc, f), "utf8")
const roots = ["core/templatePackage.ts"]

const find = (base) => [base, base + ".ts", base + ".tsx", join(base, "index.ts")].find((p) => existsSync(p) && /\.tsx?$/.test(p))
const seen = new Set()
const queue = [...roots]
while (queue.length) {
  const rel = queue.pop()
  if (seen.has(rel)) continue
  seen.add(rel)
  const text = readFileSync(join(appSrc, rel), "utf8")
  for (const m of text.matchAll(/(?:from|import)\s+"([^"]+)"/g)) {
    const spec = m[1]
    let abs
    if (spec.startsWith("@/")) abs = join(appSrc, spec.slice(2))
    else if (spec.startsWith(".")) abs = resolve(appSrc, dirname(rel), spec)
    else continue
    const f = find(abs)
    if (!f) throw new Error(`${rel}: não achei ${spec}`)
    queue.push(relative(appSrc, f).replaceAll("\\", "/"))
  }
}
const files = [...seen].sort()
if (process.argv.includes("--check")) {
  const lf = (text) => text.replaceAll("\r\n", "\n")
  const bad = files.filter((f) => !existsSync(join(dest, f)) || lf(readFileSync(join(dest, f), "utf8")) !== lf(copy(f)))
  if (bad.length) { console.error("Fora de sincronia com o app:", bad.join(", ")); process.exit(1) }
  console.log(`${files.length} arquivos iguais ao app`)
} else {
  for (const f of files) { mkdirSync(dirname(join(dest, f)), { recursive: true }); writeFileSync(join(dest, f), copy(f)) }
  console.log(`${files.length} arquivos copiados para src/shared:\n  ${files.join("\n  ")}`)
}

// TypeScript preserva os aliases do núcleo compartilhado; Node ESM exige caminhos e extensões.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist")
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { visit(path); continue }
    if (!entry.name.endsWith(".js")) continue
    const original = readFileSync(path, "utf8")
    const result = original.replace(/(\bfrom\s*|\bimport\s*)(["'])([^"']+)\2/g, (match, prefix, quote, spec) => {
      if (!spec.startsWith("@/") && !spec.startsWith(".")) return match
      const target = spec.startsWith("@/") ? join(dist, "shared", spec.slice(2)) : resolve(dirname(path), spec)
      const resolved = existsSync(target + ".js") ? target + ".js" : target
      if (!existsSync(resolved)) throw new Error(`Import ausente: ${path} → ${spec}`)
      let output = relative(dirname(path), resolved).replaceAll("\\", "/")
      if (!output.startsWith(".")) output = "./" + output
      return prefix + quote + output + quote
    })
    if (result !== original) writeFileSync(path, result)
  }
}
visit(dist)

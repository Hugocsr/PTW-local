import { describe, expect, it } from "vitest"
import { formProblem } from "@/core/formRules"
import { signatureIssues } from "@/core/templateChecks"
import { activationDenied } from "@/core/templateVersions"
import { buildCelulose } from "./index"
import { demoTemplates } from "./modelosDemo"

const R = buildCelulose().registry

describe("modelos de demonstração (simples · média · complexa)", () => {
  it.each(demoTemplates.map((t) => [t.name, t] as const))("%s é válido para ativar e está no cadastro", (_name, t) => {
    const v = t.versions[0]
    expect(R.templates.some((x) => x.id === t.id)).toBe(true)
    expect(formProblem(v.form)).toBeNull()
    expect(activationDenied(v, R.optionLists)).toBeNull()
    expect(signatureIssues(v, R, "2026-11-10")).toEqual([])
  })
  it("a complexidade cresce: etapas, itens e assinaturas", () => {
    const size = (t: (typeof demoTemplates)[number]) => {
      const v = t.versions[0]
      return [v.stages.length, (v.form?.sections ?? []).flatMap((s) => s.items).length, v.stages.flatMap((s) => s.slots).length]
    }
    const [s, m, c] = demoTemplates.map(size)
    for (let i = 0; i < 3; i++) { expect(m[i]).toBeGreaterThanOrEqual(s[i]); expect(c[i]).toBeGreaterThan(m[i]) }
  })
})

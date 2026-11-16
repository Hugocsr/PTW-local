import { describe, expect, it } from "vitest"
import { seed } from "@/registry/seed"
import type { PermitTemplate } from "@/registry/types"
import { exportarModelo, importarModelo, lerPacote, validarPacote } from "./templatePackage"

const AGORA = "2026-11-09T10:00:00-03:00"
const erros = (r: { problemas: { nivel: string }[] }) => r.problemas.filter((p) => p.nivel === "erro")
const vazio: PermitTemplate[] = []

/** The JSON tab: text copied from one model is pasted into "Importar modelo". */
describe("modelo exportado (aba JSON) → importado", () => {
  for (const tpl of seed.templates) {
    for (const ver of tpl.versions) {
      it(`${tpl.name} v${ver.number}: o texto copiado é lido e importa sem erro`, () => {
        const texto = JSON.stringify(exportarModelo(tpl, seed, { agora: AGORA, versaoId: ver.id }), null, 2)
        const { pacote, erro } = lerPacote(texto)
        expect(erro).toBeNull()
        expect(erros(validarPacote(pacote, seed, AGORA))).toEqual([])
        const novo = importarModelo(pacote, { ...seed, templates: vazio }, { agora: AGORA })
        expect(erros(novo)).toEqual([])
        expect(novo.rascunho!.modeloExistente).toBe(false)
        const mesmo = importarModelo(pacote, seed, { agora: AGORA })
        expect(erros(mesmo)).toEqual([])
        expect(mesmo.rascunho!.modeloExistente).toBe(true)
        expect(mesmo.rascunho!.versao.status).toBe("rascunho")
      })
    }
  }
})

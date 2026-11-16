// @ts-nocheck — cópia de ptw-mockup-v2/src/core/templatePackage/apply.ts; não edite (node scripts/sync-shared.mjs)
/**
 * What a confirmed import creates in the registry, and the totals a person confirms first.
 */
import type { RegistryState, TemplateVersion } from "@/registry/types"
import type { Rascunho } from "./types.ts"

/**
 * Creates what a confirmed import builds, in one step: the new location and asset types and the new
 * lists first, then the model (or a new version of the existing one). The version stays a draft;
 * nothing is activated. A type or list that meanwhile exists with the same id is not duplicated.
 */
export function aplicarImportacao(state: RegistryState, r: Rascunho): RegistryState {
  const add = <T extends { id: string }>(list: T[], extra: T[]) => [...list, ...extra.filter((x) => !list.some((y) => y.id === x.id))]
  const versao: TemplateVersion = { ...structuredClone(r.versao), status: "rascunho", activatedAt: null }
  const existing = state.templates.find((t) => t.id === r.modeloId)
  const templates = existing
    ? state.templates.map((t) => (t.id === r.modeloId ? { ...t, versions: [...t.versions, { ...versao, number: Math.max(0, ...t.versions.map((v) => v.number)) + 1 }] } : t))
    : [...state.templates, { id: r.modeloId, name: r.modeloNome, retentionClass: "pt" as const, revision: 1, updatedAt: versao.createdAt, versions: [versao] }]
  return {
    ...state,
    roleTypes: add(state.roleTypes, r.cargosNovos),
    locationTypes: add(state.locationTypes, r.tiposDeLocalNovos),
    assetTypes: add(state.assetTypes, r.tiposDeAtivoNovos),
    optionLists: add(state.optionLists, r.listasNovas),
    templates,
  }
}

/** Totals a person confirms before the import creates anything. */
export function totaisDaImportacao(r: Rascunho) {
  const sections = r.versao.form?.sections ?? []
  return {
    versao: r.versao.number,
    etapas: r.versao.stages.length,
    assinaturas: r.versao.stages.reduce((k, s) => k + s.slots.length, 0),
    secoes: sections.length,
    itens: sections.reduce((k, s) => k + s.items.length, 0),
    listasNovas: r.listasNovas.length,
    tiposNovos: r.tiposDeLocalNovos.length + r.tiposDeAtivoNovos.length,
    cargosNovos: r.cargosNovos.length,
    separacoes: r.versao.separation.length,
  }
}

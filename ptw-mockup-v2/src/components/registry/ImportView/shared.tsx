/** Importar modelo: labels and small formatters shared by the steps. */
import { CheckIcon, PlusIcon } from "lucide-react"
import { StatusBadge } from "@/components/shell/Status"
import { type CampoDoSistema } from "@/core/templatePackage"

/*
 * "Importar modelo": reads a ptw.modelo/1 package and shows EVERYTHING it would create before
 * anything is created. Nothing is written until "Criar rascunho" is confirmed; the version is a
 * draft marked "sugerida" and is never activated here.
 */

export const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
export const CAMPO: Record<CampoDoSistema, string> = {
  numero_pt: "Número da PT", local: "Local", ativos: "Ativos", data: "Data", janela: "Janela de trabalho", equipe: "Equipe", empresa: "Empresa", lider: "Líder", escopo: "Escopo do serviço",
}

/** Exists in the plant (ok + check) or will be created by the import (pending + plus). */
export function Novo({ novo }: { novo: boolean }) {
  return novo ? <StatusBadge tone="pending" icon={PlusIcon}>Novo</StatusBadge> : <StatusBadge tone="ok" icon={CheckIcon}>Existe</StatusBadge>
}

/** Scrolls to an element of the list and opens its origin. */
export function goTo(alvo: string) {
  const el = document.getElementById(`imp-${alvo}`)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.querySelector("details")?.setAttribute("open", "")
  el.focus({ preventScroll: true })
}

/** The package's "gerado_em" as written (the generator's clock): dd/mm/aaaa, with hh:mm when present. */
export const packageDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ""}` : v
}
/** A language tag in words ("pt-BR" → "Português (Brasil)"); the tag itself when unknown. */
export const languageName = (tag: string) => {
  try {
    const n = new Intl.DisplayNames(["pt-BR"], { type: "language" }).of(tag)
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : tag
  } catch { return tag }
}

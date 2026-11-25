import { useState } from "react"
import { useRegistry } from "@/registry/store"
import type { OptionList } from "@/registry/types"
import { FormDialog, TextField } from "../forms"

/** Database size of a list name: 1–120, unique ignoring case. */
const MAX_NAME = 120

/** "Nova lista" (list = null) or "Renomear lista": the name is asked first, so no unnamed list is left behind. */
export function ListNameDialog({ list, onClose, onSave }: { list: OptionList | null; onClose: () => void; onSave: (name: string) => void }) {
  const { state } = useRegistry()
  const [name, setName] = useState(list?.name ?? "")
  const v = name.trim()
  const problem = !v ? null : v.length > MAX_NAME ? `No máximo ${MAX_NAME} caracteres.`
    : state.optionLists.some((l) => l.id !== list?.id && l.name.trim().toLowerCase() === v.toLowerCase()) ? "Já existe uma lista com este nome." : null
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={list ? "Renomear lista" : "Nova lista"} description="Lista de opções para perguntas de marcação e verificação."
      valid={!!v && !problem} missing={v ? [] : ["Nome"]} submitLabel={list ? "Salvar" : "Criar lista"} onSubmit={() => onSave(v)}>
      <TextField label="Nome" value={name} onChange={setName} placeholder="Ex.: EPI" error={problem ?? undefined} />
    </FormDialog>
  )
}

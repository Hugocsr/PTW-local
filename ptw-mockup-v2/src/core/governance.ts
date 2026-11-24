export interface PersonGroup {
  id: string
  name: string
  description: string
  active: boolean
  memberIds: string[]
  revision: number
}

export type GroupInput = Omit<PersonGroup, "revision">

/** Groups organise people; they never grant technical roles or session privileges. */
export function groupProblems(g: GroupInput): string[] {
  const errors: string[] = []
  if (!g.name.trim() || g.name.trim().length > 80) errors.push("Informe um nome com até 80 caracteres.")
  if (g.description.length > 500) errors.push("A descrição aceita até 500 caracteres.")
  if (g.memberIds.length > 1000) errors.push("Um grupo aceita até mil pessoas.")
  if (new Set(g.memberIds).size !== g.memberIds.length) errors.push("A mesma pessoa não pode aparecer duas vezes.")
  return errors
}

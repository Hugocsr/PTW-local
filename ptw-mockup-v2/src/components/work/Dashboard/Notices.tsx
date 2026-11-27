import { useMemo } from "react"
import { CircleAlertIcon, PenLineIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { personalNotices, rolesView } from "@/core/rolesView"
import { cn } from "@/lib/utils"
import { usePermits } from "@/permit/store"
import { label, useRegistry } from "@/registry/store"
import { useSim } from "@/sim/SimProvider"
import { TONE_BLOCK, TONE_TEXT } from "../../shell/Status"
import { navigate } from "../nav"

/** What stops me from signing at all (cargo vencido, cadastro em revisão, conta expirada): above everything. */
export function Bloqueios() {
  const { state } = useRegistry()
  const sim = useSim()
  const me = state.people.find((p) => p.id === sim.personId)
  const notices = useMemo(() => {
    if (!me || sim.serverDown) return []
    return personalNotices(me, rolesView(me, state.templates, sim.today), sim.today, (id) => label(state.roleTypes, id), sim.now).filter((n) => n.severity === "bloqueia")
  }, [me, state.templates, state.roleTypes, sim.today, sim.now, sim.serverDown])
  if (notices.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", TONE_BLOCK.stop)} role="status">
      {notices.map((n) => (
        <p key={n.id} className="flex items-start gap-2 type-body"><CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden /><span><span className="sr-only">Bloqueia: </span>{n.text}</span></p>
      ))}
      <Button variant="outline" className="min-h-11 w-full sm:w-fit md:min-h-9" onClick={() => navigate("dashboard/eu")}>Ver seus cargos</Button>
    </div>
  )
}

export function useMyRoles() {
  const { state } = useRegistry()
  const sim = useSim()
  const me = state.people.find((p) => p.id === sim.personId)
  const roles = useMemo(() => (me ? rolesView(me, state.templates, sim.today) : []), [me, state.templates, sim.today])
  return { me, roles }
}

/** A cargo about to expire: one line above the board, not a block (it does not stop me yet). */
export function CargoAvisos() {
  const { state } = useRegistry()
  const sim = useSim()
  const { me, roles } = useMyRoles()
  if (!me || sim.serverDown) return null
  const avisos = personalNotices(me, roles, sim.today, (id) => label(state.roleTypes, id), sim.now).filter((n) => n.severity === "aviso")
  if (avisos.length === 0) return null
  return (
    <div className="flex flex-col gap-1" role="status">
      {avisos.map((n) => <p key={n.id} className={cn("flex items-start gap-2 type-body", TONE_TEXT.attention)}><TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />{n.text}</p>)}
    </div>
  )
}

/** SPEC 014: my drafts, started and not sent: one line above the board with the way back to them. */
export function RascunhosAviso() {
  const { permits } = usePermits()
  const sim = useSim()
  const mine = permits.filter((p) => p.state === "rascunho" && p.authorId === sim.personId).length
  if (mine === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body" role="status">
      <span className="flex items-center gap-2"><PenLineIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />{mine === 1 ? "Você tem 1 rascunho em preenchimento." : `Você tem ${mine} rascunhos em preenchimento.`}</span>
      <Button variant="link" className="min-h-11 px-0 md:min-h-9" onClick={() => navigate("solicitacoes/rascunhos")}>Continuar preenchendo</Button>
    </div>
  )
}

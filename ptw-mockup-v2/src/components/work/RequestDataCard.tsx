import { PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PERMIT_STATE_LABEL } from "@/core/permitState"
import { fmtWindow } from "@/core/permitFormat"
import type { Permit } from "@/permit/types"
import { label, locationPath, useRegistry } from "@/registry/store"

/**
 * SPEC 018: the first step of the PT, always in sight. What the request says (service, place, window, team),
 * with its real situation; "Editar" opens the edit screen while the PT is a draft or was handed back.
 */
export function RequestDataCard({ permit, onEdit }: { permit: Permit; onEdit?: () => void }) {
  const { state } = useRegistry()
  const place = locationPath(state.locations, permit.locationId).map((l) => l.name).join(" › ") || "—"
  const team = Object.entries(permit.team ?? {}).flatMap(([roleId, ids]) => ids.map((id) => `${state.people.find((p) => p.id === id)?.name ?? "Pessoa"} (${label(state.roleTypes, roleId)})`))
  const rows: [string, string][] = [["Serviço", permit.scope || "—"], ["Local", place], ["Janela", fmtWindow(permit)], ["Equipe", team.length ? team.join(" · ") : "Sem equipe indicada"]]
  return (
    <li id="pf-dados" className="flex min-w-0 scroll-mt-20 list-none flex-col gap-3 rounded-lg border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-heading"><span className="mr-2 type-data text-muted-foreground">01</span>Dados da solicitação</h2>
        <span className="flex items-center gap-3">
          <span className="type-meta">{PERMIT_STATE_LABEL[permit.state]}</span>
          {onEdit && <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={onEdit}><PencilIcon data-icon="inline-start" />Editar</Button>}
        </span>
      </div>
      <dl className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="type-label">{k}</dt><dd className="min-w-0 break-words type-body">{v}</dd></div>)}
      </dl>
      {!onEdit && <p className="type-meta">Já enviada: para mudar estes dados, a PT precisa ser devolvida.</p>}
    </li>
  )
}

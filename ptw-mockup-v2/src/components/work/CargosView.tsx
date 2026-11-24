import { useMemo } from "react"
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, EyeOffIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { rolesView, type RoleView } from "@/core/rolesView"
import { accountStateAt, ACCOUNT_LABEL } from "@/core/eligibility"
import { dmy } from "@/core/time"
import { fmtDate, label, useRegistry } from "@/registry/store"
import { fmtTime, useSim } from "@/sim/SimProvider"
import { Narrow, Page, PageHeader, PageSection, PropertyList } from "../shell/Page"
import { goBack } from "./nav"
import { DownBanner } from "./state"
import { TONE_TEXT } from "../shell/Status"
import { cn } from "@/lib/utils"


/**
 * Seus cargos e conta (`#dashboard/eu`): my cargos with their validity and what each lets me sign,
 * then my account. Profile facts, kept off the work list; the Dashboard links here from its header "⋯".
 * A Registro-like page: back link to the Dashboard, h1, narrow content on the title's left edge.
 */
export function CargosView() {
  const { state } = useRegistry()
  const sim = useSim()
  const me = state.people.find((p) => p.id === sim.personId)
  const roles = useMemo(() => (me ? rolesView(me, state.templates, sim.today) : []), [me, state.templates, sim.today])
  if (!me) return null
  const roleName = (id: string) => label(state.roleTypes, id)
  const scope = (r: RoleView) => (r.scopeLocationId ? state.locations.find((l) => l.id === r.scopeLocationId)?.name ?? r.scopeLocationId : "Unidade inteira")
  const account = accountStateAt(me, sim.now)
  const until = me.accountExpires ? dmy(me.accountExpires) : null
  const accountText = account === "vencida" && until ? `Conta vencida em ${until}` : `${ACCOUNT_LABEL[account]}${until ? `, vence em ${until}` : ", sem prazo"}`
  const accountBad = account !== "ativa"

  return (
    <Page>
      <PageHeader back={{ label: "Dashboard", onClick: () => goBack("dashboard") }} title="Seus cargos e conta" />
      {sim.serverDown && <DownBanner now={sim.now} />}
      <Narrow>
        <PageSection title="Cargos">
          {roles.length === 0 && <p className="type-meta">Você não tem cargo: pode consultar, não assinar.</p>}
          {/* A list, not cards: rows split by a line. */}
          <ul className="flex flex-col divide-y border-y" aria-label="Meus cargos">
            {roles.map((r) => (
              <li key={`${r.roleId}${r.scopeLocationId}`} className="py-3">
                <Collapsible className="flex flex-col gap-1">
                  <h3 className="type-section">{roleName(r.roleId)}</h3>
                  <span className="type-meta">{scope(r)} · até {fmtDate(r.validUntil)}</span>
                  {sim.serverDown ? <span className="flex items-center gap-1 type-body"><EyeOffIcon className="size-4" aria-hidden />Não verificável</span>
                    : r.status === "vencido" ? <span className={cn("flex items-center gap-1 type-body font-medium", TONE_TEXT.stop)}><CircleAlertIcon className="size-4" aria-hidden />Vencido: fale com o responsável da área</span>
                    : r.status === "vence_em_breve" ? <span className={cn("flex items-center gap-1 type-body font-medium", TONE_TEXT.attention)}><TriangleAlertIcon className="size-4" aria-hidden />Vence em {r.daysLeft} {r.daysLeft === 1 ? "dia" : "dias"}</span>
                    : <span className={cn("flex items-center gap-1 type-body", TONE_TEXT.ok)}><CheckIcon className="size-4" aria-hidden />Vigente · {r.daysLeft} dias</span>}
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="group -ml-2 min-h-11 w-fit md:min-h-9">O que posso assinar<ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]:rotate-180" /></Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-4 pt-1 pb-1">
                    {r.byTemplate.length === 0 && <p className="type-meta">Este cargo não assina nenhuma etapa nos modelos ativos.</p>}
                    {r.byTemplate.map((g) => (
                      <div key={g.templateName} className="flex flex-col gap-1">
                        <p className="type-label">{g.templateName} v{g.version}</p>
                        <ul className="flex flex-col gap-0.5 type-body">
                          {g.signs.map((s) => <li key={s.meaning}>{s.meaning}{s.required ? "" : <span className="type-meta"> · opcional</span>}</li>)}
                        </ul>
                        {g.cannotAlso.length > 0 && <p className="type-meta">Não na mesma PT: {g.cannotAlso.join(", ")}.</p>}
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </li>
            ))}
          </ul>
        </PageSection>

        <PageSection title="Conta">
          <PropertyList items={[
            { label: "Login", value: <span className="type-data">{me.login}</span> },
            {
              label: "Situação",
              value: sim.serverDown
                ? <span className="flex items-center gap-1"><EyeOffIcon className="size-4 shrink-0" aria-hidden />Não verificável</span>
                : <span className={cn("flex items-center gap-1", TONE_TEXT[accountBad ? "stop" : "ok"])}>{accountBad ? <CircleAlertIcon className="size-4 shrink-0" aria-hidden /> : <CheckIcon className="size-4 shrink-0" aria-hidden />}{accountText}</span>,
            },
            { label: "Origem", value: me.origin === "ad" ? "Diretório (AD)" : me.origin === "csv" ? "Importado (CSV)" : "Cadastro manual" },
            { label: "Matrícula", value: <span className="type-data">{me.employeeId}</span> },
            { label: "Empresa", value: me.company },
            { label: "Sessão", value: `Este aparelho, desde ${fmtTime(sim.now)}` },
          ]} />
        </PageSection>
      </Narrow>
    </Page>
  )
}

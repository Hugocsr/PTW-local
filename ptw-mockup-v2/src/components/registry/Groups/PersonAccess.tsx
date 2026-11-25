import { GRANTS, GRANT_INFO, type Grant } from "@/core/governance"
import { usePersonAccess } from "@/data/hooks"
import { useSim } from "@/sim/SimProvider"
import { PageSection } from "@/components/shell/Page"
import { GrantPill } from "./shared"

/**
 * "Permissões de acesso" de uma pessoa (SPEC 002): cada permissão com sua origem — o grupo e o perfil que a
 * concedem. As do diretório (AD) só são conhecidas para a própria sessão: para os outros, a tela diz isso.
 */
export function PersonAccessSection({ personId }: { personId: string }) {
  const sim = useSim()
  const access = usePersonAccess(personId)
  const self = sim.personId === personId
  if (access.error?.code === "PTA13") return null
  if (access.error) return <PageSection title="Permissões de acesso"><p className="type-meta">{access.error.message}</p></PageSection>
  if (!access.items) return <PageSection title="Permissões de acesso"><p role="status" className="type-meta">Carregando…</p></PageSection>
  const fromGroups = access.items.filter((s) => s.from === "grupo")
  const directory = self ? GRANTS.filter((g) => sim.grants.includes(g) && !fromGroups.some((s) => s.grant === g)) : []
  const shown = GRANTS.filter((g) => directory.includes(g) || fromGroups.some((s) => s.grant === g))
  const origins = (g: Grant) => [
    ...(directory.includes(g) ? [<span key="ad">diretório (AD)</span>] : []),
    ...fromGroups.filter((s) => s.grant === g).map((s) => (
      <span key={`${s.groupId}-${s.profileId}`}>grupo <a className="underline underline-offset-2" href={`#grupos/${s.groupId}`}>{s.groupName ?? "Grupo"}</a> · perfil <a className="underline underline-offset-2" href={`#perfis/${s.profileId}`}>{s.profileName ?? "Perfil"}</a></span>
    )),
  ]
  return (
    <PageSection title="Permissões de acesso">
      {shown.length === 0 ? <p className="type-meta">Nenhuma permissão de acesso{self ? "" : " por grupos"}: emite e assina PTs conforme os cargos.</p> : (
        <ul className="flex flex-col divide-y border-y">
          {shown.map((g) => (
            <li key={g} className="flex flex-col gap-1 py-2">
              <GrantPill grant={g} className="w-fit" />
              <span className="type-meta">{GRANT_INFO[g].unlocks}</span>
              <span className="flex flex-col gap-0.5 type-meta">{origins(g).map((o, i) => <span key={i}>Origem: {o}</span>)}</span>
            </li>
          ))}
        </ul>
      )}
      {!self && <p className="mt-2 type-meta">Permissões vindas do diretório (AD) não aparecem aqui; valem na sessão da pessoa.</p>}
    </PageSection>
  )
}

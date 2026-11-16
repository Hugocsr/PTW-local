import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NAV, NAV_GROUPS, NAV_KEYS, type ViewKey } from "./nav"
import { useSim } from "@/sim/SimProvider"

/**
 * Only one count earns a place in the menu: work waiting for me (Minha área · Sua vez, the same count).
 * Totals of places, assets or people are on their own pages.
 */
import { useBrand } from "@/data/brand"
import { cn } from "@/lib/utils"
import { BrandLogo, BrandMark } from "./BrandMark"

export function AppSidebar({ active, unit, agir, onGo }: { active: ViewKey; unit: string; agir: number; onGo: (k: ViewKey) => void }) {
  const { canAudit } = useSim()
  const brand = useBrand()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        {/* With a logo: the logo on its own line over the name; collapsed, only the letters fit. */}
        <div className={cn("flex gap-2 overflow-hidden", brand.logoUrl ? "flex-col items-start group-data-[collapsible=icon]:items-center" : "items-center")}>
          <BrandLogo className="h-7 group-data-[collapsible=icon]:hidden" />
          <BrandMark className={cn("size-8 rounded-lg type-section", brand.logoUrl && "hidden group-data-[collapsible=icon]:flex")} />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <strong className="type-section truncate">{brand.name}</strong>
            <span className="type-meta truncate">{unit}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((g) => (
          <SidebarGroup key={g}>
            <SidebarGroupLabel>{g}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_KEYS.filter((k) => NAV[k].group === g && (k !== "auditoria" || canAudit)).map((k) => {
                  const v = NAV[k]
                  const n = k === "minha-area" ? agir : 0
                  return (
                    <SidebarMenuItem key={k}>
                      <SidebarMenuButton isActive={active === k} className="text-sidebar-foreground/80 data-active:font-semibold data-active:text-sidebar-accent-foreground" tooltip={n ? `${v.title} · ${n} para agir` : v.title} onClick={() => onGo(k)}>
                        <v.icon />
                        <span className="min-w-0 truncate">{v.title}</span>
                        {n > 0 && (
                          <span className="ml-auto min-w-5 rounded-full bg-st-pending-solid px-1.5 text-center text-[0.75rem] font-medium leading-5 text-background tabular-nums group-data-[collapsible=icon]:hidden">
                            {n}<span className="sr-only"> para agir</span>
                          </span>
                        )}
                      </SidebarMenuButton>
                      {n > 0 && <span aria-hidden className="pointer-events-none absolute top-1 left-5 hidden size-2 rounded-full bg-st-pending-solid ring-2 ring-sidebar group-data-[collapsible=icon]:block" />}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}

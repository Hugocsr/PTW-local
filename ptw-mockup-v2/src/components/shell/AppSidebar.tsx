import {
  SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import { NAV, NAV_GROUP_LABELS, type ViewKey } from "./nav"
import { useSim } from "@/sim/SimProvider"

/**
 * Only one count earns a place in the menu: work waiting for me (Dashboard · Sua vez, the same count).
 * Totals of places, assets or people are on their own pages.
 */
import { useBrand } from "@/data/brand"
import { cn } from "@/lib/utils"
import { BrandLogo, BrandMark } from "./BrandMark"
import { navigationSections } from "@/core/navigation"
import { WorkspaceSidebar } from "./WorkspaceSidebar"

export function AppSidebar({ active, unit, agir, onGo }: { active: ViewKey; unit: string; agir: number; onGo: (k: ViewKey) => void }) {
  const access = useSim()
  const sections = navigationSections(access)
  const { setOpenMobile } = useSidebar()
  const go = (key: ViewKey) => { onGo(key); setOpenMobile(false) }
  const brand = useBrand()
  return (
    <WorkspaceSidebar>
      <SidebarHeader className="gap-5 border-b border-sidebar-border px-4 py-5 group-data-[collapsible=icon]:px-1.5">
        {/* With a logo: the logo on its own line over the name; collapsed, only the letters fit. */}
        <div className={cn("flex gap-2 overflow-hidden group-data-[collapsible=icon]:justify-center", brand.logoUrl ? "flex-col items-start group-data-[collapsible=icon]:items-center" : "items-center")}>
          <BrandLogo className="h-7 group-data-[collapsible=icon]:hidden" />
          <BrandMark className={cn("size-10 rounded-[10px] type-section group-data-[collapsible=icon]:size-8", brand.logoUrl && "hidden group-data-[collapsible=icon]:flex")} />
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <strong className="type-section truncate">{brand.name}</strong>
            <span className="type-meta truncate">{unit}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:px-0">
        {sections.map((section) => (
          <SidebarGroup key={section.group}>
            <SidebarGroupLabel className="type-label px-3">{NAV_GROUP_LABELS[section.group]}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.views.map((k) => {
                  const v = NAV[k]
                  const n = k === "dashboard" ? agir : 0
                  return (
                    <SidebarMenuItem key={k}>
                      <SidebarMenuButton isActive={active === k} aria-current={active === k ? "page" : undefined} className="min-h-11 rounded-md px-3 font-medium text-sidebar-foreground md:min-h-9 data-active:font-semibold data-active:text-sidebar-accent-foreground data-active:[&_svg]:text-sidebar-accent-foreground" tooltip={n ? `${v.title} · ${n} para agir` : v.title} onClick={() => go(k)}>
                        <v.icon />
                        <span className="min-w-0 truncate">{v.title}</span>
                        {n > 0 && (
                          <span className="ml-auto min-w-5 rounded-full bg-sidebar-primary px-1.5 text-center text-[0.75rem] font-semibold leading-5 text-sidebar-primary-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                            {n}<span className="sr-only"> para agir</span>
                          </span>
                        )}
                      </SidebarMenuButton>
                      {n > 0 && <span aria-hidden className="pointer-events-none absolute top-1 left-5 hidden size-2 rounded-full bg-sidebar-primary ring-2 ring-sidebar group-data-[collapsible=icon]:block" />}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </WorkspaceSidebar>
  )
}

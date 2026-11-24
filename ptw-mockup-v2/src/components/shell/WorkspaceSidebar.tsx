import type { ReactNode } from "react"
import { Sidebar, useSidebar } from "@/components/ui/sidebar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/** Compose the mobile drawer so closing it reliably returns focus to the external menu trigger. */
export function WorkspaceSidebar({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar()
  if (!isMobile) return <Sidebar collapsible="icon" className="app-sidebar">{children}</Sidebar>
  return (
    <Sheet open={openMobile} onOpenChange={setOpenMobile}>
      <SheetContent side="left" data-slot="sidebar" data-mobile="true" className="app-sidebar w-72 max-w-[calc(100vw-2rem)] gap-0 bg-sidebar p-0 text-sidebar-foreground"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpenMobile(false) }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLButtonElement>('[data-slot="sidebar-trigger"]')?.focus()
        }}>
        <SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle><SheetDescription>Navegação pelas telas permitidas para sua conta.</SheetDescription></SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  )
}

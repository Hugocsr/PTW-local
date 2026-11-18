import type { ReactNode } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

/** One modal tree: resizing changes its placement, preserving even partially typed field values. */
export function PermitActDialog({ busy, onClose, children, desktopClassName, sheetClassName, sheetInnerClassName = "mx-auto flex w-full max-w-md flex-col gap-4 p-4" }: {
  busy: boolean
  onClose: () => void
  children: ReactNode
  desktopClassName?: string
  sheetClassName?: string
  sheetInnerClassName?: string
}) {
  const mobile = useIsMobile()
  const change = (open: boolean) => { if (!open && !busy) onClose() }
  return <Dialog open onOpenChange={change}>
    <DialogContent showCloseButton={!busy} aria-busy={busy} data-side={mobile ? "bottom" : undefined}
      className={cn("max-h-dvh overflow-y-auto", mobile
        ? "left-0 right-0 top-auto bottom-0 flex max-w-none translate-x-0 translate-y-0 flex-col rounded-none border-t p-0 shadow-lg ring-0 sm:max-w-none data-open:slide-in-from-bottom-10 data-open:zoom-in-100 data-closed:slide-out-to-bottom-10 data-closed:zoom-out-100"
        : "sm:max-w-md", mobile ? sheetClassName : desktopClassName)}>
      <div className={mobile ? sheetInnerClassName : "contents"}>{children}</div>
    </DialogContent>
  </Dialog>
}

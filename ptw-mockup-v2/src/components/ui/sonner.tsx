import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "light" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      expand
      richColors
      gap={10}
      visibleToasts={4}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Typed toasts take the status colours (DESIGN.md · Cor de estado): success = ok,
          // error = stop, warning = attention, info = pending. Plain toast() stays neutral.
          "--success-bg": "var(--st-ok-surface)",
          "--success-border": "var(--st-ok-border)",
          "--success-text": "var(--st-ok-fg)",
          "--error-bg": "var(--st-stop-surface)",
          "--error-border": "var(--st-stop-border)",
          "--error-text": "var(--st-stop-fg)",
          "--warning-bg": "var(--st-attention-surface)",
          "--warning-border": "var(--st-attention-border)",
          "--warning-text": "var(--st-attention-fg)",
          "--info-bg": "var(--st-pending-surface)",
          "--info-border": "var(--st-pending-border)",
          "--info-text": "var(--st-pending-fg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // "Desfazer" is a real target: 44 px on touch, like every other control.
          actionButton: "!min-h-11 !px-3 md:!min-h-8",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

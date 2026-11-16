import { cn } from "cn"

/**
 * Placeholder that mirrors the real layout (DESIGN.md · Carregando): `surface-well`, opacity pulse, still under
 * reduced motion. `delayed` keeps it invisible for 250 ms, so a fast answer never flashes a skeleton.
 */
function Skeleton({ className, delayed = false, ...props }: React.ComponentProps<"div"> & { delayed?: boolean }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("rounded-md bg-surface-well", delayed ? "skeleton-delayed" : "skeleton-pulse", className)}
      {...props}
    />
  )
}

export { Skeleton }

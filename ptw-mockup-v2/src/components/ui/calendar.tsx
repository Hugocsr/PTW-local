import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "react-day-picker/locale"
import { cn } from "@/lib/utils"

/**
 * Calendário (shadcn Calendar sobre react-day-picker), em português e com os tokens do design system:
 * dia escolhido em índigo, intervalo em índigo suave, hoje com anel. Dias de 44 px no celular, 36 px a partir de md.
 */
export function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex h-9 items-center justify-center px-10",
        caption_label: "text-sm font-semibold capitalize",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: "inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 md:size-9",
        button_next: "inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 md:size-9",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-11 text-center text-xs font-medium text-muted-foreground capitalize md:w-9",
        week: "mt-1 flex w-full",
        day: "relative size-11 p-0 text-center text-sm md:size-9",
        day_button: "inline-flex size-11 items-center justify-center rounded-md tabular-nums hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:size-9",
        selected: "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        today: "[&>button]:ring-1 [&>button]:ring-primary/50 [&>button]:font-semibold",
        outside: "text-muted-foreground/60",
        disabled: "text-muted-foreground/40 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent [&>button]:line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => orientation === "left" ? <ChevronLeftIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />,
      }}
      {...props}
    />
  )
}

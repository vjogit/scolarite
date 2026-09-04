import {
  DayPicker,
  type ChevronProps,
  type DayPickerProps,
} from "react-day-picker"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button-variants"

/**
 * Le calendrier de la recette shadcn : react-day-picker stylé par les tokens
 * du projet, sans sa feuille de style. Les clés de `classNames` sont l'énum
 * `UI` du paquet (v9) ; les états d'un jour (sélectionné, aujourd'hui, hors
 * mois, désactivé) se stylent par les attributs `data-*` que le paquet pose
 * sur la cellule — pas par les clés d'état de l'énum, qui ne feraient
 * qu'empiler des classes de même spécificité à l'ordre imprévisible.
 */
function Calendar({ classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col",
        month: "flex w-full flex-col gap-3",
        month_caption:
          "flex h-8 w-full items-center px-2 text-sm font-medium capitalize",
        caption_label: "select-none",
        nav: "absolute inset-x-0 top-0 flex h-8 w-full items-center justify-end gap-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "select-none"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "select-none"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-8 flex-1 select-none text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: cn(
          "relative aspect-square h-full w-8 select-none p-0 text-center text-sm",
          // L'état vit sur le `td` (les data-*), le style sur son bouton.
          "[&>button]:size-8 [&>button]:rounded-lg [&>button]:font-normal",
          "not-data-selected:[&>button:hover]:bg-muted not-data-selected:[&>button:hover]:text-foreground",
          "data-selected:[&>button]:bg-primary data-selected:[&>button]:text-primary-foreground",
          "data-today:not-data-selected:[&>button]:text-primary data-today:[&>button]:font-medium",
          "data-outside:[&>button]:text-muted-foreground/50",
          "data-disabled:[&>button]:pointer-events-none data-disabled:[&>button]:opacity-30",
          "data-hidden:invisible"
        ),
        day_button:
          "inline-flex items-center justify-center outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        ...classNames,
      }}
      components={{ Chevron }}
      {...props}
    />
  )
}

function Chevron({ orientation, className }: ChevronProps) {
  return orientation === "left" ? (
    <ChevronLeftIcon className={className} />
  ) : (
    <ChevronRightIcon className={className} />
  )
}

export { Calendar }

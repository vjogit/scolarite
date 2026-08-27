import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  // Chaîne d'interface : traduite, comme partout (conventions CLAUDE.md) —
  // le composant généré par shadcn portait « Loading » en dur. Un appelant
  // qui accompagne le spinner d'un texte visible peut passer `aria-hidden`.
  const { t } = useTranslation("app")
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t("shell.chargement")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }

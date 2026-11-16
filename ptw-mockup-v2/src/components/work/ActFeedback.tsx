import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TONE_BLOCK } from "@/components/shell/Status"
import { toastFor, type RuleError } from "@/core/ptwErrors"

export function ActFeedback({ busy, error, stop = false }: { busy: boolean; error: RuleError | null; stop?: boolean }) {
  if (busy) return <p role="status" className="flex items-center gap-2 type-body"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden />Registrando…</p>
  if (!error) return null
  return <Alert className={TONE_BLOCK.stop}>
    <CircleAlertIcon aria-hidden />
    <AlertTitle>{toastFor(error).title}</AlertTitle>
    <AlertDescription>{error.message}{stop && " Pare o trabalho com segurança e avise a área."}</AlertDescription>
  </Alert>
}

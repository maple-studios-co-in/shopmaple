import * as React from "react"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The Checkbox look on a real `<input type="checkbox">`: the editors keep native form
 * semantics (checked, change events, form reset) and the same styling as the Radix one.
 */
function NativeCheckbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span data-slot="native-checkbox" className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}>
      <input
        type="checkbox"
        className="peer size-4 cursor-pointer appearance-none rounded-[4px] border border-input bg-card shadow-xs transition-[background-color,border-color,box-shadow] focus-visible:outline-none checked:border-primary checked:bg-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        {...props}
      />
      <CheckIcon aria-hidden="true" className="pointer-events-none absolute size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  )
}

export { NativeCheckbox }

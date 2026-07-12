"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /**
   * Render a required-field affordance (`*`). Marked `aria-hidden` — the
   * programmatic required-state is carried by `aria-required` on the control
   * (wired by `Field`), so the asterisk never pollutes the accessible name.
   */
  required?: boolean
}

/**
 * Accessible label primitive styled to the glass/dark aesthetic (ADR-015,
 * FR-P2a-2). Built on `@radix-ui/react-label` so text-selection on the label
 * does not steal focus from its control. Pair with `Field` (which owns the
 * control `id` + `htmlFor` wiring) or pass `htmlFor` directly.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required = false, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none text-foreground",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className
    )}
    {...props}
  >
    {children}
    {required ? (
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
    ) : null}
  </LabelPrimitive.Root>
))
Label.displayName = "Label"

export { Label }

"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface SwitchBaseProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "role" | "aria-checked" | "aria-label" | "aria-labelledby" | "onChange" | "value"
  > {
  checked: boolean
  /** Called with the next state on click, Space or Enter. */
  onCheckedChange?: (checked: boolean) => void
}

/** A switch has no visible text of its own, so a name is mandatory at the type level. */
export type SwitchProps = SwitchBaseProps & (
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string }
)

/**
 * On/off switch primitive (audit §4.8, DS-04). A native `<button
 * type="button" role="switch" aria-checked>`: Space and Enter toggle it, and
 * its name comes from `aria-labelledby` (the visible setting name, or `Field`)
 * or `aria-label`. Track `bg-input` → `bg-accent`, 44×24px, shared focus ring.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, onClick, disabled, className, ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onCheckedChange?.(!checked)
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive",
        checked ? "bg-accent" : "bg-input",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-foreground shadow-sm transition-transform duration-fast",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  )
)
Switch.displayName = "Switch"

export { Switch }

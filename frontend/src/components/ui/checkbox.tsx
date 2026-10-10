"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "size"> {
  checked?: boolean
  /** Called with the next checked state (the native `onChange` still fires too). */
  onCheckedChange?: (checked: boolean) => void
  /** Mixed state for "select all" over a partial selection (`aria-checked="mixed"`). */
  indeterminate?: boolean
}

/**
 * Checkbox primitive (audit §4.8, DS-10). A native `input[type=checkbox]`, so
 * Space toggles it, it submits with forms and it carries its own state; themed
 * through `accent-color` with the shared focus ring.
 *
 * It needs an accessible name: wrap it in `Field layout="inline"` (which wires
 * `htmlFor` + `aria-labelledby`) or pass `aria-label` for a row-selection
 * checkbox ("Select {name}", AX-04).
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onChange, onCheckedChange, indeterminate = false, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof forwardedRef === "function") forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate
    }, [indeterminate])

    return (
      <input
        ref={setRefs}
        type="checkbox"
        className={cn(
          "size-4 shrink-0 cursor-pointer rounded border-input accent-accent focus-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:outline aria-[invalid=true]:outline-2 aria-[invalid=true]:outline-destructive",
          className
        )}
        onChange={(event) => {
          onChange?.(event)
          onCheckedChange?.(event.target.checked)
        }}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

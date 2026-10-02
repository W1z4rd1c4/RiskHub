"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { inputVariants, type InputSize } from "./input"

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size" | "multiple"> {
  /** Control height: `default` (40px) or `compact` (32px), as `Input`. */
  size?: InputSize
  /**
   * Renders only the bare native `<select>`, transparent and stretched over its
   * positioned parent (no recipe, no chevron). The parent draws the visible
   * control and its focus ring (`focus-within`), e.g. the register toolbar's
   * Add-filter chip, while the browser keeps the native picker and keyboard.
   */
  overlay?: boolean
}

/**
 * Styled native `<select>` (audit §4.8, GAP-D-26) for short closed lists where
 * browser-native behaviour matters: pre-auth pages, admin forms and simple
 * filters. Same geometry, tokens, focus ring and `aria-invalid` state as
 * `Input`; options are `<option>` children. Use `ThemedSelect` for styled
 * dropdowns in the authenticated app.
 *
 *   <Field label={t('…method')}>
 *     {(field) => <NativeSelect {...field} value={method} onChange={…}>…</NativeSelect>}
 *   </Field>
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size = "default", overlay = false, children, ...props }, ref) => overlay ? (
    <select
      ref={ref}
      className={cn("absolute inset-0 cursor-pointer opacity-0", className)}
      {...props}
    >
      {children}
    </select>
  ) : (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          inputVariants({ size }),
          "cursor-pointer appearance-none",
          size === "compact" ? "pr-8" : "pr-10",
          "[&_option]:bg-popover [&_option]:text-popover-foreground",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          size === "compact" ? "right-2.5" : "right-3.5"
        )}
      />
    </div>
  )
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }

"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Shared text-entry recipe (audit §4.8). `Input`, `Textarea` and `NativeSelect`
 * all build on it so the three controls keep one geometry, one token set and
 * one invalid state.
 *
 * - Tokens only: `border-input bg-input/40 text-foreground`, so every theme
 *   follows automatically.
 * - The invalid state is driven by the `aria-invalid` attribute that `Field`
 *   sets, so the visual state and the announced state never disagree.
 * - `size` sets height and padding. `default` is the 40px control; `compact`
 *   (32px, 10px radius) is for filter bars and `SearchableEntitySelect`. Pass
 *   `size: null` to keep only the shared colour/state recipe (`Textarea`).
 */
const inputVariants = cva(
  [
    "flex w-full rounded-lg border text-sm shadow-sm transition-colors",
    "border-input bg-input/40 text-foreground",
    "placeholder:text-muted-foreground",
    "hover:border-ring/40",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive",
  ],
  {
    variants: {
      size: {
        default: "h-10 px-4 py-2.5",
        compact: "h-8 rounded-md px-3 py-1",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export type InputSize = NonNullable<VariantProps<typeof inputVariants>["size"]>

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Control height: `default` (40px) or `compact` (32px). */
  size?: InputSize
  /** Decorative icon rendered inside the leading edge (e.g. `Search`). */
  leadingIcon?: LucideIcon
}

/**
 * Text-input primitive (ADR-015, FR-P2a-2, audit §4.8). Token-driven so it
 * themes with the design system across the three themes and matches
 * `select.tsx`'s trigger (same height/radius/focus-visible ring). Spread
 * `Field`'s render-prop onto it for the label, description and error wiring.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", leadingIcon: LeadingIcon, ...props }, ref) => {
    const input = (
      <input
        type={type}
        ref={ref}
        className={cn(
          inputVariants({ size }),
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          LeadingIcon && (size === "compact" ? "pl-8" : "pl-10"),
          className
        )}
        {...props}
      />
    )

    if (!LeadingIcon) return input

    return (
      <div className="relative w-full">
        <LeadingIcon
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            size === "compact" ? "left-2.5 size-3.5" : "left-3.5 size-4"
          )}
        />
        {input}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }

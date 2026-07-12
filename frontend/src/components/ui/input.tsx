"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/**
 * Text-input primitive (ADR-015, FR-P2a-2). Token-driven so it themes with the
 * design system across the three themes and matches `select.tsx`'s trigger
 * (same height/radius/focus-visible ring). The `aria-invalid` visual state is
 * driven by the attribute `Field` sets, so error styling needs no extra class.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl border px-4 py-2.5 text-sm shadow-sm transition-colors",
        "border-input bg-input/40 text-foreground",
        "placeholder:text-muted-foreground",
        "hover:border-ring/40",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }

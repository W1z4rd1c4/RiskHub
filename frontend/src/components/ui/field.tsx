"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "./label"

/**
 * The ARIA wiring `Field` hands to its control via a render-prop. Spread it
 * straight onto an `Input`/`ThemedSelect`/native control:
 *
 *   <Field label="Asset name" required error={errors.name}>
 *     {(field) => <Input {...field} value={name} onChange={…} />}
 *   </Field>
 */
export interface FieldControlProps {
  id: string
  "aria-labelledby": string
  "aria-describedby": string | undefined
  "aria-invalid": true | undefined
  "aria-required": true | undefined
}

export interface FieldProps {
  /** Visible label text (rendered in a `<Label>` associated with the control). */
  label: React.ReactNode
  /** Render-prop receiving the id + ARIA attributes to spread onto the control. */
  children: (field: FieldControlProps) => React.ReactNode
  /** Override the generated control id (otherwise `useId`). */
  id?: string
  /** Optional help/description text; wired into `aria-describedby`. */
  help?: React.ReactNode
  /** Error text; sets `aria-invalid`, wired into `aria-describedby`. */
  error?: React.ReactNode
  /** Marks the field required (`aria-required` + label affordance). */
  required?: boolean
  className?: string
  labelClassName?: string
}

/**
 * Shared accessible form field (ADR-015, FR-P2a-1, spec N12).
 *
 * Owns the control `id` and wires the visible `<label>` (`htmlFor` +
 * `aria-labelledby`), `aria-describedby` (help + error text), `aria-invalid`
 * and `aria-required`. It is the single enforcement point that makes the
 * ADR-013 jsx-a11y gate pass for forms, and — because the same ARIA object
 * drives `ThemedSelect` — structurally fixes the repeated-"Not set"
 * accessible-name defect (finding C1). Dormant until Phase 2b adopts it.
 */
export function Field({
  label,
  children,
  id: idProp,
  help,
  error,
  required = false,
  className,
  labelClassName,
}: FieldProps) {
  const autoId = React.useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const helpId = help != null && help !== false ? `${id}-help` : undefined
  const errorId = error != null && error !== false ? `${id}-error` : undefined

  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined

  const field: FieldControlProps = {
    id,
    "aria-labelledby": labelId,
    "aria-describedby": describedBy,
    "aria-invalid": errorId ? true : undefined,
    "aria-required": required ? true : undefined,
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        id={labelId}
        htmlFor={id}
        required={required}
        className={labelClassName}
      >
        {label}
      </Label>
      {children(field)}
      {helpId ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {errorId ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

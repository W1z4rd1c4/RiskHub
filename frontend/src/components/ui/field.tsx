"use client"

import * as React from "react"

import { useTranslation } from "@/i18n/hooks"
import { cn } from "@/lib/utils"
import { Label, labelTextClassName } from "./label"

/**
 * The ARIA wiring `Field` hands to its control via a render-prop. Spread it
 * straight onto any form primitive (`Input`, `Textarea`, `NativeSelect`,
 * `ThemedSelect`, `MultiSelect`, `Checkbox`, `Switch`, `RadioGroup`):
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
  /** Description / help text; wired into `aria-describedby`. */
  help?: React.ReactNode
  /** Error text; sets `aria-invalid`, wired into `aria-describedby` after the help. */
  error?: React.ReactNode
  /** Marks the field required: aria-hidden `*` on the label + `aria-required` (D14). */
  required?: boolean
  /** Appends the translated "(optional)" hint to the label. Ignored when `required`. */
  optional?: boolean
  /** Keeps the label for assistive tech only (compact filter bars; never placeholder-only). */
  labelVisuallyHidden?: boolean
  /** `stack`: label above the control. `inline`: control first, label beside it (Checkbox/Switch rows). */
  layout?: "stack" | "inline"
  /**
   * The control is a group (`RadioGroup`, a checkbox list) named through
   * `aria-labelledby`, so the label renders as text instead of a `<label for>`.
   */
  group?: boolean
  className?: string
  labelClassName?: string
}

/**
 * Shared accessible form field (ADR-015, FR-P2a-1, spec N12, audit §4.8).
 *
 * Owns the control `id` and wires the visible `<label>` (`htmlFor` +
 * `aria-labelledby`), `aria-describedby` (help + error text), `aria-invalid`
 * and `aria-required`. It is the single enforcement point that makes the
 * ADR-013 jsx-a11y gate pass for forms, and — because the same ARIA object
 * drives `ThemedSelect` — structurally fixes the repeated-"Not set"
 * accessible-name defect (finding C1).
 */
export function Field({
  label,
  children,
  id: idProp,
  help,
  error,
  required = false,
  optional = false,
  labelVisuallyHidden = false,
  layout = "stack",
  group = false,
  className,
  labelClassName,
}: FieldProps) {
  const { t } = useTranslation("common")
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

  const labelContent = (
    <>
      {label}
      {optional && !required ? (
        <>
          {" "}
          <span className="font-normal">{t("labels.optional")}</span>
        </>
      ) : null}
    </>
  )
  const resolvedLabelClassName = cn(labelVisuallyHidden && "sr-only", labelClassName)

  const labelElement = group ? (
    <span id={labelId} className={cn("block", labelTextClassName, resolvedLabelClassName)}>
      {labelContent}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </span>
  ) : (
    <Label id={labelId} htmlFor={id} required={required} className={resolvedLabelClassName}>
      {labelContent}
    </Label>
  )

  const messages = (
    <>
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
    </>
  )

  if (layout === "inline") {
    return (
      <div className={cn("flex items-start gap-3", className)}>
        <div className="flex min-h-5 shrink-0 items-center">{children(field)}</div>
        <div className="min-w-0 space-y-1 pt-0.5">
          {labelElement}
          {messages}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {labelElement}
      {children(field)}
      {messages}
    </div>
  )
}

"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface RadioGroupOption<TValue extends string = string> {
  value: TValue
  label: React.ReactNode
  /** Secondary text; wired to the radio's `aria-describedby` (the name stays `label`). */
  description?: React.ReactNode
  disabled?: boolean
  testId?: string
}

export interface RadioGroupProps<TValue extends string = string> {
  value: TValue
  onValueChange: (value: TValue) => void
  options: ReadonlyArray<RadioGroupOption<TValue>>
  /** `list`: compact stacked radios. `card`: bordered selectable cards. */
  variant?: "list" | "card"
  /**
   * Visible group name rendered as the `<legend>`. Omit it when a `Field`
   * names the group (spread its render-prop, which supplies `aria-labelledby`).
   */
  legend?: React.ReactNode
  legendClassName?: string
  /** Shared `name` for the native radios (generated when omitted). */
  name?: string
  disabled?: boolean
  className?: string
  /** Control wiring from `Field` (or explicit). */
  id?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
  "aria-required"?: React.AriaAttributes["aria-required"]
}

/**
 * Radio group primitive (audit §4.8, DS-10, DS-18). Native radios inside a
 * `fieldset role="radiogroup"`, so arrow keys move the selection, Tab enters
 * and leaves the group as one stop, and the group is named by its `<legend>`
 * or by `Field`'s label (`aria-labelledby`). `variant="card"` renders the
 * bordered option cards (the ExportDialog / AppearanceSettings pattern).
 */
function RadioGroupInner<TValue extends string = string>(
  {
    value,
    onValueChange,
    options,
    variant = "list",
    legend,
    legendClassName,
    name: nameProp,
    disabled = false,
    className,
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-describedby": ariaDescribedby,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired,
  }: RadioGroupProps<TValue>,
  ref: React.ForwardedRef<HTMLFieldSetElement>
) {
  const autoId = React.useId()
  const baseId = id ?? autoId
  const name = nameProp ?? `${baseId}-radio`
  const isCard = variant === "card"

  return (
    <fieldset
      ref={ref}
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      disabled={disabled}
      className={cn("min-w-0 space-y-2", className)}
    >
      {legend != null ? (
        <legend className={cn("mb-2 text-sm font-medium text-foreground", legendClassName)}>
          {legend}
        </legend>
      ) : null}
      {options.map((option, index) => {
        const optionId = `${baseId}-option-${index}`
        const labelId = `${optionId}-label`
        const descriptionId = option.description != null ? `${optionId}-description` : undefined
        const checked = option.value === value
        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className={cn(
              "flex gap-3 text-sm text-foreground",
              option.disabled || disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              isCard
                ? "rounded-lg border border-border bg-tint/5 px-4 py-3 transition-colors has-[:checked]:border-accent/50 has-[:checked]:bg-accent/10"
                : "items-center"
            )}
          >
            <input
              id={optionId}
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              data-testid={option.testId}
              onChange={() => onValueChange(option.value)}
              className={cn(
                "size-4 shrink-0 accent-accent focus-ring",
                isCard && "mt-0.5",
                option.disabled || disabled ? "cursor-not-allowed" : "cursor-pointer"
              )}
            />
            <span className="min-w-0">
              <span id={labelId} className={cn("block", isCard && "font-semibold")}>{option.label}</span>
              {descriptionId ? (
                <span id={descriptionId} className="block text-sm text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/**
 * `RadioGroup` with its ref on the `fieldset` root. `forwardRef` erases the
 * value generic, so the cast restores it (`RadioGroup<ExportPurpose>`).
 */
const RadioGroup = React.forwardRef(RadioGroupInner) as (<TValue extends string = string>(
  props: RadioGroupProps<TValue> & { ref?: React.Ref<HTMLFieldSetElement> }
) => React.ReactElement | null) & { displayName?: string }
RadioGroup.displayName = "RadioGroup"

export { RadioGroup }

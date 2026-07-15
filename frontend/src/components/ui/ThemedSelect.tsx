import * as React from "react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./select"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/i18n/hooks"

export interface SelectOption {
    value: string
    label: string
    disabled?: boolean
}

export interface ThemedSelectProps {
    value: string
    onValueChange: (value: string) => void
    options: SelectOption[]
    placeholder?: string
    triggerAriaLabel?: string
    className?: string
    disabled?: boolean
    /** Show empty option that clears selection */
    allowEmpty?: boolean
    emptyLabel?: string
    triggerTestId?: string
    contentTestId?: string
    optionTestIdPrefix?: string
    /** Ref to the focusable select trigger (used by focus-first-invalid forms). */
    triggerRef?: React.Ref<HTMLButtonElement>
    /** Control id (owned by `Field` when wrapped). */
    id?: string
    /**
     * Id(s) of the visible label(s) associated with this control. When set, the
     * fallback `aria-label` is suppressed so the visible label is the accessible
     * name (FR-P2a-4 / spec N13 — no fallback label overrides a real label).
     */
    "aria-labelledby"?: string
    /** Id(s) of help/error text (wired by `Field`). */
    "aria-describedby"?: string
    /** Invalid-state flag (wired by `Field`); also drives the error visual. */
    "aria-invalid"?: React.AriaAttributes["aria-invalid"]
    /** Required-state flag (wired by `Field`). */
    "aria-required"?: React.AriaAttributes["aria-required"]
}

// Radix UI Select doesn't allow empty string values (uses "" to clear selection).
// We use this sentinel value internally and translate to/from "" for the consumer.
const EMPTY_SENTINEL = "__EMPTY__"

/**
 * Convenience wrapper around the Radix Select primitives.
 * Provides a simple value + options API while maintaining full theme support.
 */
export function ThemedSelect({
    value,
    onValueChange,
    options,
    placeholder,
    triggerAriaLabel,
    className,
    disabled = false,
    allowEmpty = false,
    emptyLabel,
    triggerTestId,
    contentTestId,
    optionTestIdPrefix,
    triggerRef,
    id,
    "aria-labelledby": ariaLabelledby,
    "aria-describedby": ariaDescribedby,
    "aria-invalid": ariaInvalid,
    "aria-required": ariaRequired,
}: ThemedSelectProps) {
    const { t } = useTranslation('common')
    const resolvedPlaceholder = placeholder ?? t('actions.select')
    const resolvedEmptyLabel = emptyLabel ?? t('labels.all')

    // FR-P2a-4 / N13: a visible label associated via `aria-labelledby` MUST win
    // over the fallback `aria-label`. Only fall back to an explicit
    // `triggerAriaLabel` or the placeholder when no visible label is associated —
    // this preserves the accessible name for the ~95 existing call sites (which
    // pass neither) while fixing the repeated-"Not set"/placeholder name defect.
    const resolvedTriggerAriaLabel = ariaLabelledby
        ? undefined
        : (triggerAriaLabel ?? resolvedPlaceholder)

    // Translate external "" to internal sentinel
    const internalValue = value === "" ? EMPTY_SENTINEL : value

    // Handle value change, translating sentinel back to ""
    const handleValueChange = (newValue: string) => {
        onValueChange(newValue === EMPTY_SENTINEL ? "" : newValue)
    }

    // Build options list with optional empty option (using sentinel)
    const allOptions = React.useMemo(() => {
        if (allowEmpty) {
            return [{ value: EMPTY_SENTINEL, label: resolvedEmptyLabel }, ...options]
        }
        return options
    }, [options, allowEmpty, resolvedEmptyLabel])

    const optionTestIdForValue = (optionValue: string): string | undefined => {
        if (!optionTestIdPrefix) {
            return undefined
        }
        const normalized = optionValue === EMPTY_SENTINEL ? "empty" : optionValue
        return `${optionTestIdPrefix}-${normalized}`
    }

    return (
        <Select value={internalValue} onValueChange={handleValueChange} disabled={disabled}>
            <SelectTrigger
                ref={triggerRef}
                id={id}
                className={cn("min-w-[130px]", className)}
                data-testid={triggerTestId}
                aria-label={resolvedTriggerAriaLabel}
                aria-labelledby={ariaLabelledby}
                aria-describedby={ariaDescribedby}
                aria-invalid={ariaInvalid}
                aria-required={ariaRequired}
            >
                <SelectValue placeholder={resolvedPlaceholder} />
            </SelectTrigger>
            <SelectContent data-testid={contentTestId}>
                {allOptions.map((option) => (
                    <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                        data-testid={optionTestIdForValue(option.value)}
                    >
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

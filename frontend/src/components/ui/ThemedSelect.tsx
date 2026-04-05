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
}: ThemedSelectProps) {
    const { t } = useTranslation('common')
    const resolvedPlaceholder = placeholder ?? t('actions.select')
    const resolvedEmptyLabel = emptyLabel ?? t('labels.all')

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
                className={cn("min-w-[130px]", className)}
                data-testid={triggerTestId}
                aria-label={triggerAriaLabel ?? resolvedPlaceholder}
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

"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { ChevronDown, Search, X } from "lucide-react"

import { useTranslation } from "@/i18n/hooks"
import { cn } from "@/lib/utils"
import { Badge } from "./badge"
import { Checkbox } from "./checkbox"
import { Input, inputVariants, type InputSize } from "./input"

export interface MultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface MultiSelectProps {
  options: ReadonlyArray<MultiSelectOption>
  value: ReadonlyArray<string>
  onChange: (value: string[]) => void
  /** Trigger text while nothing is selected (default `common:actions.select`). */
  placeholder?: string
  /** Trigger text for a non-empty selection (default "{{count}} selected"). */
  formatSummary?: (count: number) => string
  /** Show a filter box above the options. */
  searchable?: boolean
  searchPlaceholder?: string
  /** Render the selection as removable chips under the trigger (default `true`). */
  showChips?: boolean
  disabled?: boolean
  /** Trigger height: `default` (40px) or `compact` (32px), as `Input`. */
  size?: InputSize
  /** Extra classes for the trigger button. */
  className?: string
  /** Extra classes for each selection chip. */
  chipClassName?: string
  triggerTestId?: string
  optionTestIdPrefix?: string
  /** Accessible name when no visible label is associated. */
  triggerAriaLabel?: string
  /** Control wiring from `Field` (or explicit). */
  id?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
  "aria-required"?: React.AriaAttributes["aria-required"]
}

const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"])

/**
 * Multi-select primitive (audit §3.1, §4.8, GAP-B-07): a select-only combobox
 * trigger that opens a Radix popover with a checkbox list.
 *
 * - The trigger shows a selected-count summary; its name comes from `Field`
 *   (`aria-labelledby`) or `triggerAriaLabel`.
 * - Keyboard: Enter/Space/ArrowDown on the trigger open the list and focus
 *   the first control; ArrowUp/ArrowDown/Home/End move between options; Space
 *   toggles; Escape closes and returns focus to the trigger. Tab moves between
 *   the search box and the options; tabbing past either end closes the list
 *   and returns focus to the trigger, so focus never escapes into the page
 *   behind a `DialogShell` (the popover is portalled outside the dialog).
 * - The popover is a `themed-select-content` layer, so it shares the select
 *   dropdown surface and `DialogShell` treats it as an active interaction layer.
 * - Chips (`Badge` tone `accent`) remove a value with a "Remove {name}" button.
 * - The forwarded ref points at the trigger button.
 */
const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>(function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  formatSummary,
  searchable = false,
  searchPlaceholder,
  showChips = true,
  disabled = false,
  size = "default",
  className,
  chipClassName,
  triggerTestId,
  optionTestIdPrefix,
  triggerAriaLabel,
  id,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}, ref) {
  const { t } = useTranslation("common")
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const listRef = React.useRef<HTMLDivElement>(null)

  const resolvedPlaceholder = placeholder ?? t("actions.select")
  const resolvedSearchLabel = searchPlaceholder ?? t("filters.search_items")
  const fallbackName = ariaLabelledby ? undefined : (triggerAriaLabel ?? resolvedPlaceholder)
  const selected = React.useMemo(() => new Set(value), [value])
  const summary = value.length === 0
    ? resolvedPlaceholder
    : (formatSummary?.(value.length) ?? t("multi_select.selected_count", { count: value.length }))

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options

  const labelFor = (optionValue: string) =>
    options.find((option) => option.value === optionValue)?.label ?? optionValue

  const toggle = (optionValue: string) => {
    onChange(
      selected.has(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue]
    )
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setQuery("")
  }

  const handleContentKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      // The content is portalled to <body>: tabbing past its first or last
      // control would leave the page (or the enclosing DialogShell's trap).
      const focusable = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled)")
      )
      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1]
      if (focusable.length === 0 || event.target === edge) {
        event.preventDefault()
        handleOpenChange(false)
      }
      return
    }
    if (!NAVIGATION_KEYS.has(event.key)) return
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)') ?? []
    )
    const current = items.findIndex((item) => item === event.target)
    // In the search box only ArrowDown leaves for the list; Home/End move the caret.
    if (items.length === 0 || (current < 0 && event.key !== "ArrowDown")) return
    event.preventDefault()
    let next = 0
    if (event.key === "End") next = items.length - 1
    else if (event.key === "ArrowDown") next = current < 0 ? 0 : Math.min(current + 1, items.length - 1)
    else if (event.key === "ArrowUp") next = current <= 0 ? 0 : current - 1
    items[next]?.focus()
  }

  return (
    <div className="space-y-2">
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Trigger
          ref={ref}
          id={id}
          role="combobox"
          disabled={disabled}
          aria-label={fallbackName}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          data-testid={triggerTestId}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && !open) {
              event.preventDefault()
              setOpen(true)
            }
          }}
          className={cn(
            inputVariants({ size }),
            "items-center justify-between gap-2 text-left hover:bg-input/60",
            value.length === 0 && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            aria-labelledby={ariaLabelledby}
            aria-label={fallbackName}
            onKeyDown={handleContentKeyDown}
            className={cn(
              "themed-select-content z-popover w-[var(--radix-popover-trigger-width)] min-w-48 rounded-2xl border p-1 shadow-popover backdrop-blur-xl",
              "border-border bg-popover/95 text-popover-foreground",
              "focus-visible:outline-none"
            )}
          >
            {searchable ? (
              <div className="p-1">
                <Input
                  size="compact"
                  leadingIcon={Search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={resolvedSearchLabel}
                  aria-label={resolvedSearchLabel}
                />
              </div>
            ) : null}
            <div ref={listRef} className="max-h-60 overflow-y-auto">
              {visibleOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t("labels.no_results")}</p>
              ) : (
                visibleOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                      "hover:bg-tint/5 has-[:focus-visible]:bg-tint/10",
                      option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    )}
                  >
                    <Checkbox
                      checked={selected.has(option.value)}
                      disabled={option.disabled}
                      onCheckedChange={() => toggle(option.value)}
                      data-testid={optionTestIdPrefix ? `${optionTestIdPrefix}-${option.value}` : undefined}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </label>
                ))
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {showChips && value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((item) => {
            const label = labelFor(item)
            return (
              <li key={item}>
                <Badge tone="accent" className={cn("h-7 pl-3 pr-0.5 font-medium", chipClassName)}>
                  {label}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(item)}
                    aria-label={t("actions.remove_named", { name: label })}
                    title={t("actions.remove")}
                    className="flex size-6 items-center justify-center rounded-full transition-colors hover:bg-tint/10 focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </Badge>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
})
MultiSelect.displayName = "MultiSelect"

export { MultiSelect }

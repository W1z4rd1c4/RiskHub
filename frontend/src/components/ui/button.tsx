import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Shared action primitive (audit §4.7, D4).
 *
 * - `accent` is THE primary call to action. `default` is a deprecated alias
 *   kept so existing callers render unchanged until they migrate.
 * - `outline` / `ghost` hover with the neutral `tint` token instead of the
 *   saturated accent fill (DS-29); focus uses the shared `focus-ring` utility.
 * - Icon-only sizes (`icon`, `iconCompact`) require an accessible name at the
 *   type level (`aria-label` or `aria-labelledby`).
 * - `isLoading` shows a spinner, sets `aria-busy` and disables the control.
 * - `secondary` and `link` keep their pre-§4.7 looks until their callers
 *   migrate in wave W7 (see the notes on each variant).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        accent:
          "bg-accent text-accent-foreground shadow-sm hover:bg-accent-hover",
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        // Pending W7 (audit §4.7): keeps its current look this wave. The target
        // recipe (adds `border border-border`, hovers with `bg-tint/10`) lands
        // with the caller migration and its visual diff.
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        outline:
          "border border-input bg-transparent shadow-sm hover:bg-tint/10 hover:text-foreground",
        ghost: "hover:bg-tint/10 hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        warning:
          "bg-warning text-warning-foreground shadow-sm hover:bg-warning/90",
        success:
          "bg-success text-success-foreground shadow-sm hover:bg-success/90",
        // Pending W7 (audit §4.7): keeps its current look this wave. Target text
        // token is `text-accent-text` (link / info role, §4.3), applied with the
        // caller migration.
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        lg: "h-11 px-6 text-base",
        compact: "h-8 rounded-md px-3 text-xs",
        icon: "h-10 w-10",
        iconCompact: "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonVariantProps = VariantProps<typeof buttonVariants>

export type ButtonVariant = NonNullable<ButtonVariantProps["variant"]>
export type ButtonSize = NonNullable<ButtonVariantProps["size"]>
export type IconButtonSize = Extract<ButtonSize, "icon" | "iconCompact">
type TextButtonSize = Exclude<ButtonSize, IconButtonSize>

const ICON_BUTTON_SIZES: ReadonlySet<ButtonSize> = new Set<IconButtonSize>(["icon", "iconCompact"])

interface ButtonBaseProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-labelledby"> {
  variant?: ButtonVariant | null
  isLoading?: boolean
}

type TextButtonProps = ButtonBaseProps & {
  size?: TextButtonSize | null
  "aria-label"?: string
  "aria-labelledby"?: string
}

/** Icon-only buttons have no visible text, so an accessible name is mandatory. */
type IconButtonProps = ButtonBaseProps & { size: IconButtonSize } & (
  | { "aria-label": string; "aria-labelledby"?: string }
  | { "aria-label"?: string; "aria-labelledby": string }
)

export type ButtonProps = TextButtonProps | IconButtonProps

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    "aria-busy": ariaBusy,
    children,
    className,
    disabled,
    isLoading = false,
    size,
    type,
    variant,
    ...props
  }, ref) => {
    const isIconOnly = size != null && ICON_BUTTON_SIZES.has(size)
    const spinner = <Loader2 aria-hidden="true" className="animate-spin" />

    return (
      <button
        {...props}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={isLoading ? true : ariaBusy}
        disabled={disabled || isLoading}
        type={type ?? "button"}
      >
        {isLoading && isIconOnly ? spinner : (
          <>
            {isLoading ? spinner : null}
            {children}
          </>
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

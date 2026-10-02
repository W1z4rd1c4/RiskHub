import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge taught the named design-token scales from tailwind.config.js
 * (audit 2026-09-30 §4.5–4.6). Without this, `cn()` treats `shadow-glass` /
 * `shadow-popover` as shadow colours and keeps both sides of a conflict, keeps
 * both `z-*` / `duration-*` / `max-w-*` token and stock classes, and drops
 * `.text-eyebrow` whenever a text colour follows it.
 *
 * `.text-eyebrow` is a component-layer recipe, so any utility it sets (size,
 * line-height, weight, case, tracking, colour) would beat it in CSS. A later
 * `text-eyebrow` therefore removes those earlier utilities (e.g. a primitive's
 * base `text-sm`), while a later utility still overrides the eyebrow on purpose
 * (`text-eyebrow text-foreground` keeps both).
 */
const twMerge = extendTailwindMerge<"text-eyebrow">({
    extend: {
        theme: {
            shadow: ["glass", "popover"],
        },
        classGroups: {
            z: [{ z: ["sidebar", "header", "skiplink", "overlay", "modal", "modal-overlay", "popover", "toast"] }],
            duration: [{ duration: ["fast", "base", "slow"] }],
            "max-w": [{ "max-w": ["page", "form", "prose"] }],
            "text-eyebrow": ["text-eyebrow"],
        },
        conflictingClassGroups: {
            "text-eyebrow": ["font-size", "leading", "font-weight", "text-transform", "tracking", "text-color"],
        },
    },
})

/**
 * Combines class names using clsx and tailwind-merge
 * Standard shadcn/ui utility for conditional class names
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

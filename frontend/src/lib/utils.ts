import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names using clsx and tailwind-merge
 * Standard shadcn/ui utility for conditional class names
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

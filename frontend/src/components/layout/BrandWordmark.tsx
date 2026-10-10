import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface BrandWordmarkProps extends HTMLAttributes<HTMLSpanElement> {
    /** Colour (and decoration) of the accented "Hub" half; defaults to the accent text token. */
    accentClassName?: string;
}

/**
 * The single RiskHub wordmark (audit 2026-09-30 §4.20, DS-24 / NAV-07): "Risk" plus an
 * accented "Hub". The product name is not translated; size, weight and tracking come
 * from the caller (`className`), so the Sidebar, the public frame and the pre-auth
 * pages share one markup and one accessible name ("RiskHub").
 */
export function BrandWordmark({ className, accentClassName = 'text-accent-text', ...props }: BrandWordmarkProps) {
    return (
        <span {...props} className={cn('whitespace-nowrap', className)}>
            Risk<span className={accentClassName}>Hub</span>
        </span>
    );
}

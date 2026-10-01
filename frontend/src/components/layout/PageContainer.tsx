import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The one page container (audit 2026-09-30 §4.6, D11, DS-16).
 *
 * `MainLayout`'s `<main>` owns the gutter, so pages never add outer padding;
 * this caps the content width (`max-w-page` 1520px, forms `max-w-form` 960px,
 * long text `max-w-prose`) and sets the page-section rhythm (`space-y-8`).
 */
const SIZE_CLASS = {
    default: 'mx-auto w-full max-w-page space-y-8',
    form: 'mx-auto w-full max-w-form space-y-8',
    prose: 'max-w-prose',
} as const;

export type PageContainerSize = keyof typeof SIZE_CLASS;

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
    size?: PageContainerSize;
    children: ReactNode;
}

export function PageContainer({ size = 'default', className, children, ...props }: PageContainerProps) {
    return (
        <div {...props} className={cn(SIZE_CLASS[size], className)}>
            {children}
        </div>
    );
}

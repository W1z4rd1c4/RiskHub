import type { ReactNode } from 'react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

/**
 * Read-only label/value pairs on detail pages (audit 2026-09-30 §4.5, §4.14):
 * `<dl>` / `<dt>` / `<dd>` semantics, never `<label>`. Put `DetailField`s inside
 * one `DetailFieldList`; the label uses the `.text-eyebrow` role.
 */
export function DetailFieldList({ children, className }: { children: ReactNode; className?: string }) {
    return <dl className={cn('grid grid-cols-1 gap-5 md:grid-cols-2', className)}>{children}</dl>;
}

interface DetailFieldProps {
    label: ReactNode;
    /** Empty values (`null`, `undefined`, `''`) render a dash announced as "Not set". */
    value: ReactNode;
    /** `data-testid` on the value (`dd`). */
    testId?: string;
    /** Layout classes for the pair, e.g. `md:col-span-2` for long text. */
    className?: string;
}

export function DetailField({ label, value, testId, className }: DetailFieldProps) {
    const { t } = useTranslation('common');
    const isEmpty = value === null || value === undefined || value === '';

    return (
        <div className={cn('min-w-0 space-y-1', className)}>
            <dt className="text-eyebrow">{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm text-foreground" data-testid={testId}>
                {isEmpty ? (
                    <>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">{t('fallbacks.not_set')}</span>
                    </>
                ) : value}
            </dd>
        </div>
    );
}

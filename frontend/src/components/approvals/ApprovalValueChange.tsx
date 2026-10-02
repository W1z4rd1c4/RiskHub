import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

interface ApprovalValueChangeProps {
    before: ReactNode;
    after: ReactNode;
    /** Extra classes for both values (e.g. `break-words`). */
    valueClassName?: string;
}

/**
 * One before → after value pair in an approval diff (audit 2026-09-30 GAP-D-25).
 * The change does not rely on colour and strike-through alone: the old value is a
 * `<del>`, the new one an `<ins>`, and each carries a visually hidden "Old value" /
 * "New value" prefix, so screen readers announce which is which. Colours are the
 * standalone-text status tokens (removed `text-destructive`, added `text-success-text`).
 * Renders three siblings (old, decorative arrow, new); the caller's container owns
 * the layout (`flex` or `grid-cols-[1fr_auto_1fr]`).
 */
export function ApprovalValueChange({ before, after, valueClassName }: ApprovalValueChangeProps) {
    const { t } = useTranslation('approvals');
    return (
        <>
            <del className={cn('text-destructive', valueClassName)}>
                <span className="sr-only">{t('approvals:changes.old_value')}: </span>
                {before}
            </del>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <ins className={cn('font-bold text-success-text no-underline', valueClassName)}>
                <span className="sr-only">{t('approvals:changes.new_value')}: </span>
                {after}
            </ins>
        </>
    );
}

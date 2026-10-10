/**
 * Reusable table error state (issue #70, N17 / C3 / C4).
 *
 * A localized error message + retry affordance for tables and table-like
 * screens. Consumed by #61/#62 and later integrations. Revert all consumers
 * before reverting this module.
 */
import { ErrorState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { TableErrorStateProps } from './types';

/**
 * Table-contract adapter over the shared `ErrorState` (audit 2026-09-30
 * §4.15): table copy defaults (`common.tables.error.*`), `block` replaces the
 * table, `banner` sits above stale rows.
 */
export function TableErrorState({
    onRetry,
    message,
    retryLabel,
    variant = 'block',
    isRetrying = false,
    className,
    testId,
}: TableErrorStateProps) {
    const { t } = useTranslation('common');

    return (
        <ErrorState
            layout="section"
            variant={variant}
            message={message ?? t('tables.error.message')}
            onRetry={onRetry}
            retryLabel={retryLabel ?? t('tables.error.retry')}
            isRetrying={isRetrying}
            className={cn(variant === 'block' && 'glass-card', className)}
            testId={testId}
        />
    );
}

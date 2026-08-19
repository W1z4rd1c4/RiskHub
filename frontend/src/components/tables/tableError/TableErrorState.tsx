/**
 * Reusable table error state (issue #70, N17 / C3 / C4).
 *
 * A localized error message + retry affordance for tables and table-like
 * screens. Consumed by #61/#62 and later integrations. Revert all consumers
 * before reverting this module.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

import type { TableErrorStateProps } from './types';

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
    const resolvedMessage = message ?? t('tables.error.message');
    const resolvedRetryLabel = retryLabel ?? t('tables.error.retry');

    const retryButton = onRetry ? (
        <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className={cn(
                'flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50',
                variant === 'block' && 'mx-auto',
            )}
        >
            <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} aria-hidden="true" />
            {resolvedRetryLabel}
        </button>
    ) : null;

    if (variant === 'banner') {
        return (
            <div
                role="alert"
                data-testid={testId}
                className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3',
                    className,
                )}
            >
                <span className="flex items-center gap-2 text-sm text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {resolvedMessage}
                </span>
                {retryButton}
            </div>
        );
    }

    return (
        <div
            role="alert"
            data-testid={testId}
            className={cn('glass-card py-12 text-center', className)}
        >
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-400" aria-hidden="true" />
            <p className="mb-4 text-slate-400">{resolvedMessage}</p>
            {retryButton}
        </div>
    );
}

import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';

interface WidgetShellProps {
    title: string;
    isLoading?: boolean;
    error?: Error | null;
    isEmpty?: boolean;
    emptyLabel?: string;
    className?: string;
    loadingFallback?: ReactNode;
    errorFallback?: ReactNode;
    emptyFallback?: ReactNode;
    children: ReactNode;
}

/**
 * Labelled dashboard widget region. The default loading, error and empty
 * branches are the shared, announced state primitives (audit §4.15,
 * GAP-D-20); the error default shows a translated message, never the raw
 * `error.message`.
 */
export function WidgetShell({
    title,
    isLoading = false,
    error = null,
    isEmpty = false,
    emptyLabel,
    className,
    loadingFallback,
    errorFallback,
    emptyFallback,
    children,
}: WidgetShellProps) {
    const { t } = useTranslation('common');

    if (isLoading) {
        return loadingFallback ?? (
            <LoadingState layout="section" label={t('loading.named', { name: title })} testId="widget-loading" />
        );
    }
    if (error) {
        return errorFallback ?? <ErrorState layout="section" title={title} testId="widget-error" />;
    }
    if (isEmpty) {
        return emptyFallback ?? (
            <EmptyState layout="section" title={emptyLabel ?? t('empty.no_data')} testId="widget-empty" />
        );
    }
    return <section aria-label={title} className={className}>{children}</section>;
}

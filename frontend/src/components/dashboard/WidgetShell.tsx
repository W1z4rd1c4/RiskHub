import type { ReactNode } from 'react';

import i18n from '@/i18n';

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
    if (isLoading) {
        return loadingFallback ?? <div data-testid="widget-loading">{title}: {i18n.t('loading.generic')}</div>;
    }
    if (error) {
        return errorFallback ?? <div data-testid="widget-error">{title}: {error.message}</div>;
    }
    if (isEmpty) {
        return emptyFallback ?? <div data-testid="widget-empty">{emptyLabel ?? `${title}: ${i18n.t('empty.no_data')}`}</div>;
    }
    return <section aria-label={title} className={className}>{children}</section>;
}

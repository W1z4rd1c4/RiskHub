import type { ReactNode } from 'react';

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
        return loadingFallback ?? <div data-testid="widget-loading">{title}: loading...</div>;
    }
    if (error) {
        return errorFallback ?? <div data-testid="widget-error">{title}: {error.message}</div>;
    }
    if (isEmpty) {
        return emptyFallback ?? <div data-testid="widget-empty">{emptyLabel ?? `${title}: no data`}</div>;
    }
    return <section aria-label={title} className={className}>{children}</section>;
}

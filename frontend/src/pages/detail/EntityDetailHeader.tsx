import type { ReactNode } from 'react';

import type { BreadcrumbItem } from '@/components/layout/Breadcrumbs';
import { PAGE_TITLE_CLASS, PageHeaderNavigation, type PageBackTarget } from '@/components/layout/PageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

interface EntityDetailHeaderProps {
    actions?: ReactNode;
    /** Labelled back navigation (D14); renders the shared `BackButton`. */
    back?: PageBackTarget;
    /** @deprecated Custom back node kept for existing callers; prefer `back`. */
    backAction?: ReactNode;
    /** Breadcrumb trail (D14, NAV-02); the last item is the current record. */
    breadcrumbs?: readonly BreadcrumbItem[];
    description?: ReactNode;
    /** `document.title` page name; defaults to `title` when it is a string (NAV-01). */
    documentTitle?: string;
    identifier?: ReactNode;
    /** Defaults to `common:detail_header.identifier_separator`. */
    identifierSeparatorLabel?: string;
    metadata?: ReactNode;
    statuses?: ReactNode;
    supplementary?: ReactNode;
    title: ReactNode;
    titleAdornment?: ReactNode;
}

/**
 * Canonical entity detail header (audit 2026-09-30 §4.14, D7): the page `h1`
 * with the shared title recipe, labelled back control, breadcrumbs and the
 * per-route `document.title`.
 */
export function EntityDetailHeader({
    actions,
    back,
    backAction,
    breadcrumbs,
    description,
    documentTitle,
    identifier,
    identifierSeparatorLabel,
    metadata,
    statuses,
    supplementary,
    title,
    titleAdornment,
}: EntityDetailHeaderProps) {
    const { t } = useTranslation('common');
    usePageTitle(documentTitle ?? (typeof title === 'string' ? title : null));
    const hasIdentifier = identifier !== null && identifier !== undefined && identifier !== '';

    return (
        <header className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
                {back || breadcrumbs?.length ? (
                    <div className="mb-4">
                        <PageHeaderNavigation back={back} breadcrumbs={breadcrumbs} />
                    </div>
                ) : null}
                {backAction ? (
                    <div className="mb-4 min-w-0 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                        {backAction}
                    </div>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    {hasIdentifier ? (
                        <>
                            <span className="max-w-full break-all text-sm font-bold text-muted-foreground">
                                {identifier}
                            </span>
                            <span
                                role="separator"
                                aria-label={identifierSeparatorLabel ?? t('detail_header.identifier_separator')}
                                className="text-muted-foreground"
                            >
                                ·
                            </span>
                        </>
                    ) : null}
                    <h1
                        tabIndex={-1}
                        data-page-title=""
                        className={cn(PAGE_TITLE_CLASS, 'min-w-0 max-w-full break-words [overflow-wrap:anywhere]')}
                    >
                        {title}
                    </h1>
                    {titleAdornment}
                    {statuses ? (
                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                            {statuses}
                        </div>
                    ) : null}
                </div>
                {metadata ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 break-words text-sm font-medium text-muted-foreground [overflow-wrap:anywhere]">
                        {metadata}
                    </div>
                ) : null}
                {description ? (
                    <div className="max-w-3xl whitespace-pre-wrap break-words font-medium text-muted-foreground [overflow-wrap:anywhere]">
                        {description}
                    </div>
                ) : null}
                {supplementary ? (
                    <div className="flex min-w-0 max-w-full flex-wrap gap-2 pt-1 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                        {supplementary}
                    </div>
                ) : null}
            </div>
            {actions ? (
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 [&>*]:max-w-full [&>*]:break-words [&>*]:whitespace-normal [&>*]:[overflow-wrap:anywhere]">
                    {actions}
                </div>
            ) : null}
        </header>
    );
}

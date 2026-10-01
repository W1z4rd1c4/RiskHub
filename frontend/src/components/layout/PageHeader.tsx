import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { To } from 'react-router-dom';

import { BackButton } from '@/components/ui/BackButton';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';

import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

/**
 * Page title recipe (audit 2026-09-30 §4.5, D7): the only `h1` style. Shared
 * with `EntityDetailHeader`. `tabIndex={-1}` + `data-page-title` let the layout
 * move focus to the title after a route change (§4.14).
 */
export const PAGE_TITLE_CLASS = 'font-heading text-3xl font-bold tracking-tight text-foreground';

/** Labelled back navigation; `label` names the destination (D14, AX-06). */
export type PageBackTarget =
    | { label: string; to: To; state?: unknown }
    | { label: string; onClick: () => void };

export function PageBackButton({ back, className }: { back: PageBackTarget; className?: string }) {
    const shared = {
        label: back.label,
        variant: 'ghost',
        size: 'compact',
        className: cn('-ml-3 text-muted-foreground', className),
    } as const;
    return 'to' in back
        ? <BackButton {...shared} to={back.to} state={back.state} />
        : <BackButton {...shared} onClick={back.onClick} />;
}

/** Back control and breadcrumb trail above a page or entity title. */
export function PageHeaderNavigation({ back, breadcrumbs }: { back?: PageBackTarget; breadcrumbs?: readonly BreadcrumbItem[] }) {
    if (!back && !breadcrumbs?.length) return null;
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            {back ? <PageBackButton back={back} /> : null}
            {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
        </div>
    );
}

export interface PageHeaderProps {
    title: ReactNode;
    /** `document.title` page name; defaults to `title` when it is a string (D14, NAV-01). */
    documentTitle?: string;
    eyebrow?: ReactNode;
    description?: ReactNode;
    /** Decorative page icon shown in an accent tile. */
    icon?: LucideIcon;
    back?: PageBackTarget;
    /** Detail and edit pages (D14); the last item is the current page. */
    breadcrumbs?: readonly BreadcrumbItem[];
    /** Page actions; they wrap below the title on narrow widths. */
    actions?: ReactNode;
    titleId?: string;
    className?: string;
    'data-testid'?: string;
}

/**
 * Page header for registers, dashboards, settings, admin, approvals and
 * New/Edit forms (audit §4.14, D7): exactly one `h1`, one title recipe, a
 * labelled back control, breadcrumbs, and the per-route `document.title`.
 * Entity detail pages use `EntityDetailHeader`, which shares the recipe.
 */
export function PageHeader({
    title,
    documentTitle,
    eyebrow,
    description,
    icon: Icon,
    back,
    breadcrumbs,
    actions,
    titleId,
    className,
    'data-testid': testId,
}: PageHeaderProps) {
    usePageTitle(documentTitle ?? (typeof title === 'string' ? title : null));

    return (
        <header className={cn('space-y-4', className)} data-testid={testId}>
            <PageHeaderNavigation back={back} breadcrumbs={breadcrumbs} />
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                    {Icon ? (
                        <div className="shrink-0 rounded-xl bg-accent/10 p-3 text-accent-text">
                            <Icon aria-hidden="true" className="size-5" />
                        </div>
                    ) : null}
                    <div className="min-w-0 space-y-1">
                        {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
                        <h1
                            id={titleId}
                            tabIndex={-1}
                            data-page-title=""
                            className={cn(PAGE_TITLE_CLASS, 'break-words [overflow-wrap:anywhere]')}
                        >
                            {title}
                        </h1>
                        {description ? <div className="font-medium text-muted-foreground">{description}</div> : null}
                    </div>
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
            </div>
        </header>
    );
}

import { ChevronRight } from 'lucide-react';
import { Link, type To } from 'react-router-dom';

import { useTranslation } from '@/i18n/hooks';

export interface BreadcrumbItem {
    label: string;
    /** Destination; omit for a non-navigable level. The last item is always the current page. */
    to?: To;
}

interface BreadcrumbsProps {
    items: readonly BreadcrumbItem[];
    /** Landmark name; defaults to `common:breadcrumbs.label`. */
    label?: string;
    className?: string;
}

/**
 * Breadcrumb trail for detail and edit pages (audit 2026-09-30 §4.14, D14,
 * NAV-02): a named `nav` landmark with an ordered list; the last item is the
 * current page (`aria-current="page"`, not a link).
 */
export function Breadcrumbs({ items, label, className }: BreadcrumbsProps) {
    const { t } = useTranslation('common');
    if (items.length === 0) return null;

    return (
        <nav aria-label={label ?? t('breadcrumbs.label')} className={className}>
            <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                {items.map((item, index) => {
                    const isCurrent = index === items.length - 1;
                    return (
                        <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1.5">
                            {index > 0 ? <ChevronRight aria-hidden="true" className="size-4 shrink-0" /> : null}
                            {isCurrent ? (
                                <span aria-current="page" className="min-w-0 break-words font-medium text-foreground">
                                    {item.label}
                                </span>
                            ) : item.to !== undefined ? (
                                <Link
                                    to={item.to}
                                    className="rounded underline-offset-4 transition-colors duration-base hover:text-foreground hover:underline focus-ring"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span>{item.label}</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

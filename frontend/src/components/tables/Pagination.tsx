/**
 * Pagination - the one pager (audit 2026-09-30 §4.13, D14, DS-29).
 *
 * Modes:
 * - `pages` (default): range summary, previous / next and up to five page buttons.
 * - `compact`: the same summary with previous / next only (dense toolbars).
 * - `cursor`: previous / next for server cursors that know no page count
 *   (Approvals, Notifications, KRI history), with an optional summary.
 *
 * Renders a named `<nav>`; the current page carries `aria-current="page"`; every
 * control is a `Button` (`iconCompact`), so styling comes from the theme tokens.
 */
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

export type PaginationMode = 'pages' | 'compact' | 'cursor';

interface PaginationBaseProps {
    className?: string;
    /** Accessible name of the `<nav>`; defaults to `common:pagination.label`. */
    ariaLabel?: string;
}

export interface PagedPaginationProps extends PaginationBaseProps {
    mode?: 'pages' | 'compact';
    currentPage: number;
    totalPages: number;
    totalItems?: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
}

export interface CursorPaginationProps extends PaginationBaseProps {
    mode: 'cursor';
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    /** Optional status text, e.g. "Showing 20 notifications". */
    summary?: ReactNode;
    /** Disables both controls while a page is loading. */
    isLoading?: boolean;
}

export type PaginationProps = PagedPaginationProps | CursorPaginationProps;

const PAGE_WINDOW = 5;

function visiblePages(currentPage: number, totalPages: number): number[] {
    return Array.from({ length: Math.min(PAGE_WINDOW, totalPages) }, (_, i) => {
        if (totalPages <= PAGE_WINDOW || currentPage <= 3) return i + 1;
        if (currentPage >= totalPages - 2) return totalPages - (PAGE_WINDOW - 1) + i;
        return currentPage - 2 + i;
    });
}

interface StepButtonsProps {
    canGoPrev: boolean;
    canGoNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    children?: ReactNode;
}

function StepButtons({ canGoPrev, canGoNext, onPrev, onNext, children }: StepButtonsProps) {
    const { t } = useTranslation('common');
    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="iconCompact"
                onClick={onPrev}
                disabled={!canGoPrev}
                aria-label={t('actions.previous')}
                title={t('actions.previous')}
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            {children}
            <Button
                variant="outline"
                size="iconCompact"
                onClick={onNext}
                disabled={!canGoNext}
                aria-label={t('actions.next')}
                title={t('actions.next')}
            >
                <ChevronRight aria-hidden="true" />
            </Button>
        </div>
    );
}

function PagedSummary({ currentPage, totalPages, totalItems, itemsPerPage }: PagedPaginationProps) {
    const { t } = useTranslation('common');
    if (totalItems === undefined) {
        return (
            <>
                {t('pagination.page')} <span className="font-medium text-foreground">{currentPage}</span> {t('pagination.of')}{' '}
                <span className="font-medium text-foreground">{totalPages}</span>
            </>
        );
    }
    if (totalItems <= 0) {
        return <>{t('labels.no_results')}</>;
    }
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    return (
        <>
            {t('pagination.showing')} <span className="font-medium text-foreground">{startItem}</span> {t('pagination.to')}{' '}
            <span className="font-medium text-foreground">{endItem}</span> {t('pagination.of')}{' '}
            <span className="font-medium text-foreground">{totalItems}</span> {t('labels.results')}
        </>
    );
}

export function Pagination(props: PaginationProps) {
    const { t } = useTranslation('common');
    const navLabel = props.ariaLabel ?? t('pagination.label');

    if (props.mode === 'cursor') {
        const { hasPrevious, hasNext, onPrevious, onNext, summary, isLoading = false, className } = props;
        return (
            <nav aria-label={navLabel} className={cn('flex items-center justify-between gap-4', className)}>
                <div className="text-sm text-muted-foreground">{summary}</div>
                <StepButtons
                    canGoPrev={hasPrevious && !isLoading}
                    canGoNext={hasNext && !isLoading}
                    onPrev={onPrevious}
                    onNext={onNext}
                />
            </nav>
        );
    }

    const { mode = 'pages', currentPage, totalPages, onPageChange, className } = props;
    const canGoPrev = currentPage > 1;
    const canGoNext = currentPage < totalPages;

    return (
        <nav aria-label={navLabel} className={cn('flex items-center justify-between gap-4', className)}>
            <div className="text-sm text-muted-foreground">
                <PagedSummary {...props} />
            </div>
            <StepButtons
                canGoPrev={canGoPrev}
                canGoNext={canGoNext}
                onPrev={() => onPageChange(currentPage - 1)}
                onNext={() => onPageChange(currentPage + 1)}
            >
                {mode === 'pages' ? (
                    <div className="flex items-center gap-1">
                        {visiblePages(currentPage, totalPages).map((pageNum) => {
                            const isCurrent = currentPage === pageNum;
                            return (
                                <Button
                                    key={pageNum}
                                    variant={isCurrent ? 'accent' : 'ghost'}
                                    size="iconCompact"
                                    onClick={() => onPageChange(pageNum)}
                                    aria-label={t('pagination.go_to_page', { page: pageNum })}
                                    aria-current={isCurrent ? 'page' : undefined}
                                    className={cn('tabular-nums', !isCurrent && 'text-muted-foreground')}
                                >
                                    {pageNum}
                                </Button>
                            );
                        })}
                    </div>
                ) : null}
            </StepButtons>
        </nav>
    );
}

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
    /**
     * Blocks every control while a page is loading. Previous / next stay
     * focusable (`aria-disabled`, click ignored) so the control the user just
     * pressed keeps keyboard focus; only a boundary (no page there) disables.
     */
    isLoading?: boolean;
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
    /** Direction-specific names, e.g. "Newer entries" / "Older entries"; default to previous / next page. */
    previousLabel?: string;
    nextLabel?: string;
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
    /** A previous / next page exists. */
    canGoPrev: boolean;
    canGoNext: boolean;
    isLoading: boolean;
    onPrev: () => void;
    onNext: () => void;
    previousLabel?: string;
    nextLabel?: string;
    children?: ReactNode;
}

function StepButtons({ canGoPrev, canGoNext, isLoading, onPrev, onNext, previousLabel, nextLabel, children }: StepButtonsProps) {
    const { t } = useTranslation('common');
    const prevName = previousLabel ?? t('pagination.previous_page');
    const nextName = nextLabel ?? t('pagination.next_page');
    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="iconCompact"
                onClick={() => {
                    if (canGoPrev && !isLoading) onPrev();
                }}
                disabled={!canGoPrev && !isLoading}
                aria-disabled={!canGoPrev || isLoading || undefined}
                aria-label={prevName}
                title={prevName}
            >
                <ChevronLeft aria-hidden="true" />
            </Button>
            {children}
            <Button
                variant="outline"
                size="iconCompact"
                onClick={() => {
                    if (canGoNext && !isLoading) onNext();
                }}
                disabled={!canGoNext && !isLoading}
                aria-disabled={!canGoNext || isLoading || undefined}
                aria-label={nextName}
                title={nextName}
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
        const { hasPrevious, hasNext, onPrevious, onNext, summary, previousLabel, nextLabel, isLoading = false, className } = props;
        return (
            <nav aria-label={navLabel} className={cn('flex items-center justify-between gap-4', className)}>
                <div className="text-sm text-muted-foreground">{summary}</div>
                <StepButtons
                    canGoPrev={hasPrevious}
                    canGoNext={hasNext}
                    isLoading={isLoading}
                    onPrev={onPrevious}
                    onNext={onNext}
                    previousLabel={previousLabel}
                    nextLabel={nextLabel}
                />
            </nav>
        );
    }

    const { mode = 'pages', currentPage, totalPages, onPageChange, isLoading = false, className } = props;
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
                isLoading={isLoading}
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
                                    disabled={isLoading && !isCurrent}
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

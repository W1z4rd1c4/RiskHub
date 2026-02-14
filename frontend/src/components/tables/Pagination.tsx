/**
 * Pagination - Page navigation with "Page X of Y" display.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { cn } from '@/lib/utils';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems?: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export function Pagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    className,
}: PaginationProps) {
    const { t } = useTranslation('common');
    const canGoPrev = currentPage > 1;
    const canGoNext = currentPage < totalPages;
    const hasItems = totalItems !== undefined && totalItems > 0;
    const startItem = hasItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const endItem = hasItems ? Math.min(currentPage * itemsPerPage, totalItems ?? currentPage * itemsPerPage) : 0;

    return (
        <div className={cn('flex items-center justify-between', className)}>
            <div className="text-sm text-slate-400">
                {totalItems !== undefined ? (
                    hasItems ? (
                        <>
                            {t('pagination.showing')} <span className="font-medium text-white">{startItem}</span> {t('pagination.to')}{' '}
                            <span className="font-medium text-white">{endItem}</span> {t('pagination.of')}{' '}
                            <span className="font-medium text-white">{totalItems}</span> {t('labels.results')}
                        </>
                    ) : (
                        <>{t('labels.no_results')}</>
                    )
                ) : (
                    <>
                        {t('pagination.page')} <span className="font-medium text-white">{currentPage}</span> {t('pagination.of')}{' '}
                        <span className="font-medium text-white">{totalPages}</span>
                    </>
                )}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={!canGoPrev}
                    className={cn(
                        'p-2 rounded-lg transition-all duration-200',
                        canGoPrev
                            ? 'glass hover:bg-white/10 text-white'
                            : 'text-slate-600 cursor-not-allowed'
                    )}
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                            pageNum = i + 1;
                        } else if (currentPage <= 3) {
                            pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                        } else {
                            pageNum = currentPage - 2 + i;
                        }

                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={cn(
                                    'w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200',
                                    currentPage === pageNum
                                        ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                        : 'glass hover:bg-white/10 text-slate-400 hover:text-white'
                                )}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={!canGoNext}
                    className={cn(
                        'p-2 rounded-lg transition-all duration-200',
                        canGoNext
                            ? 'glass hover:bg-white/10 text-white'
                            : 'text-slate-600 cursor-not-allowed'
                    )}
                >
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}

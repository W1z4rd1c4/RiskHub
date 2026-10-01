import type { Dispatch, SetStateAction } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

import { calculatePageWindow } from './activityLogPresentation';

interface ActivityLogPaginationProps {
    page: number;
    setPage: Dispatch<SetStateAction<number>>;
    limit: number;
    total: number;
    isLoading: boolean;
}

export function ActivityLogPagination({ page, setPage, limit, total, isLoading }: ActivityLogPaginationProps) {
    const { t } = useTranslation('common');
    const totalPages = Math.ceil(total / limit);
    const pageWindow = calculatePageWindow(page, totalPages);

    return (
        <div className="flex items-center justify-between px-2 text-muted-foreground">
            <div className="text-sm">
                {t('pagination.showing_range', {
                    start: total === 0 ? 0 : page * limit + 1,
                    end: Math.min((page + 1) * limit, total),
                    total,
                })}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                    disabled={page === 0 || isLoading}
                    aria-label={t('pagination.previous_page')}
                    className="rounded-xl bg-tint/5 p-2 transition-all hover:bg-tint/10 disabled:opacity-30 disabled:hover:bg-tint/5"
                >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-1">
                    {pageWindow.map((item, index) =>
                        item === 'ellipsis' ? (
                            <span key={`ellipsis-${index}`} className="px-1 text-muted-foreground" aria-hidden="true">
                                ...
                            </span>
                        ) : (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setPage(item)}
                                aria-label={t('pagination.go_to_page', { page: item + 1 })}
                                aria-current={page === item ? 'page' : undefined}
                                className={`h-9 w-9 rounded-xl text-sm transition-all ${
                                    page === item ? 'bg-accent text-accent-foreground shadow-lg shadow-accent/20' : 'hover:bg-tint/10'
                                }`}
                            >
                                {item + 1}
                            </button>
                        ),
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setPage((currentPage) => currentPage + 1)}
                    disabled={(page + 1) * limit >= total || isLoading}
                    aria-label={t('pagination.next_page')}
                    className="rounded-xl bg-tint/5 p-2 transition-all hover:bg-tint/10 disabled:opacity-30 disabled:hover:bg-tint/5"
                >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

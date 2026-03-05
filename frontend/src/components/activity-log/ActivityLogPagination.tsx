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
        <div className="flex items-center justify-between px-2 text-slate-400">
            <div className="text-sm">
                {t('pagination.showing_range', {
                    start: total === 0 ? 0 : page * limit + 1,
                    end: Math.min((page + 1) * limit, total),
                    total,
                })}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                    disabled={page === 0 || isLoading}
                    className="rounded-xl bg-white/5 p-2 transition-all hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-1">
                    {pageWindow.map((item, index) =>
                        item === 'ellipsis' ? (
                            <span key={`ellipsis-${index}`} className="px-1 text-slate-600">
                                ...
                            </span>
                        ) : (
                            <button
                                key={item}
                                onClick={() => setPage(item)}
                                className={`h-9 w-9 rounded-xl text-sm transition-all ${
                                    page === item ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'hover:bg-white/10'
                                }`}
                            >
                                {item + 1}
                            </button>
                        ),
                    )}
                </div>
                <button
                    onClick={() => setPage((currentPage) => currentPage + 1)}
                    disabled={(page + 1) * limit >= total || isLoading}
                    className="rounded-xl bg-white/5 p-2 transition-all hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5"
                >
                    <ChevronRight className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}

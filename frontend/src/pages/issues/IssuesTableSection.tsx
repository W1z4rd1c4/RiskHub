import { useCallback, useMemo } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { CategoryDrillDown, Pagination, SortableTable, type Column, type SortDirection, type ViewMode } from '@/components/tables';
import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import type { IssueListFilters, IssueStatus, IssueSummary } from '@/types/issue';

import { buildIssueGroupedRows, formatIssueDateTime, type IssueGroupedRow } from './issuesPagePresentation';

interface IssuesTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: IssueSummary[];
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onRetry: () => void;
    onRowClick: (issue: IssueSummary) => void;
    onSortChange: (
        sortField: IssueListFilters['sort_by'] | null,
        sortDirection: SortDirection,
    ) => void;
    sortDirection: SortDirection;
    sortField: IssueListFilters['sort_by'] | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function IssuesTableSection({
    currentPage,
    errorKey,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onPageChange,
    onRetry,
    onRowClick,
    onSortChange,
    sortDirection,
    sortField,
    totalCount,
    totalPages,
    viewMode,
}: IssuesTableSectionProps) {
    const { t, i18n } = useTranslation('issues');

    const statusLabel = useCallback(
        (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' ')),
        [t]
    );

    const severityLabel = useCallback(
        (severity: IssueSummary['severity']): string => t(`severity.${severity}`, severity),
        [t]
    );

    const sourceLabel = useCallback(
        (sourceType: IssueSummary['source_type']): string => {
            return t(`source.${sourceType}`, sourceType.replaceAll('_', ' '));
        },
        [t]
    );

    const columns = useMemo<Column<IssueSummary>[]>(
        () => [
            {
                key: 'title',
                label: t('columns.issue'),
                sortable: true,
                render: (issue) => (
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{issue.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={issuePill(issueStatusClass(issue.status))}>
                                {statusLabel(issue.status)}
                            </span>
                            <span className={issuePill(issueSeverityClass(issue.severity))}>
                                {severityLabel(issue.severity)}
                            </span>
                        </div>
                    </div>
                ),
            },
            {
                key: 'department_name',
                label: t('columns.department'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.department_name || t('fallbacks.unknown_department')}
                    </span>
                ),
            },
            {
                key: 'owner_user_name',
                label: t('columns.owner'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.owner_user_name || t('fallbacks.unassigned')}
                    </span>
                ),
            },
            {
                key: 'source_type',
                label: t('columns.source'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">{sourceLabel(issue.source_type)}</span>
                ),
            },
            {
                key: 'due_at',
                label: t('columns.due'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {formatIssueDateTime(issue.due_at, i18n.language, t('fallbacks.not_set'))}
                    </span>
                ),
            },
            {
                key: 'opened_at',
                label: t('columns.opened'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {formatIssueDateTime(issue.opened_at, i18n.language, t('fallbacks.not_set'))}
                    </span>
                ),
            },
            {
                key: 'actions',
                label: '',
                render: () => (
                    <div className="flex items-center justify-end">
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                    </div>
                ),
            },
        ],
        [i18n.language, severityLabel, sourceLabel, statusLabel, t]
    );

    const groupedRows = useMemo(() => buildIssueGroupedRows(items, viewMode), [items, viewMode]);

    if (errorKey) {
        return (
            <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                <AlertCircle className="h-12 w-12 text-rose-500" />
                <div>
                    <p className="text-white font-bold text-xl">{t('errors.title')}</p>
                    <p className="text-slate-500 max-w-sm mx-auto">
                        {errorKey.startsWith('errorKeys.')
                            ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                            : t(errorKey)}
                    </p>
                </div>
                <button onClick={onRetry} className="text-accent font-bold hover:underline">
                    {t('actions.try_again')}
                </button>
            </div>
        );
    }

    if (!hasLoadedOnce && isLoading) {
        return (
            <div className="glass-card !p-0 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                            {columns.map((column) => (
                                <th
                                    key={String(column.key)}
                                    className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500"
                                >
                                    {column.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {[...Array(itemsPerPage)].map((_, index) => (
                            <tr
                                key={`issues-skeleton-${index}`}
                                className="border-b border-white/5 animate-pulse"
                            >
                                <td className="px-6 py-4">
                                    <div className="h-4 w-32 bg-white/5 rounded" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-20 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-20 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-16 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-24 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-5 w-24 bg-white/5 rounded-md" />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="h-4 w-4 bg-white/5 rounded ml-auto" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    if (viewMode === 'all') {
        return (
            <>
                <SortableTable
                    data={items}
                    columns={columns}
                    keyExtractor={(issue) => issue.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('list.empty')}
                    sortKey={sortField}
                    sortDirection={sortDirection}
                    onSort={(key, direction) =>
                        onSortChange((direction ? key : null) as IssueListFilters['sort_by'] | null, direction)
                    }
                />
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    itemsPerPage={itemsPerPage}
                    onPageChange={onPageChange}
                />
            </>
        );
    }

    return (
        <CategoryDrillDown
            data={groupedRows}
            groupBy={'groupValue'}
            keyExtractor={(row) => row.rowId}
            getStats={(groupItems) => ({ total: groupItems.length })}
            renderTable={(groupItems: IssueGroupedRow[]) => (
                <SortableTable
                    data={groupItems.map((row) => row.issue)}
                    columns={columns}
                    keyExtractor={(issue) => issue.id}
                    onRowClick={onRowClick}
                    emptyMessage={t('list.empty')}
                />
            )}
            renderItem={(row) => (
                <div
                    onClick={() => onRowClick(row.issue)}
                    className="px-6 py-4 hover:bg-white/5 cursor-pointer flex items-center justify-between"
                >
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{row.issue.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={issuePill(issueStatusClass(row.issue.status))}>
                                {statusLabel(row.issue.status)}
                            </span>
                            <span className={issuePill(issueSeverityClass(row.issue.severity))}>
                                {severityLabel(row.issue.severity)}
                            </span>
                        </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                </div>
            )}
        />
    );
}

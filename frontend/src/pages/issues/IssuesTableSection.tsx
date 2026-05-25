import { useCallback, useMemo } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { CollectionGroupDrillDown, Pagination, SortableTable, type Column, type SortDirection, type ViewMode } from '@/components/tables';
import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { buildRegisterTableModel } from '@/pages/shared/registerTablePresentation';
import type { CollectionGroup } from '@/types/collection';
import type { IssueListFilters, IssueStatus, IssueSummary } from '@/types/issue';

import { formatIssueDateTime, formatIssueGroupLabel } from './issuesPagePresentation';

interface IssuesTableSectionProps {
    currentPage: number;
    errorKey: string | null;
    groups: CollectionGroup[];
    hasLoadedOnce: boolean;
    isLoading: boolean;
    items: IssueSummary[];
    itemsPerPage: number;
    onBackFromGroup: () => void;
    onPageChange: (page: number) => void;
    onRetry: () => void;
    onRowClick: (issue: IssueSummary) => void;
    onSelectGroup: (groupValue: string, groupLabel: string) => void;
    onSortChange: (
        sortField: IssueListFilters['sort_by'] | null,
        sortDirection: SortDirection,
    ) => void;
    sortDirection: SortDirection;
    sortField: IssueListFilters['sort_by'] | null;
    selectedGroupLabel: string | null;
    selectedGroupValue: string | null;
    totalCount: number;
    totalPages: number;
    viewMode: ViewMode;
}

export function IssuesTableSection({
    currentPage,
    errorKey,
    groups,
    hasLoadedOnce,
    isLoading,
    items,
    itemsPerPage,
    onBackFromGroup,
    onPageChange,
    onRetry,
    onRowClick,
    onSelectGroup,
    onSortChange,
    sortDirection,
    sortField,
    selectedGroupLabel,
    selectedGroupValue,
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
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.department_name || t('fallbacks.unknown_department')}
                    </span>
                ),
            },
            {
                key: 'owner_user_name',
                label: t('columns.owner'),
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.owner_user_name || t('fallbacks.unassigned')}
                    </span>
                ),
            },
            {
                key: 'source_type',
                label: t('columns.source'),
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.source_display || sourceLabel(issue.source_type)}
                    </span>
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
    const emptyText = t('list.empty');
    const groupLabel = (group: CollectionGroup) =>
        formatIssueGroupLabel(group, {
            unlinkedVendor: t('fallbacks.unlinked_vendor'),
            uncategorized: t('fallbacks.uncategorized'),
            unknownDepartment: t('fallbacks.unknown_department'),
            noProcess: t('fallbacks.no_process'),
            unknownRiskType: t('common:fallbacks.unknown_type'),
        });
    const tableModel = buildRegisterTableModel({
        emptyText,
        groupPresentation: { groupLabel, hideActive: true },
        groups,
        isLoading,
        pagination: { currentPage, itemsPerPage, totalItems: totalCount, totalPages },
        rows: items,
        rowKey: (issue) => issue.id,
    });

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
                        {Array.from({ length: itemsPerPage }, (_, index) => (
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
                    data={tableModel.rows}
                    columns={columns}
                    keyExtractor={(issue) => issue.id}
                    onRowClick={onRowClick}
                    emptyMessage={tableModel.emptyText}
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
        <CollectionGroupDrillDown
            groups={groups}
            selectedGroupValue={selectedGroupValue}
            selectedGroupLabel={selectedGroupLabel}
            items={items}
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            onPageChange={onPageChange}
            onBack={onBackFromGroup}
            onSelectGroup={onSelectGroup}
            hideActive
            groupLabel={groupLabel}
            emptyMessage={tableModel.emptyText}
            renderTable={(groupItems) => (
                <SortableTable
                    data={groupItems}
                    columns={columns}
                    keyExtractor={(issue) => issue.id}
                    onRowClick={onRowClick}
                    emptyMessage={tableModel.emptyText}
                />
            )}
        />
    );
}

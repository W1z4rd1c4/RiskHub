import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ChevronRight, Download, Plus, RefreshCw, Search } from 'lucide-react';
import { SortableTable, Pagination } from '@/components/tables';
import type { Column, SortDirection } from '@/components/tables';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useTranslation } from '@/i18n/hooks';
import { ExportDialog, type ExportDialogSubmitPayload } from '@/components/reports/ExportDialog';
import { issuePill, issueSeverityClass, issueStatusClass } from '@/components/issues/issueUi';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/list';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePermissions } from '@/hooks/usePermissions';
import { issuesApi } from '@/services/issuesApi';
import { reportApi } from '@/services/reportApi';
import type { IssueListFilters, IssueSeverity, IssueSeverityFilter, IssueSeverityGroup, IssueStatus, IssueSummary } from '@/types/issue';

const ISSUE_STATUSES: IssueStatus[] = ['open', 'triaged', 'in_progress', 'ready_for_validation', 'closed'];
const ISSUE_SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];
const ISSUE_SEVERITY_GROUPS: IssueSeverityGroup[] = ['high_critical'];
const ISSUE_SORT_FIELDS: NonNullable<IssueListFilters['sort_by']>[] = ['title', 'severity', 'status', 'opened_at', 'due_at', 'updated_at', 'created_at'];

function parseBooleanQueryParam(value: string | null): boolean | null {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return null;
}

function parseIssueStatus(value: string | null): IssueStatus | null {
    if (!value) {
        return null;
    }
    return ISSUE_STATUSES.includes(value as IssueStatus) ? (value as IssueStatus) : null;
}

function parseIssueSeverity(value: string | null): IssueSeverity | null {
    if (!value) {
        return null;
    }
    return ISSUE_SEVERITIES.includes(value as IssueSeverity) ? (value as IssueSeverity) : null;
}

function parseIssueSeverityGroup(value: string | null): IssueSeverityGroup | null {
    if (!value) {
        return null;
    }
    return ISSUE_SEVERITY_GROUPS.includes(value as IssueSeverityGroup) ? (value as IssueSeverityGroup) : null;
}

function parseIssueSortField(value: string | null): IssueListFilters['sort_by'] | null {
    if (!value) {
        return null;
    }
    return ISSUE_SORT_FIELDS.includes(value as NonNullable<IssueListFilters['sort_by']>)
        ? (value as NonNullable<IssueListFilters['sort_by']>)
        : null;
}

function parseIssueSortOrder(value: string | null): SortDirection {
    if (value === 'asc' || value === 'desc') {
        return value;
    }
    return null;
}

function formatDateTime(value: string | null, locale: string, notSetLabel: string): string {
    if (!value) {
        return notSetLabel;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed);
}

export function IssuesPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { hasPermission } = usePermissions();
    const { t, i18n } = useTranslation('issues');
    const canRead = hasPermission('issues', 'read');
    const canWrite = hasPermission('issues', 'write');

    const initialStatusFilter = useMemo<IssueStatus | ''>(() => parseIssueStatus(searchParams.get('status')) ?? '', [searchParams]);
    const initialSeverityGroup = useMemo<IssueSeverityGroup | null>(() => parseIssueSeverityGroup(searchParams.get('severity_group')), [searchParams]);
    const initialSeverityFilter = useMemo<IssueSeverityFilter | ''>(() => {
        if (initialSeverityGroup) {
            return initialSeverityGroup;
        }
        return parseIssueSeverity(searchParams.get('severity')) ?? '';
    }, [initialSeverityGroup, searchParams]);
    const initialOverdueOnly = useMemo<boolean>(() => parseBooleanQueryParam(searchParams.get('overdue')) ?? false, [searchParams]);
    const initialExcludeActiveExceptions = useMemo<boolean>(
        () => parseBooleanQueryParam(searchParams.get('exclude_active_exceptions')) ?? false,
        [searchParams]
    );
    const initialIncludeClosed = useMemo<boolean>(() => {
        const parsedIncludeClosed = parseBooleanQueryParam(searchParams.get('include_closed'));
        return initialStatusFilter === 'closed' ? true : (parsedIncludeClosed ?? false);
    }, [initialStatusFilter, searchParams]);
    const initialSortField = useMemo<IssueListFilters['sort_by'] | null>(() => parseIssueSortField(searchParams.get('sort_by')), [searchParams]);
    const initialSortDirection = useMemo<SortDirection>(() => {
        if (!initialSortField) {
            return null;
        }
        return parseIssueSortOrder(searchParams.get('sort_order'));
    }, [initialSortField, searchParams]);

    const [items, setItems] = useState<IssueSummary[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>(initialStatusFilter);
    const [severityFilter, setSeverityFilter] = useState<IssueSeverityFilter | ''>(initialSeverityFilter);
    const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly);
    const [excludeActiveExceptions, setExcludeActiveExceptions] = useState(initialExcludeActiveExceptions);
    const [includeClosed, setIncludeClosed] = useState(initialIncludeClosed);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortField, setSortField] = useState<IssueListFilters['sort_by'] | null>(initialSortField);
    const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const latestRequestIdRef = useRef(0);
    const hasLoadedIssuesRef = useRef(false);

    const limit = DEFAULT_LIST_PAGE_SIZE;
    const debouncedSearch = useDebouncedValue(search, 300);

    const statusOptions: Array<{ label: string; value: IssueStatus }> = useMemo(
        () => [
            { label: t('status.open', 'Open'), value: 'open' },
            { label: t('status.triaged', 'Triaged'), value: 'triaged' },
            { label: t('status.in_progress', 'In progress'), value: 'in_progress' },
            { label: t('status.ready_for_validation', 'Ready for validation'), value: 'ready_for_validation' },
            { label: t('status.closed', 'Closed'), value: 'closed' },
        ],
        [t]
    );

    const severityOptions: Array<{ label: string; value: IssueSeverityFilter }> = useMemo(
        () => [
            { label: t('severity.low', 'Low'), value: 'low' },
            { label: t('severity.medium', 'Medium'), value: 'medium' },
            { label: t('severity.high', 'High'), value: 'high' },
            { label: t('severity.critical', 'Critical'), value: 'critical' },
            { label: t('severity.high_critical', 'High + Critical'), value: 'high_critical' },
        ],
        [t]
    );

    const statusLabel = useCallback(
        (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' ')),
        [t]
    );

    const severityLabel = useCallback(
        (severity: IssueSeverity): string => t(`severity.${severity}`, severity),
        [t]
    );

    const sourceLabel = useCallback(
        (sourceType: string): string => {
            const key = sourceType as 'manual' | 'control_execution' | 'kri_breach' | 'audit';
            return t(`source.${key}`, sourceType.replaceAll('_', ' '));
        },
        [t]
    );

    const listFilters = useMemo<IssueListFilters>(() => {
        const filters: IssueListFilters = {
            skip: (currentPage - 1) * limit,
            limit,
            include_closed: statusFilter === 'closed' ? true : includeClosed,
        };
        if (statusFilter) {
            filters.status = statusFilter;
        }
        if (severityFilter) {
            if (severityFilter === 'high_critical') {
                filters.severity_group = 'high_critical';
            } else {
                filters.severity = severityFilter;
            }
        }
        if (overdueOnly) {
            filters.overdue = true;
        }
        if (excludeActiveExceptions) {
            filters.exclude_active_exceptions = true;
        }
        if (debouncedSearch.trim()) {
            filters.search = debouncedSearch.trim();
        }
        if (sortField && sortDirection) {
            filters.sort_by = sortField;
            filters.sort_order = sortDirection;
        }
        return filters;
    }, [currentPage, debouncedSearch, excludeActiveExceptions, includeClosed, limit, overdueOnly, severityFilter, sortDirection, sortField, statusFilter]);

    const fetchIssues = useCallback(async () => {
        if (!canRead) {
            return;
        }

        const requestId = ++latestRequestIdRef.current;
        try {
            setIsLoading(true);
            const response = await issuesApi.list(listFilters);
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            setItems(response.items);
            setTotalCount(response.total);
            setError(null);
            hasLoadedIssuesRef.current = true;
        } catch (loadError) {
            if (requestId !== latestRequestIdRef.current) {
                return;
            }
            const message = loadError instanceof Error ? loadError.message : t('errors.load_failed', 'Failed to load issues');
            setError(message);
            setItems([]);
            setTotalCount(0);
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [canRead, listFilters, t]);

    useEffect(() => {
        fetchIssues();
    }, [fetchIssues]);

    const handleExport = async ({ format, asOfDate }: ExportDialogSubmitPayload) => {
        setIsExporting(true);
        try {
            await reportApi.exportIssues({
                format,
                asOfDate,
                filters: {
                    status: statusFilter || null,
                    severity: severityFilter && severityFilter !== 'high_critical' ? severityFilter : null,
                    severityGroup: severityFilter === 'high_critical' ? 'high_critical' : null,
                    overdueOnly: overdueOnly || null,
                    excludeActiveExceptions: excludeActiveExceptions || null,
                },
            });
            setIsExportDialogOpen(false);
        } catch (exportError) {
            const message = exportError instanceof Error ? exportError.message : t('errors.export_failed', 'Export failed');
            setError(message);
        } finally {
            setIsExporting(false);
        }
    };

    const columns: Column<IssueSummary>[] = useMemo(() => {
        return [
            {
                key: 'title',
                label: t('columns.issue', 'Issue'),
                sortable: true,
                render: (issue) => (
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{issue.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={issuePill(issueStatusClass(issue.status))}>{statusLabel(issue.status)}</span>
                            <span className={issuePill(issueSeverityClass(issue.severity))}>{severityLabel(issue.severity)}</span>
                        </div>
                    </div>
                ),
            },
            {
                key: 'department_name',
                label: t('columns.department', 'Department'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {issue.department_name || t('fallbacks.unknown_department', 'Unknown department')}
                    </span>
                ),
            },
            {
                key: 'owner_user_name',
                label: t('columns.owner', 'Owner'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">{issue.owner_user_name || t('fallbacks.unassigned', 'Unassigned')}</span>
                ),
            },
            {
                key: 'source_type',
                label: t('columns.source', 'Source'),
                sortable: true,
                render: (issue) => <span className="text-sm text-slate-300">{sourceLabel(issue.source_type)}</span>,
            },
            {
                key: 'due_at',
                label: t('columns.due', 'Due'),
                sortable: true,
                render: (issue) => (
                    <span className="text-sm text-slate-300">
                        {formatDateTime(issue.due_at, i18n.language, t('fallbacks.not_set', 'Not set'))}
                    </span>
                ),
            },
            {
                key: 'opened_at',
                label: t('columns.opened', 'Opened'),
                sortable: true,
                render: (issue) => <span className="text-sm text-slate-300">{formatDateTime(issue.opened_at, i18n.language, t('fallbacks.not_set', 'Not set'))}</span>,
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
        ];
    }, [i18n.language, severityLabel, sourceLabel, statusLabel, t]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    if (!canRead) {
        return (
            <div className="glass-card p-8 flex items-center gap-3 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <span>{t('permissions.view_denied', 'You do not have permission to view issues.')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2">{t('title', 'Issues')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle', 'Track remediation, exceptions, and closure validation.')}</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsExportDialogOpen(true)}
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('common:actions.export', 'Export')}
                    </button>
                    {canWrite && (
                        <button
                            type="button"
                            onClick={() => navigate('/issues/new')}
                            className="btn-primary"
                        >
                            <Plus className="h-5 w-5" />
                            {t('actions.new_issue', 'New Issue')}
                        </button>
                    )}
                </div>
            </div>

            <div className="glass-card flex flex-col md:flex-row md:items-center gap-4">
                <div className="md:flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex items-center gap-3 group focus-within:border-accent/50 transition-all min-w-0">
                    <Search className="h-4 w-4 text-slate-500 group-focus-within:text-accent transition-colors shrink-0" />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => {
                            setSearch(event.target.value);
                            setCurrentPage(1);
                        }}
                        placeholder={t('filters.search_placeholder', 'Search by title or description')}
                        className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                    />
                </div>

                <div className="flex w-full md:w-auto items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap">
                    <ThemedSelect
                        value={statusFilter}
                        onValueChange={(value) => {
                            const next = value as IssueStatus | '';
                            setStatusFilter(next);
                            if (next === 'closed') {
                                setIncludeClosed(true);
                            }
                            setCurrentPage(1);
                        }}
                        options={statusOptions.map((option) => ({ value: option.value, label: option.label }))}
                        allowEmpty
                        emptyLabel={t('filters.all_statuses', 'All statuses')}
                        placeholder={t('filters.all_statuses', 'All statuses')}
                        className="w-[170px]"
                    />
                    <ThemedSelect
                        value={severityFilter}
                        onValueChange={(value) => {
                            setSeverityFilter(value as IssueSeverityFilter | '');
                            setCurrentPage(1);
                        }}
                        options={severityOptions.map((option) => ({ value: option.value, label: option.label }))}
                        allowEmpty
                        emptyLabel={t('filters.all_severities', 'All severities')}
                        placeholder={t('filters.all_severities', 'All severities')}
                        className="w-[170px]"
                    />
                    <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={overdueOnly}
                            onChange={(event) => {
                                setOverdueOnly(event.target.checked);
                                setCurrentPage(1);
                            }}
                            className="accent-accent"
                        />
                        {t('filters.overdue_only', 'Overdue only')}
                    </label>
                    <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={excludeActiveExceptions}
                            onChange={(event) => {
                                setExcludeActiveExceptions(event.target.checked);
                                setCurrentPage(1);
                            }}
                            className="accent-accent"
                        />
                        {t('filters.exclude_active_exceptions', 'Exclude active exceptions')}
                    </label>
                    <label className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 flex items-center gap-2 text-sm text-slate-300 whitespace-nowrap">
                        <input
                            type="checkbox"
                            checked={includeClosed}
                            onChange={(event) => {
                                setIncludeClosed(event.target.checked);
                                if (!event.target.checked && statusFilter === 'closed') {
                                    setStatusFilter('');
                                }
                                setCurrentPage(1);
                            }}
                            className="accent-accent"
                        />
                        {t('filters.include_closed', 'Include closed')}
                    </label>
                    <button
                        type="button"
                        onClick={fetchIssues}
                        className="h-10 w-10 flex items-center justify-center glass rounded-xl text-slate-400 hover:text-white transition-colors"
                        title={t('actions.refresh', 'Refresh')}
                    >
                        <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin text-accent' : ''}`} />
                    </button>
                </div>
            </div>

            {error ? (
                <div className="glass-card p-20 flex flex-col items-center justify-center text-center gap-4">
                    <AlertCircle className="h-12 w-12 text-rose-500" />
                    <div>
                        <p className="text-white font-bold text-xl">{t('errors.title', 'Error loading issues')}</p>
                        <p className="text-slate-500 max-w-sm mx-auto">{error}</p>
                    </div>
                    <button onClick={fetchIssues} className="text-accent font-bold hover:underline">
                        {t('actions.try_again', 'Try again')}
                    </button>
                </div>
            ) : !hasLoadedIssuesRef.current && isLoading ? (
                <div className="glass-card !p-0 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.02]">
                                {columns.map((column) => (
                                    <th key={String(column.key)} className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...Array(limit)].map((_, index) => (
                                <tr key={`issues-skeleton-${index}`} className="border-b border-white/5 animate-pulse">
                                    <td className="px-6 py-4"><div className="h-4 w-32 bg-white/5 rounded" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-20 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-20 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-16 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-24 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-5 w-24 bg-white/5 rounded-md" /></td>
                                    <td className="px-6 py-4"><div className="h-4 w-4 bg-white/5 rounded ml-auto" /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <>
                    <SortableTable
                        data={items}
                        columns={columns}
                        keyExtractor={(issue) => issue.id}
                        onRowClick={(issue) => navigate(`/issues/${issue.id}`)}
                        emptyMessage={t('list.empty', 'No issues found.')}
                        sortKey={sortField}
                        sortDirection={sortDirection}
                        onSort={(key, direction) => {
                            setSortField((direction ? key : null) as IssueListFilters['sort_by'] | null);
                            setSortDirection(direction);
                            setCurrentPage(1);
                        }}
                    />
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalCount}
                        itemsPerPage={limit}
                        onPageChange={setCurrentPage}
                    />
                </>
            )}

            <ExportDialog
                isOpen={isExportDialogOpen}
                onClose={() => setIsExportDialogOpen(false)}
                onSubmit={handleExport}
                isSubmitting={isExporting}
            />
        </div>
    );
}

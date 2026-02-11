import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, PlusCircle, RefreshCw } from 'lucide-react';
import { IssueDetailPanel } from '@/components/issues/IssueDetailPanel';
import { usePermissions } from '@/hooks/usePermissions';
import { reportApi } from '@/services/reportApi';
import { issuesApi } from '@/services/issuesApi';
import type { Issue, IssueCreatePayload, IssueListFilters, IssueSeverity, IssueStatus } from '@/types/issue';

const STATUS_OPTIONS: Array<{ label: string; value: IssueStatus | '' }> = [
    { label: 'All statuses', value: '' },
    { label: 'Open', value: 'open' },
    { label: 'Triaged', value: 'triaged' },
    { label: 'In progress', value: 'in_progress' },
    { label: 'Ready for validation', value: 'ready_for_validation' },
    { label: 'Closed', value: 'closed' },
];

const SEVERITY_OPTIONS: Array<{ label: string; value: IssueSeverity | '' }> = [
    { label: 'All severities', value: '' },
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
    { label: 'Critical', value: 'critical' },
];

export function IssuesPage() {
    const { hasPermission } = usePermissions();
    const canRead = hasPermission('issues', 'read');
    const canWrite = hasPermission('issues', 'write');
    const canApprove = hasPermission('issues', 'approve');

    const [items, setItems] = useState<Issue[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
    const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
    const [severityFilter, setSeverityFilter] = useState<IssueSeverity | ''>('');
    const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const [newIssueTitle, setNewIssueTitle] = useState<string>('');
    const [newIssueDescription, setNewIssueDescription] = useState<string>('');
    const [newIssueDepartmentId, setNewIssueDepartmentId] = useState<string>('');
    const [newIssueOwnerId, setNewIssueOwnerId] = useState<string>('');
    const [newIssueSeverity, setNewIssueSeverity] = useState<IssueSeverity>('medium');
    const [newIssueDueAt, setNewIssueDueAt] = useState<string>('');

    const listFilters = useMemo<IssueListFilters>(() => {
        const filters: IssueListFilters = { limit: 100 };
        if (statusFilter) {
            filters.status = statusFilter;
        }
        if (severityFilter) {
            filters.severity = severityFilter;
        }
        if (overdueOnly) {
            filters.overdue = true;
        }
        return filters;
    }, [overdueOnly, severityFilter, statusFilter]);

    const fetchIssues = useCallback(async () => {
        if (!canRead) {
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const response = await issuesApi.list(listFilters);
            const ids = response.items.map((issue) => issue.id);
            const detailed = await Promise.all(ids.map((id) => issuesApi.get(id)));
            setItems(detailed);

            const nextSelectedId = selectedIssueId && ids.includes(selectedIssueId) ? selectedIssueId : ids[0] ?? null;
            setSelectedIssueId(nextSelectedId);
            if (nextSelectedId) {
                const current = detailed.find((issue) => issue.id === nextSelectedId) ?? null;
                setSelectedIssue(current);
            } else {
                setSelectedIssue(null);
            }
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : 'Failed to load issues';
            setError(message);
            setItems([]);
            setSelectedIssue(null);
            setSelectedIssueId(null);
        } finally {
            setIsLoading(false);
        }
    }, [canRead, listFilters, selectedIssueId]);

    useEffect(() => {
        fetchIssues();
    }, [fetchIssues]);

    const handleSelectIssue = (issue: Issue) => {
        setSelectedIssueId(issue.id);
        setSelectedIssue(issue);
    };

    const handleCreateIssue = async () => {
        if (!canWrite) {
            return;
        }
        if (!newIssueTitle.trim()) {
            setError('Title is required.');
            return;
        }
        const departmentId = Number(newIssueDepartmentId);
        if (!Number.isFinite(departmentId) || departmentId <= 0) {
            setError('Department ID must be a positive number.');
            return;
        }

        const payload: IssueCreatePayload = {
            title: newIssueTitle.trim(),
            description: newIssueDescription.trim() || undefined,
            severity: newIssueSeverity,
            source_type: 'manual',
            department_id: departmentId,
            owner_user_id: newIssueOwnerId ? Number(newIssueOwnerId) : undefined,
            due_at: newIssueDueAt ? new Date(newIssueDueAt).toISOString() : undefined,
        };

        setIsCreating(true);
        setError(null);
        try {
            const created = await issuesApi.create(payload);
            setItems((previous) => [created, ...previous]);
            setSelectedIssueId(created.id);
            setSelectedIssue(created);
            setNewIssueTitle('');
            setNewIssueDescription('');
            setNewIssueDepartmentId('');
            setNewIssueOwnerId('');
            setNewIssueSeverity('medium');
            setNewIssueDueAt('');
        } catch (createError) {
            const message = createError instanceof Error ? createError.message : 'Issue creation failed';
            setError(message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleIssueUpdated = (updatedIssue: Issue) => {
        setItems((previous) => previous.map((item) => (item.id === updatedIssue.id ? updatedIssue : item)));
        setSelectedIssue(updatedIssue);
    };

    const handleExportIssues = async () => {
        const asOfDate = new Date().toISOString().slice(0, 10);
        await reportApi.exportIssues({
            format: 'xlsx',
            asOfDate,
            filters: {
                status: statusFilter || null,
                severity: severityFilter || null,
                overdueOnly,
            },
        });
    };

    if (!canRead) {
        return (
            <div className="glass-card p-8 flex items-center gap-3 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <span>You do not have permission to view issues.</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-3xl font-black text-white">Issues</h2>
                    <p className="text-sm text-slate-400">Track remediation, exceptions, and closure validation.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={fetchIssues}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                    >
                        <span className="inline-flex items-center gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={handleExportIssues}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Export
                        </span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                    {error}
                </div>
            )}

            <div className="glass-card p-4 grid gap-3 md:grid-cols-4">
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as IssueStatus | '')}
                    className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                >
                    {STATUS_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <select
                    value={severityFilter}
                    onChange={(event) => setSeverityFilter(event.target.value as IssueSeverity | '')}
                    className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                >
                    {SEVERITY_OPTIONS.map((option) => (
                        <option key={option.label} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                        type="checkbox"
                        checked={overdueOnly}
                        onChange={(event) => setOverdueOnly(event.target.checked)}
                    />
                    Overdue only
                </label>
            </div>

            {canWrite && (
                <section className="glass-card p-4 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">Create Issue</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                        <input
                            type="text"
                            value={newIssueTitle}
                            onChange={(event) => setNewIssueTitle(event.target.value)}
                            placeholder="Title"
                            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        />
                        <select
                            value={newIssueSeverity}
                            onChange={(event) => setNewIssueSeverity(event.target.value as IssueSeverity)}
                            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        >
                            {SEVERITY_OPTIONS.filter((option) => option.value).map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            value={newIssueDepartmentId}
                            onChange={(event) => setNewIssueDepartmentId(event.target.value)}
                            placeholder="Department ID"
                            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        />
                        <input
                            type="number"
                            value={newIssueOwnerId}
                            onChange={(event) => setNewIssueOwnerId(event.target.value)}
                            placeholder="Owner user ID (optional)"
                            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        />
                        <input
                            type="datetime-local"
                            value={newIssueDueAt}
                            onChange={(event) => setNewIssueDueAt(event.target.value)}
                            className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        />
                        <textarea
                            value={newIssueDescription}
                            onChange={(event) => setNewIssueDescription(event.target.value)}
                            placeholder="Description"
                            className="min-h-[72px] rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleCreateIssue}
                        disabled={isCreating}
                        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        <span className="inline-flex items-center gap-2">
                            <PlusCircle className="h-4 w-4" />
                            {isCreating ? 'Creating...' : 'Create Issue'}
                        </span>
                    </button>
                </section>
            )}

            <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
                <section className="glass-card p-3">
                    <h3 className="px-2 pb-3 text-sm font-bold uppercase tracking-wide text-slate-300">Issue Queue</h3>
                    {isLoading ? (
                        <p className="px-2 py-4 text-sm text-slate-500">Loading issues...</p>
                    ) : items.length === 0 ? (
                        <p className="px-2 py-4 text-sm text-slate-500">No issues found.</p>
                    ) : (
                        <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-1">
                            {items.map((issue) => {
                                const active = selectedIssueId === issue.id;
                                return (
                                    <button
                                        key={issue.id}
                                        type="button"
                                        onClick={() => handleSelectIssue(issue)}
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                                            active
                                                ? 'border-accent/50 bg-accent/10'
                                                : 'border-white/10 bg-slate-900/40 hover:bg-slate-800/40'
                                        }`}
                                    >
                                        <div className="text-sm font-semibold text-white">{issue.title}</div>
                                        <div className="mt-1 text-xs text-slate-400">
                                            <span className="mr-2">#{issue.id}</span>
                                            <span className="mr-2">{issue.status}</span>
                                            <span>{issue.severity}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <IssueDetailPanel
                    issue={selectedIssue}
                    canWrite={canWrite}
                    canApprove={canApprove}
                    onIssueUpdated={handleIssueUpdated}
                />
            </div>
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { issuesApi } from '@/services/issuesApi';
import type { Issue, IssueOwnerLookup, IssueRemediationStatus } from '@/types/issue';

interface RemediationPlanCardProps {
    issue: Issue;
    canWrite: boolean;
    canApprove: boolean;
    onIssueUpdated: (issue: Issue) => void;
}

const REMEDIATION_STATUSES: IssueRemediationStatus[] = ['draft', 'active', 'blocked', 'completed'];

function toDateTimeInputValue(value: string | null | undefined): string {
    if (!value) {
        return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return date.toISOString().slice(0, 16);
}

function toIsoOrUndefined(value: string): string | undefined {
    if (!value) {
        return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }
    return parsed.toISOString();
}

export function RemediationPlanCard({ issue, canWrite, canApprove, onIssueUpdated }: RemediationPlanCardProps) {
    const [assignOwnerId, setAssignOwnerId] = useState<string>(issue.owner_user_id ? String(issue.owner_user_id) : '');
    const [assignDueAt, setAssignDueAt] = useState<string>(toDateTimeInputValue(issue.due_at));
    const [progressPercent, setProgressPercent] = useState<string>(
        issue.remediation_plan ? String(issue.remediation_plan.progress_percent) : '0'
    );
    const [remediationStatus, setRemediationStatus] = useState<string>(issue.remediation_plan?.status ?? 'active');
    const [blockerReason, setBlockerReason] = useState<string>(issue.remediation_plan?.blocker_reason ?? '');
    const [completionNotes, setCompletionNotes] = useState<string>(issue.remediation_plan?.completion_notes ?? '');
    const [exceptionReason, setExceptionReason] = useState<string>('');
    const [exceptionExpiresAt, setExceptionExpiresAt] = useState<string>('');
    const [validationNote, setValidationNote] = useState<string>(issue.validation_note ?? '');
    const [ownerOptions, setOwnerOptions] = useState<IssueOwnerLookup[]>([]);
    const [isOwnersLoading, setIsOwnersLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setAssignOwnerId(issue.owner_user_id ? String(issue.owner_user_id) : '');
        setAssignDueAt(toDateTimeInputValue(issue.due_at));
        setProgressPercent(issue.remediation_plan ? String(issue.remediation_plan.progress_percent) : '0');
        setRemediationStatus(issue.remediation_plan?.status ?? 'active');
        setBlockerReason(issue.remediation_plan?.blocker_reason ?? '');
        setCompletionNotes(issue.remediation_plan?.completion_notes ?? '');
        setValidationNote(issue.validation_note ?? '');
    }, [issue]);

    useEffect(() => {
        if (!canWrite) {
            setOwnerOptions([]);
            return;
        }
        setIsOwnersLoading(true);
        issuesApi
            .listAssignableOwners(issue.department_id)
            .then((owners) => {
                setOwnerOptions(owners);
                setAssignOwnerId((previous) => {
                    if (!previous) {
                        return previous;
                    }
                    return owners.some((owner) => String(owner.id) === previous) ? previous : '';
                });
            })
            .catch(() => {
                setOwnerOptions([]);
            })
            .finally(() => {
                setIsOwnersLoading(false);
            });
    }, [canWrite, issue.department_id]);

    const requestedExceptionId = useMemo(() => {
        const requested = issue.exceptions
            .filter((exception) => exception.status === 'requested')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return requested[0]?.id;
    }, [issue.exceptions]);

    const refreshIssue = async () => {
        const refreshed = await issuesApi.get(issue.id);
        onIssueUpdated(refreshed);
    };

    const runMutation = async (fn: () => Promise<void>) => {
        setIsSubmitting(true);
        setError(null);
        try {
            await fn();
        } catch (mutationError) {
            const message = mutationError instanceof Error ? mutationError.message : 'Issue workflow action failed';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssign = async () => {
        if (!assignOwnerId) {
            setError('Owner is required.');
            return;
        }
        const ownerId = Number(assignOwnerId);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
            setError('Owner selection is invalid.');
            return;
        }
        const dueAt = toIsoOrUndefined(assignDueAt);
        if (!dueAt) {
            setError('Due date is required.');
            return;
        }

        await runMutation(async () => {
            const updated = await issuesApi.assign(issue.id, {
                owner_user_id: ownerId,
                due_at: dueAt,
                target_date: dueAt,
            });
            onIssueUpdated(updated);
        });
    };

    const handleStartRemediation = async () => {
        await runMutation(async () => {
            const updated = await issuesApi.startRemediation(issue.id, {
                target_date: toIsoOrUndefined(assignDueAt),
            });
            onIssueUpdated(updated);
        });
    };

    const handleUpdateProgress = async () => {
        await runMutation(async () => {
            const percent = Number(progressPercent);
            const updated = await issuesApi.updateProgress(issue.id, {
                progress_percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
                remediation_status: remediationStatus as IssueRemediationStatus,
                blocker_reason: blockerReason || undefined,
                completion_notes: completionNotes || undefined,
            });
            onIssueUpdated(updated);
        });
    };

    const handleRequestException = async () => {
        if (!exceptionReason.trim()) {
            setError('Exception reason is required.');
            return;
        }

        await runMutation(async () => {
            await issuesApi.requestException(issue.id, { reason: exceptionReason.trim() });
            setExceptionReason('');
            await refreshIssue();
        });
    };

    const handleApproveException = async () => {
        const expiresAt = toIsoOrUndefined(exceptionExpiresAt);
        if (!expiresAt) {
            setError('Exception expiry date is required.');
            return;
        }
        if (!requestedExceptionId) {
            setError('No requested exception is available for approval.');
            return;
        }

        await runMutation(async () => {
            await issuesApi.approveException(issue.id, {
                exception_id: requestedExceptionId,
                expires_at: expiresAt,
            });
            setExceptionExpiresAt('');
            await refreshIssue();
        });
    };

    const handleClose = async () => {
        if (!validationNote.trim()) {
            setError('Validation note is required for closure.');
            return;
        }
        await runMutation(async () => {
            const updated = await issuesApi.close(issue.id, {
                validation_note: validationNote.trim(),
                completion_notes: completionNotes || undefined,
            });
            onIssueUpdated(updated);
        });
    };

    const remediation = issue.remediation_plan;

    return (
        <section className="glass-card p-5 space-y-5">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Remediation Workflow</h3>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Issue status: {issue.status}
                </span>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                    {error}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Owner</label>
                    <select
                        value={assignOwnerId}
                        onChange={(event) => setAssignOwnerId(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    >
                        <option value="">{isOwnersLoading ? 'Loading owners...' : 'Select owner'}</option>
                        {ownerOptions.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                                {owner.name}
                                {owner.role_name ? ` - ${owner.role_name}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Due At</label>
                    <input
                        type="datetime-local"
                        value={assignDueAt}
                        onChange={(event) => setAssignDueAt(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleAssign}
                    disabled={!canWrite || isSubmitting}
                    className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                    Assign
                </button>
                <button
                    type="button"
                    onClick={handleStartRemediation}
                    disabled={!canWrite || isSubmitting}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
                >
                    Start Remediation
                </button>
                <button
                    type="button"
                    onClick={handleClose}
                    disabled={!canWrite || isSubmitting}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"
                >
                    Close Issue
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Progress (%)</label>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={progressPercent}
                        onChange={(event) => setProgressPercent(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Remediation Status</label>
                    <select
                        value={remediationStatus}
                        onChange={(event) => setRemediationStatus(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    >
                        {REMEDIATION_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                                {statusValue}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Blocker Reason</label>
                    <input
                        type="text"
                        value={blockerReason}
                        onChange={(event) => setBlockerReason(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Completion Notes</label>
                    <textarea
                        value={completionNotes}
                        onChange={(event) => setCompletionNotes(event.target.value)}
                        className="min-h-[80px] w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleUpdateProgress}
                    disabled={!canWrite || isSubmitting}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
                >
                    Update Progress
                </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Exception Reason</label>
                    <textarea
                        value={exceptionReason}
                        onChange={(event) => setExceptionReason(event.target.value)}
                        className="min-h-[72px] w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Approve Until</label>
                    <input
                        type="datetime-local"
                        value={exceptionExpiresAt}
                        onChange={(event) => setExceptionExpiresAt(event.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canApprove || isSubmitting}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-400">Validation Note</label>
                    <textarea
                        value={validationNote}
                        onChange={(event) => setValidationNote(event.target.value)}
                        className="min-h-[72px] w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        disabled={!canWrite || isSubmitting}
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleRequestException}
                    disabled={!canWrite || isSubmitting}
                    className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
                >
                    Request Exception
                </button>
                <button
                    type="button"
                    onClick={handleApproveException}
                    disabled={!canApprove || isSubmitting}
                    className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200 disabled:opacity-50"
                >
                    Approve Exception
                </button>
            </div>

            <div className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                <div>Remediation status: {remediation?.status ?? 'not-created'}</div>
                <div>Progress: {remediation?.progress_percent ?? 0}%</div>
                <div>Target date: {remediation?.target_date ?? 'not-set'}</div>
            </div>
        </section>
    );
}

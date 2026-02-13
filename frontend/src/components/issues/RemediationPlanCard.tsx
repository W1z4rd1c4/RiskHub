import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/hooks';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import {
    ISSUE_ACTION_ROW,
    ISSUE_FIELD,
    ISSUE_LABEL,
    ISSUE_PRIMARY_BUTTON,
    ISSUE_SECONDARY_BUTTON,
    ISSUE_SECTION_CARD,
    ISSUE_SECTION_HEADER,
    ISSUE_SECTION_SUBTITLE,
    ISSUE_SECTION_TITLE,
    ISSUE_SUCCESS_BUTTON,
    ISSUE_TEXTAREA,
    ISSUE_WARNING_BUTTON,
    issuePill,
    issueStatusClass,
} from './issueUi';
import { issuesApi } from '@/services/issuesApi';
import type { Issue, IssueOwnerLookup, IssueRemediationStatus, IssueStatus } from '@/types/issue';

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

function formatDate(value: string | null | undefined, locale: string, notSetLabel: string): string {
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

function SummaryField({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <p className={ISSUE_LABEL}>{label}</p>
            <p className="text-sm text-slate-300 break-words">{value}</p>
        </div>
    );
}

export function RemediationPlanCard({ issue, canWrite, canApprove, onIssueUpdated }: RemediationPlanCardProps) {
    const { t, i18n } = useTranslation('issues');

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

    const isClosed = issue.status === 'closed';
    const canStartRemediation = issue.status === 'open' || issue.status === 'triaged';
    const isInProgress = issue.status === 'in_progress';
    const isReadyForValidation = issue.status === 'ready_for_validation';

    useEffect(() => {
        setAssignOwnerId(issue.owner_user_id ? String(issue.owner_user_id) : '');
        setAssignDueAt(toDateTimeInputValue(issue.due_at));
        setProgressPercent(issue.remediation_plan ? String(issue.remediation_plan.progress_percent) : '0');
        setRemediationStatus(issue.remediation_plan?.status ?? 'active');
        setBlockerReason(issue.remediation_plan?.blocker_reason ?? '');
        setCompletionNotes(issue.remediation_plan?.completion_notes ?? '');
        setValidationNote(issue.validation_note ?? '');
        setExceptionReason('');
        setExceptionExpiresAt('');
        setError(null);
        setIsSubmitting(false);
    }, [issue.id, issue.updated_at, issue.owner_user_id, issue.due_at, issue.remediation_plan, issue.validation_note]);

    useEffect(() => {
        if (!canWrite || isClosed) {
            setOwnerOptions([]);
            setIsOwnersLoading(false);
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
    }, [canWrite, isClosed, issue.department_id]);

    const requestedExceptionId = useMemo(() => {
        const requested = issue.exceptions
            .filter((exception) => exception.status === 'requested')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return requested[0]?.id;
    }, [issue.exceptions]);

    const issueStatusLabel = (status: IssueStatus): string => t(`status.${status}`, status.replaceAll('_', ' '));
    const nextStepLabel = useMemo(() => {
        if (issue.status === 'open' || issue.status === 'triaged') {
            return t('workflow.next_step.assignment', 'Next step: assign owner and start remediation.');
        }
        if (issue.status === 'in_progress') {
            return t('workflow.next_step.progress', 'Next step: update progress and handle exceptions only if needed.');
        }
        if (issue.status === 'ready_for_validation') {
            return t('workflow.next_step.close', 'Next step: add validation note and close the issue.');
        }
        if (issue.status === 'closed') {
            return t('workflow.next_step.closed', 'Closed issue: summary mode.');
        }
        return '';
    }, [issue.status, t]);

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
            const message = mutationError instanceof Error ? mutationError.message : t('errors.action_failed', 'Issue workflow action failed');
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssign = async () => {
        if (!assignOwnerId) {
            setError(t('errors.owner_required', 'Owner is required.'));
            return;
        }
        const ownerId = Number(assignOwnerId);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
            setError(t('errors.owner_invalid', 'Owner selection is invalid.'));
            return;
        }
        const dueAt = toIsoOrUndefined(assignDueAt);
        if (!dueAt) {
            setError(t('errors.due_required', 'Due date is required.'));
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
            setError(t('errors.exception_reason_required', 'Exception reason is required.'));
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
            setError(t('errors.exception_expiry_required', 'Exception expiry date is required.'));
            return;
        }
        if (!requestedExceptionId) {
            setError(t('errors.no_requested_exception_for_approval', 'No requested exception is available for approval.'));
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
            setError(t('errors.validation_note_required', 'Validation note is required for closure.'));
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
        <div className="space-y-5" data-testid="issue-workflow-sections">
            <section className={ISSUE_SECTION_CARD} data-testid="workflow-summary-card">
                <div className={ISSUE_SECTION_HEADER}>
                    <div>
                        <h3 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.workflow_summary', 'Workflow Summary')}</h3>
                        <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.title', 'Remediation Workflow')}</p>
                    </div>
                    <span className={issuePill(issueStatusClass(issue.status))}>{issueStatusLabel(issue.status)}</span>
                </div>

                {error && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {error}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <SummaryField
                        label={t('workflow.fields.owner', 'Owner')}
                        value={
                            issue.owner_user_name ||
                            (issue.owner_user_id ? t('fallbacks.unknown_user', 'Unknown user') : t('fallbacks.unassigned', 'Unassigned'))
                        }
                    />
                    <SummaryField
                        label={t('workflow.fields.due_at', 'Due at')}
                        value={formatDate(issue.due_at, i18n.language, t('fallbacks.not_set', 'Not set'))}
                    />
                    <SummaryField
                        label={t('workflow.fields.remediation_status', 'Remediation status')}
                        value={
                            remediation
                                ? t(`remediation_status.${remediation.status}`, remediation.status)
                                : t('workflow.messages.not_created', 'Not created')
                        }
                    />
                    <SummaryField
                        label={t('workflow.fields.progress', 'Progress (%)')}
                        value={`${remediation?.progress_percent ?? 0}%`}
                    />
                    <SummaryField
                        label={t('workflow.fields.target_date', 'Target date')}
                        value={formatDate(remediation?.target_date, i18n.language, t('fallbacks.not_set', 'Not set'))}
                    />
                    <SummaryField
                        label={t('workflow.fields.completed_at', 'Completed at')}
                        value={formatDate(remediation?.completed_at, i18n.language, t('fallbacks.not_set', 'Not set'))}
                    />
                </div>
                <p className="text-sm text-slate-400">{nextStepLabel}</p>
            </section>

            {isClosed ? (
                <section className={ISSUE_SECTION_CARD} data-testid="workflow-closed-card">
                    <div className={ISSUE_SECTION_HEADER}>
                        <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure', 'Closure')}</h4>
                    </div>
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {t(
                            'workflow.closed_notice',
                            'This issue is closed. Workflow actions are hidden to keep this view focused on summary and history.'
                        )}
                    </div>
                    <SummaryField
                        label={t('workflow.fields.validation_note', 'Validation note')}
                        value={issue.validation_note || t('fallbacks.not_set', 'Not set')}
                    />
                </section>
            ) : (
                <>
                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-assignment-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <div>
                                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.assignment', 'Assignment')}</h4>
                                <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.fields.owner', 'Owner')} / {t('workflow.fields.due_at', 'Due at')}</p>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.owner', 'Owner')}</label>
                                <ThemedSelect
                                    value={assignOwnerId}
                                    onValueChange={setAssignOwnerId}
                                    options={ownerOptions.map((owner) => ({
                                        value: String(owner.id),
                                        label: `${owner.name}${owner.role_name ? ` - ${owner.role_name}` : ''}`,
                                    }))}
                                    allowEmpty
                                    emptyLabel={
                                        isOwnersLoading
                                            ? t('form.placeholders.loading_owners', 'Loading owners...')
                                            : t('form.placeholders.select_owner', 'Select owner')
                                    }
                                    placeholder={t('form.placeholders.select_owner', 'Select owner')}
                                    disabled={!canWrite || isOwnersLoading || isSubmitting}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.due_at', 'Due at')}</label>
                                <input
                                    type="datetime-local"
                                    value={assignDueAt}
                                    onChange={(event) => setAssignDueAt(event.target.value)}
                                    className={`${ISSUE_FIELD} h-10`}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                        </div>
                        {canWrite && (
                            <div className={ISSUE_ACTION_ROW}>
                                <button
                                    type="button"
                                    onClick={handleAssign}
                                    disabled={isSubmitting}
                                    className={canStartRemediation ? ISSUE_SECONDARY_BUTTON : ISSUE_PRIMARY_BUTTON}
                                >
                                    {t('actions.assign', 'Assign')}
                                </button>
                                {canStartRemediation && (
                                    <button
                                        type="button"
                                        onClick={handleStartRemediation}
                                        disabled={isSubmitting}
                                        className={ISSUE_PRIMARY_BUTTON}
                                    >
                                        {t('actions.start_remediation', 'Start Remediation')}
                                    </button>
                                )}
                            </div>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-progress-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.remediation_progress', 'Remediation Progress')}</h4>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.progress', 'Progress (%)')}</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={progressPercent}
                                    onChange={(event) => setProgressPercent(event.target.value)}
                                    className={`${ISSUE_FIELD} h-10`}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.remediation_status', 'Remediation status')}</label>
                                <ThemedSelect
                                    value={remediationStatus}
                                    onValueChange={setRemediationStatus}
                                    options={REMEDIATION_STATUSES.map((statusValue) => ({
                                        value: statusValue,
                                        label: t(`remediation_status.${statusValue}`, statusValue),
                                    }))}
                                    disabled={!canWrite || isSubmitting}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <details className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-slate-400">
                                        {t('workflow.sections.advanced_progress', 'Advanced progress fields')}
                                    </summary>
                                    <div className="mt-3 space-y-3">
                                        <div className="space-y-1.5">
                                            <label className={ISSUE_LABEL}>{t('workflow.fields.blocker_reason', 'Blocker reason')}</label>
                                            <input
                                                type="text"
                                                value={blockerReason}
                                                onChange={(event) => setBlockerReason(event.target.value)}
                                                className={ISSUE_FIELD}
                                                disabled={!canWrite || isSubmitting}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ISSUE_LABEL}>{t('workflow.fields.completion_notes', 'Completion notes')}</label>
                                            <textarea
                                                value={completionNotes}
                                                onChange={(event) => setCompletionNotes(event.target.value)}
                                                className={ISSUE_TEXTAREA}
                                                disabled={!canWrite || isSubmitting}
                                            />
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                        {canWrite && (
                            <div className={ISSUE_ACTION_ROW}>
                                <button
                                    type="button"
                                    onClick={handleUpdateProgress}
                                    disabled={isSubmitting}
                                    className={isInProgress ? ISSUE_PRIMARY_BUTTON : ISSUE_SECONDARY_BUTTON}
                                >
                                    {t('actions.update_progress', 'Update Progress')}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-exception-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.exception_handling', 'Exception Handling')}</h4>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.exception_reason', 'Exception reason')}</label>
                                <textarea
                                    value={exceptionReason}
                                    onChange={(event) => setExceptionReason(event.target.value)}
                                    className={ISSUE_TEXTAREA}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                            {canApprove && requestedExceptionId && (
                                <div className="space-y-1.5">
                                    <label className={ISSUE_LABEL}>{t('workflow.fields.approve_until', 'Approve until')}</label>
                                    <input
                                        type="datetime-local"
                                        value={exceptionExpiresAt}
                                        onChange={(event) => setExceptionExpiresAt(event.target.value)}
                                        className={`${ISSUE_FIELD} h-10`}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            )}
                        </div>
                        <div className={ISSUE_ACTION_ROW}>
                            {canWrite && (
                                <button
                                    type="button"
                                    onClick={handleRequestException}
                                    disabled={isSubmitting}
                                    className={isInProgress ? ISSUE_WARNING_BUTTON : ISSUE_SECONDARY_BUTTON}
                                >
                                    {t('actions.request_exception', 'Request Exception')}
                                </button>
                            )}
                            {canApprove && requestedExceptionId && (
                                <button
                                    type="button"
                                    onClick={handleApproveException}
                                    disabled={isSubmitting}
                                    className={ISSUE_SECONDARY_BUTTON}
                                >
                                    {t('actions.approve_exception', 'Approve Exception')}
                                </button>
                            )}
                        </div>
                        {canApprove && !requestedExceptionId && (
                            <p className="text-sm text-slate-500">{t('workflow.messages.no_requested_exception', 'No requested exception is waiting for approval.')}</p>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-closure-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure', 'Closure')}</h4>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ISSUE_LABEL}>{t('workflow.fields.validation_note', 'Validation note')}</label>
                            <textarea
                                value={validationNote}
                                onChange={(event) => setValidationNote(event.target.value)}
                                className={ISSUE_TEXTAREA}
                                disabled={!canWrite || isSubmitting}
                            />
                        </div>
                        {canWrite && (
                            <div className={ISSUE_ACTION_ROW}>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={isSubmitting}
                                    className={isReadyForValidation ? ISSUE_SUCCESS_BUTTON : ISSUE_SECONDARY_BUTTON}
                                >
                                    {t('actions.close_issue', 'Close Issue')}
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

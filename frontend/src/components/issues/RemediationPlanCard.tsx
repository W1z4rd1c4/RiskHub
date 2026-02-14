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
import { apiClient } from '@/services/apiClient';
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
    const [errorKey, setErrorKey] = useState<string | null>(null);

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
        setErrorKey(null);
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
            return t('workflow.next_step.assignment');
        }
        if (issue.status === 'in_progress') {
            return t('workflow.next_step.progress');
        }
        if (issue.status === 'ready_for_validation') {
            return t('workflow.next_step.close');
        }
        if (issue.status === 'closed') {
            return t('workflow.next_step.closed');
        }
        return '';
    }, [issue.status, t]);

    const refreshIssue = async () => {
        const refreshed = await issuesApi.get(issue.id);
        onIssueUpdated(refreshed);
    };

    const runMutation = async (fn: () => Promise<void>) => {
        setIsSubmitting(true);
        setErrorKey(null);
        try {
            await fn();
        } catch (mutationError) {
            setErrorKey(apiClient.toUiMessageKey(mutationError));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAssign = async () => {
        if (!assignOwnerId) {
            setErrorKey('errors.owner_required');
            return;
        }
        const ownerId = Number(assignOwnerId);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
            setErrorKey('errors.owner_invalid');
            return;
        }
        const dueAt = toIsoOrUndefined(assignDueAt);
        if (!dueAt) {
            setErrorKey('errors.due_required');
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
            setErrorKey('errors.exception_reason_required');
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
            setErrorKey('errors.exception_expiry_required');
            return;
        }
        if (!requestedExceptionId) {
            setErrorKey('errors.no_requested_exception_for_approval');
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
            setErrorKey('errors.validation_note_required');
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
                        <h3 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.workflow_summary')}</h3>
                        <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.title')}</p>
                    </div>
                    <span className={issuePill(issueStatusClass(issue.status))}>{issueStatusLabel(issue.status)}</span>
                </div>

                {errorKey && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                        {errorKey.startsWith('errorKeys.')
                            ? t(errorKey.replace('errorKeys.', ''), { ns: 'errorKeys' })
                            : t(errorKey)}
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <SummaryField
                        label={t('workflow.fields.owner')}
                        value={
                            issue.owner_user_name ||
                            (issue.owner_user_id ? t('fallbacks.unknown_user') : t('fallbacks.unassigned'))
                        }
                    />
                    <SummaryField
                        label={t('workflow.fields.due_at')}
                        value={formatDate(issue.due_at, i18n.language, t('fallbacks.not_set'))}
                    />
                    <SummaryField
                        label={t('workflow.fields.remediation_status')}
                        value={
                            remediation
                                ? t(`remediation_status.${remediation.status}`, remediation.status)
                                : t('workflow.messages.not_created')
                        }
                    />
                    <SummaryField
                        label={t('workflow.fields.progress')}
                        value={`${remediation?.progress_percent ?? 0}%`}
                    />
                    <SummaryField
                        label={t('workflow.fields.target_date')}
                        value={formatDate(remediation?.target_date, i18n.language, t('fallbacks.not_set'))}
                    />
                    <SummaryField
                        label={t('workflow.fields.completed_at')}
                        value={formatDate(remediation?.completed_at, i18n.language, t('fallbacks.not_set'))}
                    />
                </div>
                <p className="text-sm text-slate-400">{nextStepLabel}</p>
            </section>

            {isClosed ? (
                <section className={ISSUE_SECTION_CARD} data-testid="workflow-closed-card">
                    <div className={ISSUE_SECTION_HEADER}>
                        <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure')}</h4>
                    </div>
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                        {t('workflow.closed_notice')}
                    </div>
                    <SummaryField
                        label={t('workflow.fields.validation_note')}
                        value={issue.validation_note || t('fallbacks.not_set')}
                    />
                </section>
            ) : (
                <>
                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-assignment-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <div>
                                <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.assignment')}</h4>
                                <p className={ISSUE_SECTION_SUBTITLE}>{t('workflow.fields.owner')} / {t('workflow.fields.due_at')}</p>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.owner')}</label>
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
                                            ? t('form.placeholders.loading_owners')
                                            : t('form.placeholders.select_owner')
                                    }
                                    placeholder={t('form.placeholders.select_owner')}
                                    disabled={!canWrite || isOwnersLoading || isSubmitting}
                                    className="w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.due_at')}</label>
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
                                    {t('actions.assign')}
                                </button>
                                {canStartRemediation && (
                                    <button
                                        type="button"
                                        onClick={handleStartRemediation}
                                        disabled={isSubmitting}
                                        className={ISSUE_PRIMARY_BUTTON}
                                    >
                                        {t('actions.start_remediation')}
                                    </button>
                                )}
                            </div>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-progress-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.remediation_progress')}</h4>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.progress')}</label>
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
                                <label className={ISSUE_LABEL}>{t('workflow.fields.remediation_status')}</label>
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
                                        {t('workflow.sections.advanced_progress')}
                                    </summary>
                                    <div className="mt-3 space-y-3">
                                        <div className="space-y-1.5">
                                            <label className={ISSUE_LABEL}>{t('workflow.fields.blocker_reason')}</label>
                                            <input
                                                type="text"
                                                value={blockerReason}
                                                onChange={(event) => setBlockerReason(event.target.value)}
                                                className={ISSUE_FIELD}
                                                disabled={!canWrite || isSubmitting}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={ISSUE_LABEL}>{t('workflow.fields.completion_notes')}</label>
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
                                    {t('actions.update_progress')}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-exception-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.exception_handling')}</h4>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-1.5 md:col-span-2">
                                <label className={ISSUE_LABEL}>{t('workflow.fields.exception_reason')}</label>
                                <textarea
                                    value={exceptionReason}
                                    onChange={(event) => setExceptionReason(event.target.value)}
                                    className={ISSUE_TEXTAREA}
                                    disabled={!canWrite || isSubmitting}
                                />
                            </div>
                            {canApprove && requestedExceptionId && (
                                <div className="space-y-1.5">
                                    <label className={ISSUE_LABEL}>{t('workflow.fields.approve_until')}</label>
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
                                    {t('actions.request_exception')}
                                </button>
                            )}
                            {canApprove && requestedExceptionId && (
                                <button
                                    type="button"
                                    onClick={handleApproveException}
                                    disabled={isSubmitting}
                                    className={ISSUE_SECONDARY_BUTTON}
                                >
                                    {t('actions.approve_exception')}
                                </button>
                            )}
                        </div>
                        {canApprove && !requestedExceptionId && (
                            <p className="text-sm text-slate-500">{t('workflow.messages.no_requested_exception')}</p>
                        )}
                    </section>

                    <section className={ISSUE_SECTION_CARD} data-testid="workflow-closure-card">
                        <div className={ISSUE_SECTION_HEADER}>
                            <h4 className={ISSUE_SECTION_TITLE}>{t('workflow.sections.closure')}</h4>
                        </div>
                        <div className="space-y-1.5">
                            <label className={ISSUE_LABEL}>{t('workflow.fields.validation_note')}</label>
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
                                    {t('actions.close_issue')}
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

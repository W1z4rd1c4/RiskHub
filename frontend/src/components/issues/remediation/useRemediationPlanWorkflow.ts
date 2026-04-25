import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { issueDetailQueryKey, issueHistoryQueryKey } from '@/lib/issueQueryKeys';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { useSessionSnapshot } from '@/services/session';
import type { Issue, IssueOwnerLookup, IssueRemediationStatus } from '@/types/issue';
import { fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from '@/utils/dateTimeLocal';

interface UseRemediationPlanWorkflowOptions {
    canWrite: boolean;
    issue: Issue;
}

export const REMEDIATION_STATUSES: IssueRemediationStatus[] = ['draft', 'active', 'blocked', 'completed'];

export function useRemediationPlanWorkflow({ canWrite, issue }: UseRemediationPlanWorkflowOptions) {
    const queryClient = useQueryClient();
    const session = useSessionSnapshot();
    const [assignOwnerId, setAssignOwnerId] = useState<string>(issue.owner_user_id ? String(issue.owner_user_id) : '');
    const [assignDueAt, setAssignDueAt] = useState<string>(toDateTimeLocalInputValue(issue.due_at));
    const [progressPercent, setProgressPercent] = useState<string>(
        issue.remediation_plan ? String(issue.remediation_plan.progress_percent) : '0',
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
    const requestedExceptionId = useMemo(() => {
        const requested = issue.exceptions
            .filter((exception) => exception.status === 'requested')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return requested[0]?.id;
    }, [issue.exceptions]);

    useEffect(() => {
        setAssignOwnerId(issue.owner_user_id ? String(issue.owner_user_id) : '');
        setAssignDueAt(toDateTimeLocalInputValue(issue.due_at));
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

    async function syncIssue(updatedIssue: Issue): Promise<void> {
        queryClient.setQueryData(issueDetailQueryKey(session.user?.id, issue.id), updatedIssue);
        await queryClient.invalidateQueries({
            queryKey: issueHistoryQueryKey(session.user?.id, issue.id),
        });
    }

    async function refreshIssue(): Promise<void> {
        await queryClient.invalidateQueries({
            queryKey: issueDetailQueryKey(session.user?.id, issue.id),
        });
        await queryClient.invalidateQueries({
            queryKey: issueHistoryQueryKey(session.user?.id, issue.id),
        });
    }

    async function runMutation(fn: () => Promise<void>): Promise<void> {
        setIsSubmitting(true);
        setErrorKey(null);
        try {
            await fn();
        } catch (mutationError) {
            setErrorKey(apiClient.toUiMessageKey(mutationError));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleAssign(): Promise<void> {
        if (!assignOwnerId) {
            setErrorKey('errors.owner_required');
            return;
        }
        const ownerId = Number(assignOwnerId);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
            setErrorKey('errors.owner_invalid');
            return;
        }
        const dueAt = fromDateTimeLocalInputValue(assignDueAt);
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
            await syncIssue(updated);
        });
    }

    async function handleStartRemediation(): Promise<void> {
        await runMutation(async () => {
            const updated = await issuesApi.startRemediation(issue.id, {
                target_date: fromDateTimeLocalInputValue(assignDueAt),
            });
            await syncIssue(updated);
        });
    }

    async function handleUpdateProgress(): Promise<void> {
        await runMutation(async () => {
            const percent = Number(progressPercent);
            const updated = await issuesApi.updateProgress(issue.id, {
                progress_percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
                remediation_status: remediationStatus as IssueRemediationStatus,
                blocker_reason: blockerReason || undefined,
                completion_notes: completionNotes || undefined,
            });
            await syncIssue(updated);
        });
    }

    async function handleRequestException(): Promise<void> {
        if (!exceptionReason.trim()) {
            setErrorKey('errors.exception_reason_required');
            return;
        }

        await runMutation(async () => {
            await issuesApi.requestException(issue.id, { reason: exceptionReason.trim() });
            setExceptionReason('');
            await refreshIssue();
        });
    }

    async function handleApproveException(): Promise<void> {
        const expiresAt = fromDateTimeLocalInputValue(exceptionExpiresAt);
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
    }

    async function handleClose(): Promise<void> {
        if (!validationNote.trim()) {
            setErrorKey('errors.validation_note_required');
            return;
        }
        await runMutation(async () => {
            const updated = await issuesApi.close(issue.id, {
                validation_note: validationNote.trim(),
                completion_notes: completionNotes || undefined,
            });
            await syncIssue(updated);
        });
    }

    return {
        assignDueAt,
        assignOwnerId,
        blockerReason,
        canStartRemediation,
        completionNotes,
        errorKey,
        exceptionExpiresAt,
        exceptionReason,
        handleApproveException,
        handleAssign,
        handleClose,
        handleRequestException,
        handleStartRemediation,
        handleUpdateProgress,
        isClosed,
        isInProgress,
        isOwnersLoading,
        isReadyForValidation,
        isSubmitting,
        ownerOptions,
        progressPercent,
        remediationStatus,
        requestedExceptionId,
        setAssignDueAt,
        setAssignOwnerId,
        setBlockerReason,
        setCompletionNotes,
        setExceptionExpiresAt,
        setExceptionReason,
        setProgressPercent,
        setRemediationStatus,
        setValidationNote,
        validationNote,
    };
}

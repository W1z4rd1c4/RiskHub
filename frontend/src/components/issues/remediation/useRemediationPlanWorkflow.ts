import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { issueDetailQueryKey, issueHistoryQueryKey } from '@/lib/queryKeys/issues';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { apiClient } from '@/services/apiClient';
import { issuesApi } from '@/services/issuesApi';
import { useSessionSnapshot } from '@/services/session';
import type { Issue, IssueOwnerLookup, IssueRemediationStatus } from '@/types/issue';
import { fromDateTimeLocalInputValue, toDateTimeLocalInputValue } from '@/utils/dateTimeLocal';

interface UseRemediationPlanWorkflowOptions {
    issue: Issue;
}

type WorkflowField =
    | 'assignOwnerId'
    | 'assignDueAt'
    | 'progressPercent'
    | 'remediationStatus'
    | 'blockerReason'
    | 'completionNotes'
    | 'exceptionReason'
    | 'exceptionExpiresAt'
    | 'validationNote';

interface IssueWorkflowDraft {
    assignOwnerId: string;
    assignDueAt: string;
    progressPercent: string;
    remediationStatus: string;
    blockerReason: string;
    completionNotes: string;
    validationNote: string;
}

export const REMEDIATION_STATUSES: IssueRemediationStatus[] = ['draft', 'active', 'blocked', 'completed'];

function draftFromIssue(issue: Issue): IssueWorkflowDraft {
    return {
        assignOwnerId: issue.owner_user_id ? String(issue.owner_user_id) : '',
        assignDueAt: toDateTimeLocalInputValue(issue.due_at),
        progressPercent: issue.remediation_plan ? String(issue.remediation_plan.progress_percent) : '0',
        remediationStatus: issue.remediation_plan?.status ?? 'active',
        blockerReason: issue.remediation_plan?.blocker_reason ?? '',
        completionNotes: issue.remediation_plan?.completion_notes ?? '',
        validationNote: issue.validation_note ?? '',
    };
}

export function useRemediationPlanWorkflow({ issue }: UseRemediationPlanWorkflowOptions) {
    const queryClient = useQueryClient();
    const session = useSessionSnapshot();
    const initialDraft = draftFromIssue(issue);
    const dirtyFieldsRef = useRef<Set<WorkflowField>>(new Set());
    const issueIdRef = useRef(issue.id);
    const [assignOwnerId, setAssignOwnerIdState] = useState<string>(initialDraft.assignOwnerId);
    const [assignDueAt, setAssignDueAtState] = useState<string>(initialDraft.assignDueAt);
    const [progressPercent, setProgressPercentState] = useState<string>(initialDraft.progressPercent);
    const [remediationStatus, setRemediationStatusState] = useState<string>(initialDraft.remediationStatus);
    const [blockerReason, setBlockerReasonState] = useState<string>(initialDraft.blockerReason);
    const [completionNotes, setCompletionNotesState] = useState<string>(initialDraft.completionNotes);
    const [exceptionReason, setExceptionReasonState] = useState<string>('');
    const [exceptionExpiresAt, setExceptionExpiresAtState] = useState<string>('');
    const [validationNote, setValidationNoteState] = useState<string>(initialDraft.validationNote);
    const [ownerOptions, setOwnerOptions] = useState<IssueOwnerLookup[]>([]);
    const [isOwnersLoading, setIsOwnersLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const isClosed = issue.status === 'closed';
    const canUseOwnerLookup = resolveCapabilityFlag(issue.capabilities, 'can_use_owner_lookup');
    const canAssignOwner = resolveCapabilityFlag(issue.capabilities, 'can_assign_owner');
    const canStartRemediation = (
        (issue.status === 'open' || issue.status === 'triaged')
        && resolveCapabilityFlag(issue.capabilities, 'can_start_remediation')
    );
    const canUpdateProgress = resolveCapabilityFlag(issue.capabilities, 'can_update_remediation_progress');
    const canRequestException = resolveCapabilityFlag(issue.capabilities, 'can_request_exception');
    const canApproveException = resolveCapabilityFlag(issue.capabilities, 'can_approve_exception');
    const canClose = resolveCapabilityFlag(issue.capabilities, 'can_close');
    const isInProgress = issue.status === 'in_progress';
    const isReadyForValidation = issue.status === 'ready_for_validation';
    const requestedExceptionId = useMemo(() => {
        const requested = issue.exceptions
            .filter((exception) => exception.status === 'requested')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return requested[0]?.id;
    }, [issue.exceptions]);

    function setDirtyField(
        field: WorkflowField,
        setter: Dispatch<SetStateAction<string>>,
    ): Dispatch<SetStateAction<string>> {
        return (value) => {
            dirtyFieldsRef.current.add(field);
            setter(value);
        };
    }

    const setAssignOwnerId = setDirtyField('assignOwnerId', setAssignOwnerIdState);
    const setAssignDueAt = setDirtyField('assignDueAt', setAssignDueAtState);
    const setProgressPercent = setDirtyField('progressPercent', setProgressPercentState);
    const setRemediationStatus = setDirtyField('remediationStatus', setRemediationStatusState);
    const setBlockerReason = setDirtyField('blockerReason', setBlockerReasonState);
    const setCompletionNotes = setDirtyField('completionNotes', setCompletionNotesState);
    const setExceptionReason = setDirtyField('exceptionReason', setExceptionReasonState);
    const setExceptionExpiresAt = setDirtyField('exceptionExpiresAt', setExceptionExpiresAtState);
    const setValidationNote = setDirtyField('validationNote', setValidationNoteState);

    function markFieldsClean(fields: WorkflowField[]): void {
        for (const field of fields) {
            dirtyFieldsRef.current.delete(field);
        }
    }

    const applyDraftFromIssue = useCallback((updatedIssue: Issue, resetAll: boolean): void => {
        const draft = draftFromIssue(updatedIssue);
        if (resetAll) {
            dirtyFieldsRef.current.clear();
        }
        const applyClean = (
            field: WorkflowField,
            setter: Dispatch<SetStateAction<string>>,
            value: string,
        ) => {
            if (resetAll || !dirtyFieldsRef.current.has(field)) {
                setter(value);
            }
        };

        applyClean('assignOwnerId', setAssignOwnerIdState, draft.assignOwnerId);
        applyClean('assignDueAt', setAssignDueAtState, draft.assignDueAt);
        applyClean('progressPercent', setProgressPercentState, draft.progressPercent);
        applyClean('remediationStatus', setRemediationStatusState, draft.remediationStatus);
        applyClean('blockerReason', setBlockerReasonState, draft.blockerReason);
        applyClean('completionNotes', setCompletionNotesState, draft.completionNotes);
        applyClean('validationNote', setValidationNoteState, draft.validationNote);

        if (resetAll) {
            setExceptionReasonState('');
            setExceptionExpiresAtState('');
        }
    }, []);

    useEffect(() => {
        const issueChanged = issueIdRef.current !== issue.id;
        if (issueChanged) {
            issueIdRef.current = issue.id;
        }
        applyDraftFromIssue(issue, issueChanged);
        setErrorKey(null);
        setIsSubmitting(false);
    }, [applyDraftFromIssue, issue]);

    useEffect(() => {
        if (!canUseOwnerLookup || isClosed) {
            setOwnerOptions([]);
            setIsOwnersLoading(false);
            return;
        }
        setIsOwnersLoading(true);
        issuesApi
            .listAssignableOwners(issue.department_id)
            .then((owners) => {
                setOwnerOptions(owners);
                setAssignOwnerIdState((previous) => {
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
    }, [canUseOwnerLookup, isClosed, issue.department_id]);

    async function syncIssue(updatedIssue: Issue, acknowledgedFields: WorkflowField[] = []): Promise<void> {
        markFieldsClean(acknowledgedFields);
        applyDraftFromIssue(updatedIssue, false);
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
            await syncIssue(updated, ['assignOwnerId', 'assignDueAt']);
        });
    }

    async function handleStartRemediation(): Promise<void> {
        await runMutation(async () => {
            const updated = await issuesApi.startRemediation(issue.id, {
                target_date: fromDateTimeLocalInputValue(assignDueAt),
            });
            await syncIssue(updated, ['assignDueAt']);
        });
    }

    async function handleUpdateProgress(): Promise<void> {
        await runMutation(async () => {
            const percent = Number(progressPercent);
            const updated = await issuesApi.updateProgress(issue.id, {
                progress_percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : undefined,
                remediation_status: remediationStatus as IssueRemediationStatus,
                // Empty string means "clear on the server"; undefined would drop the key.
                blocker_reason: blockerReason,
                completion_notes: completionNotes,
            });
            await syncIssue(updated, ['progressPercent', 'remediationStatus', 'blockerReason', 'completionNotes']);
        });
    }

    async function handleRequestException(): Promise<void> {
        if (!exceptionReason.trim()) {
            setErrorKey('errors.exception_reason_required');
            return;
        }

        await runMutation(async () => {
            await issuesApi.requestException(issue.id, { reason: exceptionReason.trim() });
            markFieldsClean(['exceptionReason']);
            setExceptionReasonState('');
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
            markFieldsClean(['exceptionExpiresAt']);
            setExceptionExpiresAtState('');
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
                // Empty string means "clear on the server"; undefined would drop the key.
                completion_notes: completionNotes,
            });
            await syncIssue(updated, ['validationNote', 'completionNotes']);
        });
    }

    return {
        assignDueAt,
        assignOwnerId,
        blockerReason,
        canApproveException,
        canAssignOwner,
        canClose,
        canRequestException,
        canStartRemediation,
        canUpdateProgress,
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

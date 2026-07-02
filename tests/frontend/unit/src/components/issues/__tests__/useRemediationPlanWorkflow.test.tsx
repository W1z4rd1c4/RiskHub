import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemediationPlanWorkflow } from '@/components/issues/remediation/useRemediationPlanWorkflow';
import type { Issue } from '@/types/issue';
import { toDateTimeLocalInputValue } from '@/utils/dateTimeLocal';
import { createTestQueryClient } from '@test/queryClient';

const mockListAssignableOwners = vi.fn();
const mockUpdateProgress = vi.fn();
const mockClose = vi.fn();

vi.mock('@/services/issuesApi', () => ({
    issuesApi: {
        listAssignableOwners: (...args: unknown[]) => mockListAssignableOwners(...args),
        get: vi.fn(),
        assign: vi.fn(),
        startRemediation: vi.fn(),
        updateProgress: (...args: unknown[]) => mockUpdateProgress(...args),
        requestException: vi.fn(),
        approveException: vi.fn(),
        close: (...args: unknown[]) => mockClose(...args),
    },
}));

function makeIssue(overrides: Partial<Issue> = {}): Issue {
    return {
        id: 11,
        title: 'Issue title',
        severity: 'high',
        status: 'in_progress',
        source_type: 'manual',
        source_id: null,
        department_id: 5,
        department_name: 'Risk Management',
        owner_user_id: 2,
        owner_user_name: 'Anna Kowalski',
        opened_at: '2026-02-01T10:00:00Z',
        due_at: '2026-02-20T10:00:00Z',
        closed_at: null,
        created_at: '2026-02-01T10:00:00Z',
        updated_at: '2026-02-01T10:00:00Z',
        risk_contexts: [],
        description: 'Desc',
        created_by_id: 2,
        created_by_name: 'Anna Kowalski',
        validation_note: 'Initial validation',
        links: [],
        remediation_plan: {
            id: 1,
            issue_id: 11,
            status: 'active',
            progress_percent: 50,
            owner_user_id: 2,
            owner_user_name: 'Anna Kowalski',
            target_date: '2026-02-20T10:00:00Z',
            blocker_reason: null,
            completion_notes: 'Initial completion',
            completed_at: null,
            created_at: '2026-02-01T10:00:00Z',
            updated_at: '2026-02-01T10:00:00Z',
        },
        exceptions: [],
        capabilities: {
            can_read: true,
            can_update: true,
            can_change_department: true,
            can_assign_owner: true,
            can_clear_owner: true,
            can_start_remediation: true,
            can_update_remediation_progress: true,
            can_mark_remediation_blocked: true,
            can_mark_remediation_completed: true,
            can_request_exception: true,
            can_approve_exception: true,
            can_revoke_exception: true,
            can_close: true,
            can_link_risk: true,
            can_link_control: true,
            can_link_execution: true,
            can_link_kri: true,
            can_link_vendor: true,
            can_unlink_entities: true,
            can_view_risk_contexts: true,
            can_view_vendor_contexts: true,
            can_use_department_lookup: true,
            can_use_owner_lookup: false,
            is_owner: true,
            is_closed: false,
            has_active_exception: false,
            has_pending_exception_request: false,
        },
        ...overrides,
    };
}

function createWrapper() {
    const queryClient = createTestQueryClient();

    return function Wrapper({ children }: PropsWithChildren) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useRemediationPlanWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('server_refresh_does_not_clobber_dirty_fields', async () => {
        const initialIssue = makeIssue();
        const refreshedIssue = makeIssue({
            updated_at: '2026-02-02T10:00:00Z',
            owner_user_id: 8,
            due_at: '2026-03-20T10:00:00Z',
            validation_note: 'Server validation',
            remediation_plan: {
                ...initialIssue.remediation_plan!,
                progress_percent: 20,
                status: 'blocked',
                blocker_reason: 'Server blocker',
                completion_notes: 'Server completion',
                updated_at: '2026-02-02T10:00:00Z',
            },
        });

        const { result, rerender } = renderHook(
            ({ issue }) => useRemediationPlanWorkflow({ issue }),
            { initialProps: { issue: initialIssue }, wrapper: createWrapper() },
        );

        act(() => {
            result.current.setAssignOwnerId('7');
            result.current.setProgressPercent('75');
            result.current.setBlockerReason('Local blocker');
            result.current.setExceptionReason('Local exception request');
            result.current.setExceptionExpiresAt('2026-04-01T08:00');
            result.current.setValidationNote('Local validation');
        });

        rerender({ issue: refreshedIssue });

        await waitFor(() => {
            expect(result.current.assignDueAt).toBe(toDateTimeLocalInputValue(refreshedIssue.due_at));
        });

        expect(result.current.assignOwnerId).toBe('7');
        expect(result.current.progressPercent).toBe('75');
        expect(result.current.blockerReason).toBe('Local blocker');
        expect(result.current.exceptionReason).toBe('Local exception request');
        expect(result.current.exceptionExpiresAt).toBe('2026-04-01T08:00');
        expect(result.current.validationNote).toBe('Local validation');

        expect(result.current.remediationStatus).toBe('blocked');
        expect(result.current.completionNotes).toBe('Server completion');
    });

    it('changing_issue_id_resets_workflow_fields', async () => {
        const initialIssue = makeIssue();
        const nextIssue = makeIssue({
            id: 12,
            owner_user_id: 8,
            due_at: '2026-03-15T11:00:00Z',
            validation_note: 'Next validation',
            remediation_plan: {
                ...initialIssue.remediation_plan!,
                id: 2,
                issue_id: 12,
                progress_percent: 15,
                status: 'draft',
                blocker_reason: 'Next blocker',
                completion_notes: 'Next completion',
            },
        });

        const { result, rerender } = renderHook(
            ({ issue }) => useRemediationPlanWorkflow({ issue }),
            { initialProps: { issue: initialIssue }, wrapper: createWrapper() },
        );

        act(() => {
            result.current.setAssignOwnerId('7');
            result.current.setAssignDueAt('2026-04-01T12:00');
            result.current.setProgressPercent('75');
            result.current.setRemediationStatus('completed');
            result.current.setBlockerReason('Local blocker');
            result.current.setCompletionNotes('Local completion');
            result.current.setExceptionReason('Local exception request');
            result.current.setExceptionExpiresAt('2026-04-01T08:00');
            result.current.setValidationNote('Local validation');
        });

        rerender({ issue: nextIssue });

        await waitFor(() => {
            expect(result.current.assignOwnerId).toBe('8');
        });

        expect(result.current.assignDueAt).toBe(toDateTimeLocalInputValue(nextIssue.due_at));
        expect(result.current.progressPercent).toBe('15');
        expect(result.current.remediationStatus).toBe('draft');
        expect(result.current.blockerReason).toBe('Next blocker');
        expect(result.current.completionNotes).toBe('Next completion');
        expect(result.current.exceptionReason).toBe('');
        expect(result.current.exceptionExpiresAt).toBe('');
        expect(result.current.validationNote).toBe('Next validation');
    });

    it('clearing_notes_sends_empty_strings_so_backend_can_clear_them', async () => {
        const base = makeIssue();
        const issue = makeIssue({
            remediation_plan: {
                ...base.remediation_plan!,
                blocker_reason: 'Old blocker',
                completion_notes: 'Old completion',
            },
        });
        const clearedIssue = makeIssue({
            remediation_plan: {
                ...base.remediation_plan!,
                blocker_reason: null,
                completion_notes: null,
            },
        });
        mockUpdateProgress.mockResolvedValue(clearedIssue);
        mockClose.mockResolvedValue(clearedIssue);

        const { result } = renderHook(
            ({ issue: current }) => useRemediationPlanWorkflow({ issue: current }),
            { initialProps: { issue }, wrapper: createWrapper() },
        );

        act(() => {
            result.current.setBlockerReason('');
            result.current.setCompletionNotes('');
        });

        await act(async () => {
            await result.current.handleUpdateProgress();
        });

        expect(mockUpdateProgress).toHaveBeenCalledWith(
            issue.id,
            expect.objectContaining({ blocker_reason: '', completion_notes: '' }),
        );

        act(() => {
            result.current.setValidationNote('Validated');
        });

        await act(async () => {
            await result.current.handleClose();
        });

        expect(mockClose).toHaveBeenCalledWith(
            issue.id,
            expect.objectContaining({ completion_notes: '' }),
        );
    });
});

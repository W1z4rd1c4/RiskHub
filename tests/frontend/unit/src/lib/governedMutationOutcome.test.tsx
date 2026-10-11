import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { governedMutationRejection, governedMutationSuccess, isApprovalCreatedResponse } from '@/lib/governedMutationOutcome';
import { useEntityDetailMutationWorkflow } from '@/pages/detail/useEntityDetailMutationWorkflow';
import { parseUpdateResult } from '@/lib/approvalUi';
import { approvalRequestHref } from '@/pages/approvals/approvalNavigation';
import { ApiClientError } from '@/services/apiClient';
import { reasonBody, reasonField, withReason } from '@/services/api/governedReason';

const legacy = {
    status: 'approval_required', approval_id: 17, message: 'Approval required',
    action_type: 'edit', resource_id: 4, pending_fields: ['name'],
};
const proposal = {
    ...legacy, approval_id: 18, proposal_id: '93b63276-ec80-40c0-82f3-bb9beeb751ff', proposal_version: 1,
};

describe('governed mutation outcome interface', () => {
    it.each([legacy, proposal])('recognizes both real envelope families without an optional presentation key', async (response) => {
        const execute = vi.fn().mockResolvedValue(response);
        const queued = vi.fn();
        const direct = vi.fn();
        const close = vi.fn();
        const message = vi.fn();
        const { result } = renderHook(() => useEntityDetailMutationWorkflow({
            setMessage: message, toErrorKey: () => 'fallback', onApprovalQueued: queued,
        }));
        await act(async () => {
            const outcome = await result.current.runEntityMutation({ execute, onDirectSuccess: direct, closeDialog: close });
            expect(outcome.kind).toBe('approval_queued');
        });
        expect(execute).toHaveBeenCalledTimes(1);
        expect(queued).toHaveBeenCalledExactlyOnceWith(response);
        expect(close).toHaveBeenCalledTimes(1);
        expect(direct).not.toHaveBeenCalled();
        expect(message).not.toHaveBeenCalled();
        expect(result.current.isMutating).toBe(false);
        expect(governedMutationSuccess(response)).toMatchObject({
            kind: 'pending', approvalId: response.approval_id, href: approvalRequestHref(response.approval_id),
        });
    });

    it.each([
        null, undefined, [], { id: 5, status: 'active' }, { id: 5, status: 'pending', approval_id: 9 },
        { status: 'approval_required' }, { status: 'approval_required', approval_id: '4' },
        { status: 'approval_required', approval_id: 0 }, { status: 'approval_required', approval_id: -1 },
        { status: 'approval_required', approval_id: 1.5 }, { status: 'approval_required', approval_id: Infinity },
    ])('does not misclassify ordinary or malformed data as a queued outcome: %j', (response) => {
        expect(isApprovalCreatedResponse(response)).toBe(false);
        if (response && typeof response === 'object' && 'status' in response && response.status === 'approval_required') {
            expect(() => governedMutationSuccess(response)).toThrow(ApiClientError);
        } else {
            expect(governedMutationSuccess(response)).toEqual({ kind: 'applied', response });
        }
    });

    it('keeps the legacy adapter shape with the same malformed-envelope refusal', () => {
        expect(parseUpdateResult(legacy)).toEqual({ kind: 'approval', approvalId: legacy.approval_id, message: legacy.message });
        expect(parseUpdateResult({ id: 42 })).toEqual({ kind: 'applied' });
        expect(() => parseUpdateResult({ status: 'approval_required', approval_id: 0 })).toThrow(ApiClientError);
    });

    it('runs immediate save exactly once', async () => {
        const response = { id: 12, name: 'Saved' };
        const direct = vi.fn();
        const queued = vi.fn();
        const { result } = renderHook(() => useEntityDetailMutationWorkflow({
            setMessage: vi.fn(), toErrorKey: () => 'fallback', onApprovalQueued: queued,
        }));
        await act(async () => {
            expect((await result.current.runEntityMutation({ execute: vi.fn().mockResolvedValue(response), onDirectSuccess: direct })).kind).toBe('direct_success');
        });
        expect(direct).toHaveBeenCalledTimes(1);
        expect(queued).not.toHaveBeenCalled();
    });

    it.each(['process', 'asset', 'vendor', 'threat'])('maps the %s pending code through the same owner', async (family) => {
        const error = new ApiClientError({ status: 409, code: `${family}_pending_mutation`, messageKey: 'raw' });
        expect(governedMutationRejection(error)).toEqual({ kind: 'rejected', error, message: 'pending_change_exists' });
        const message = vi.fn();
        const direct = vi.fn();
        const close = vi.fn();
        const { result } = renderHook(() => useEntityDetailMutationWorkflow({ setMessage: message, toErrorKey: () => 'fallback' }));
        await act(async () => {
            const outcome = await result.current.runEntityMutation({ execute: vi.fn().mockRejectedValue(error), closeDialog: close, onDirectSuccess: direct });
            expect(outcome.kind).toBe('failed');
        });
        expect(message).toHaveBeenCalledExactlyOnceWith({ key: 'common:governed_mutation.pending_change_exists', isError: true });
        expect(close).not.toHaveBeenCalled();
        expect(direct).not.toHaveBeenCalled();
    });

    it('maps only the actual reason-required rejection to the field and retains generic fallbacks', () => {
        const error = new ApiClientError({ status: 422, code: 'governed_mutation_reason_required', messageKey: 'raw' });
        expect(governedMutationRejection(error)).toEqual({ kind: 'rejected', error, message: 'request_reason_required', field: 'request_reason' });
        for (const other of [new Error('network'), new ApiClientError({ status: 409, code: 'unknown', messageKey: 'raw' }),
            new ApiClientError({ status: 403, code: 'governed_mutation_reason_required', messageKey: 'raw' })]) {
            expect(governedMutationRejection(other)).toEqual({ kind: 'rejected', error: other, message: 'save_failed' });
        }
    });

    it('publishes no result after ownership changes during the awaited direct callback', async () => {
        let current = true;
        let complete!: () => void;
        const direct = vi.fn(() => new Promise<void>((resolve) => { complete = resolve; }));
        const message = vi.fn();
        const close = vi.fn();
        const { result } = renderHook(() => useEntityDetailMutationWorkflow({ setMessage: message, toErrorKey: () => 'fallback' }));
        let pending: Promise<unknown>;
        await act(async () => {
            pending = result.current.runEntityMutation({ execute: vi.fn().mockResolvedValue(undefined), onDirectSuccess: direct, successKey: 'saved', closeDialog: close, isCurrent: () => current });
            await Promise.resolve();
        });
        expect(direct).toHaveBeenCalledTimes(1);
        current = false;
        await act(async () => {
            complete();
            expect(await pending!).toMatchObject({ kind: 'superseded' });
        });
        expect(message).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        // The superseded operation must not clear a newer owner's busy state.
        expect(result.current.isMutating).toBe(true);
    });
});

describe('canonical governed reason serialization', () => {
    it.each([undefined, '', '  \n\t '])('omits blank reasons without changing the caller: %j', (reason) => {
        const input = Object.freeze({ name: 'Draft', request_reason: reason });
        expect(reasonField(reason)).toEqual({});
        expect(reasonBody(reason)).toEqual({});
        expect(withReason(input)).toEqual({ name: 'Draft' });
        expect(input).toEqual({ name: 'Draft', request_reason: reason });
    });
    it('preserves payload fields and trims the reason for JSON and DELETE', () => {
        const input = Object.freeze({ name: 'Draft', value: 0, request_reason: '  Independent review \n' });
        expect(withReason(input)).toEqual({ name: 'Draft', value: 0, request_reason: 'Independent review' });
        expect(reasonBody(input.request_reason)).toEqual({ body: JSON.stringify({ request_reason: 'Independent review' }) });
        expect(input.request_reason).toBe('  Independent review \n');
    });
});

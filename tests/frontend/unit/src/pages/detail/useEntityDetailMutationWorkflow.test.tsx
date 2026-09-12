import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildDetailMutationPresentation } from '@/pages/detail/detailMutationPresentation';
import { useEntityDetailMutationWorkflow } from '@/pages/detail/useEntityDetailMutationWorkflow';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';

function MutationHarness({
    execute,
    isCurrent = () => true,
}: {
    execute: () => Promise<unknown>;
    isCurrent?: () => boolean;
}) {
    const setMessage = vi.fn((message: DetailActionMessage) => {
        window.__entityMutationMessage = message;
    });
    const onDirectSuccess = vi.fn(() => {
        window.__entityMutationDirectCount = (window.__entityMutationDirectCount ?? 0) + 1;
    });
    const workflow = useEntityDetailMutationWorkflow({
        setMessage,
        toErrorKey: () => 'errorKeys.mutation_failed',
    });

    return (
        <div>
            <p data-testid="mutating">{String(workflow.isMutating)}</p>
            <button
                type="button"
                onClick={() => void workflow.runEntityMutation({
                    approvalKey: 'approval.queued',
                    execute,
                    isCurrent,
                    onDirectSuccess,
                })}
            >
                mutate
            </button>
        </div>
    );
}

declare global {
    interface Window {
        __entityMutationDirectCount?: number;
        __entityMutationMessage?: DetailActionMessage;
    }
}

describe('useEntityDetailMutationWorkflow', () => {
    it('normalizes approval queued, direct success, and banner presentation facts', async () => {
        window.__entityMutationDirectCount = 0;
        window.__entityMutationMessage = undefined;
        const execute = vi.fn().mockResolvedValue({ status: 'approval_required', approval_id: 9 });

        render(<MutationHarness execute={execute} />);
        fireEvent.click(screen.getByRole('button', { name: 'mutate' }));

        await waitFor(() => {
            expect(window.__entityMutationMessage).toEqual({ key: 'approval.queued', isError: false });
        });
        expect(window.__entityMutationDirectCount).toBe(0);

        const presentation = buildDetailMutationPresentation({
            approvalsLabel: 'Approvals',
            message: window.__entityMutationMessage,
            onNavigateApprovals: () => undefined,
            pendingText: 'View',
        });

        expect(presentation).toMatchObject({
            showApprovalLink: true,
            tone: 'pending',
        });
    });

    it('does not publish late success or failure effects for a superseded owner', async () => {
        let resolve!: (value: unknown) => void;
        let reject!: (error: unknown) => void;
        let current = true;
        const success = new Promise((accept) => { resolve = accept; });
        const failure = new Promise((_accept, decline) => { reject = decline; });

        window.__entityMutationDirectCount = 0;
        window.__entityMutationMessage = undefined;
        const { rerender } = render(
            <MutationHarness execute={() => success} isCurrent={() => current} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'mutate' }));
        current = false;
        resolve(undefined);

        await waitFor(() => expect(window.__entityMutationDirectCount).toBe(0));
        expect(window.__entityMutationMessage).toBeUndefined();

        current = true;
        rerender(<MutationHarness execute={() => failure} isCurrent={() => current} />);
        fireEvent.click(screen.getByRole('button', { name: 'mutate' }));
        current = false;
        reject(new Error('late owner failure'));

        await waitFor(() => expect(window.__entityMutationMessage).toBeUndefined());
        expect(window.__entityMutationDirectCount).toBe(0);
    });
});

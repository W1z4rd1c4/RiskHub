import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useArchiveRestoreAction } from '@/pages/detail/useArchiveRestoreAction';
import type { DetailActionMessage } from '@/pages/detail/DetailActionBanner';

function ArchiveRestoreHarness({
    archive,
    restore,
}: {
    archive: () => Promise<unknown>;
    restore: () => Promise<unknown>;
}) {
    const setMessage = vi.fn((message: DetailActionMessage) => {
        window.__lastDetailMessage = message;
    });
    const onImmediate = vi.fn(() => {
        window.__detailImmediateCount = (window.__detailImmediateCount ?? 0) + 1;
    });
    const onRestored = vi.fn(() => {
        window.__detailRestoredCount = (window.__detailRestoredCount ?? 0) + 1;
    });
    const { isRunning, runArchive, runRestore } = useArchiveRestoreAction({
        setMessage,
        toErrorKey: () => 'errorKeys.action_failed',
    });

    return (
        <div>
            <p data-testid="running">{String(isRunning)}</p>
            <button
                type="button"
                onClick={() => void runArchive({
                    archive,
                    approvalKey: 'approval.submitted',
                    onImmediate,
                })}
            >
                archive
            </button>
            <button
                type="button"
                onClick={() => void runRestore({
                    restore,
                    successKey: 'restore.ok',
                    onRestored,
                })}
            >
                restore
            </button>
        </div>
    );
}

declare global {
    interface Window {
        __detailImmediateCount?: number;
        __detailRestoredCount?: number;
        __lastDetailMessage?: DetailActionMessage;
    }
}

describe('useArchiveRestoreAction', () => {
    it('runs immediate archive callbacks for non-approval responses', async () => {
        window.__detailImmediateCount = 0;
        const archive = vi.fn().mockResolvedValue(undefined);

        render(<ArchiveRestoreHarness archive={archive} restore={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'archive' }));

        await waitFor(() => {
            expect(window.__detailImmediateCount).toBe(1);
        });
        expect(window.__lastDetailMessage).toBeUndefined();
    });

    it('stores approval messages for approval-created archive responses', async () => {
        window.__detailImmediateCount = 0;
        window.__lastDetailMessage = undefined;
        const archive = vi.fn().mockResolvedValue({
            status: 'approval_required',
            approval_id: 7,
        });

        render(<ArchiveRestoreHarness archive={archive} restore={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'archive' }));

        await waitFor(() => {
            expect(window.__lastDetailMessage).toEqual({ key: 'approval.submitted', isError: false });
        });
        expect(window.__detailImmediateCount).toBe(0);
    });

    it('runs restore callback and stores success messages', async () => {
        window.__detailRestoredCount = 0;
        window.__lastDetailMessage = undefined;
        const restore = vi.fn().mockResolvedValue(undefined);

        render(<ArchiveRestoreHarness archive={vi.fn()} restore={restore} />);
        fireEvent.click(screen.getByRole('button', { name: 'restore' }));

        await waitFor(() => {
            expect(window.__detailRestoredCount).toBe(1);
        });
        expect(window.__lastDetailMessage).toEqual({ key: 'restore.ok', isError: false });
    });

    it('maps action failures to error messages', async () => {
        window.__lastDetailMessage = undefined;
        const archive = vi.fn().mockRejectedValue(new Error('boom'));

        render(<ArchiveRestoreHarness archive={archive} restore={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'archive' }));

        await waitFor(() => {
            expect(window.__lastDetailMessage).toEqual({ key: 'errorKeys.action_failed', isError: true });
        });
    });
});

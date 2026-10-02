import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import '@/i18n';
import { buildProcessColumns, getProcessStatusTone } from '@/pages/processes/processColumns';
import type { Process } from '@/types/process';

const t = (key: string) => key;

function statusCell(process: Partial<Process>, handlers: { onRestore?: ReturnType<typeof vi.fn>; canRestore?: boolean } = {}) {
    const columns = buildProcessColumns({
        t,
        onRestore: handlers.onRestore ?? vi.fn(),
        canRestoreProcess: () => handlers.canRestore ?? false,
    });
    const column = columns.find((candidate) => candidate.key === 'status');
    return render(column?.render?.({ id: 7, ...process } as Process, 0) as ReactElement);
}

describe('Process register status cell', () => {
    it('reads active as success and archived as neutral (D1)', () => {
        expect(getProcessStatusTone('active')).toBe('success');
        expect(getProcessStatusTone('archived')).toBe('neutral');

        const { container, unmount } = statusCell({ is_archived: false });
        expect(screen.getByText('processes:status.active')).toHaveAttribute('data-tone', 'success');
        expect(container.querySelector('button')).toBeNull();
        unmount();

        statusCell({ is_archived: true });
        expect(screen.getByText('processes:status.archived')).toHaveAttribute('data-tone', 'neutral');
    });

    it('shows the shared pending-change badge only for a process with a pending change', () => {
        const { unmount } = statusCell({ is_archived: false, pending_change: null });
        expect(screen.queryByTestId('process-pending-change-7')).not.toBeInTheDocument();
        unmount();

        statusCell({ is_archived: false, pending_change: { approval_id: 1 } as Process['pending_change'] });
        const badge = screen.getByTestId('process-pending-change-7');
        expect(badge).toHaveAttribute('data-tone', 'warning');
        expect(badge).toHaveTextContent('Pending approval');
    });

    it('restores an archived row through a named icon button without activating the row', async () => {
        const onRestore = vi.fn();
        const onRowClick = vi.fn();
        const columns = buildProcessColumns({ t, onRestore, canRestoreProcess: () => true });
        const column = columns.find((candidate) => candidate.key === 'status');
        const { container } = render(
            <div onClick={onRowClick}>{column?.render?.({ id: 7, is_archived: true, l1_process: 'Payments' } as Process, 0) as ReactElement}</div>,
        );

        const restore = screen.getByRole('button', { name: 'Restore Payments' });
        expect(restore).toBe(screen.getByTestId('process-restore-7'));
        fireEvent.click(restore);
        expect(onRestore).toHaveBeenCalledWith(7, expect.anything());
        expect(onRowClick).not.toHaveBeenCalled();

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });

    it('offers no restore button when the capability is missing', () => {
        statusCell({ is_archived: true }, { canRestore: false });
        expect(screen.queryByTestId('process-restore-7')).not.toBeInTheDocument();
    });
});

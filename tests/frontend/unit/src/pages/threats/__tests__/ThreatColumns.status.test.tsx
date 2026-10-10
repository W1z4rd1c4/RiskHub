import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import '@/i18n';
import { buildThreatColumns, getThreatStatusTone } from '@/pages/threats/threatColumns';
import type { ThreatListItem } from '@/types/threat';

const t = (key: string) => key;

function renderStatusCell(threat: Partial<ThreatListItem>, onRestore = vi.fn(), canRestore = false) {
    const columns = buildThreatColumns({ t, onRestore, canRestoreThreat: () => canRestore });
    const column = columns.find((candidate) => candidate.key === 'status');
    return render(column?.render?.({ id: 9, ...threat } as ThreatListItem, 0) as ReactElement);
}

describe('Threat register status cell', () => {
    it('reads active as success and archived as neutral (D1)', () => {
        expect(getThreatStatusTone('active')).toBe('success');
        expect(getThreatStatusTone('archived')).toBe('neutral');

        const { unmount } = renderStatusCell({ is_archived: false });
        expect(screen.getByText('threats:status.active')).toHaveAttribute('data-tone', 'success');
        unmount();

        renderStatusCell({ is_archived: true });
        expect(screen.getByText('threats:status.archived')).toHaveAttribute('data-tone', 'neutral');
    });

    it('shows the pending-change badge that the register lacked (DS-13) and the governance badge', () => {
        renderStatusCell({
            is_archived: false,
            stewardship_status: 'pending_governance',
            capabilities: { has_pending_change: true } as ThreatListItem['capabilities'],
        });

        expect(screen.getByTestId('threat-pending-change-9')).toHaveTextContent('Pending approval');
        expect(screen.getByText('threats:status.pending_governance')).toHaveAttribute('data-tone', 'warning');
    });

    it('omits the pending-change badge without the capability', () => {
        renderStatusCell({ is_archived: false });
        expect(screen.queryByTestId('threat-pending-change-9')).not.toBeInTheDocument();
    });

    it('restores an archived row through a named icon button and passes the axe scan', async () => {
        const onRestore = vi.fn();
        const { container } = renderStatusCell({ is_archived: true, name: 'Phishing' }, onRestore, true);

        const restore = screen.getByRole('button', { name: 'Restore Phishing' });
        expect(restore).toBe(screen.getByTestId('threat-restore-9'));
        fireEvent.click(restore);
        expect(onRestore).toHaveBeenCalledWith(9, expect.anything());

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });
});

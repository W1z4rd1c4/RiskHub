import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildRiskColumns } from '@/pages/risks/riskColumns';
import type { RiskSummary } from '@/types/risk';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 (PG-28, GAP-B-03): the archived-risk row restore is a
 * `RowActionButton` — named, typed, tokenised, and it never activates the row.
 */
function renderActions(risk: Partial<RiskSummary>, handleRestoreRisk = vi.fn(), onRowClick = vi.fn()) {
    const columns = buildRiskColumns({
        t: (key) => key,
        getColor: () => '',
        getDisplayName: (value) => value,
        getInitials: (value) => value,
        getScoreColor: () => '',
        handleRestoreRisk,
    });
    const actions = columns.find((column) => column.key === 'actions');
    if (!actions?.render) throw new Error('actions column missing');
    renderWithoutProviders(
        <table>
            <tbody>
                <tr onClick={onRowClick}>
                    <td>{actions.render(risk as RiskSummary)}</td>
                </tr>
            </tbody>
        </table>,
    );
    return { handleRestoreRisk, onRowClick };
}

describe('risk register restore row action', () => {
    it('restores an archived risk through a named icon-only RowActionButton without activating the row', async () => {
        const user = userEvent.setup();
        const { handleRestoreRisk, onRowClick } = renderActions({
            id: 7,
            is_archived: true,
            capabilities: { can_restore: true },
        } as Partial<RiskSummary>);

        const restore = screen.getByRole('button', { name: 'Restore' });
        expect(restore).toHaveAttribute('type', 'button');
        expect(restore).toHaveAttribute('data-testid', 'risk-unarchive-7');
        expect(restore.className).not.toMatch(/emerald/);

        await user.click(restore);
        expect(handleRestoreRisk).toHaveBeenCalledTimes(1);
        expect(handleRestoreRisk.mock.calls[0]?.[0]).toBe(7);
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('omits the action without the restore capability', () => {
        renderActions({ id: 8, is_archived: true, capabilities: { can_restore: false } } as Partial<RiskSummary>);
        expect(screen.queryByTestId('risk-unarchive-8')).not.toBeInTheDocument();
    });
});

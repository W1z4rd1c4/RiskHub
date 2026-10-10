import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';

vi.mock('@/components/LinkManagementDialog', () => ({ LinkManagementDialog: () => null }));
vi.mock('@/components/RiskQuickViewModal', () => ({ RiskQuickViewModal: () => null }));

const activeLink = {
    id: 1,
    control_id: 7,
    risk_id: 41,
    effectiveness: 'high',
    risk: { id: 41, name: 'Active risk', description: 'Active risk description', is_archived: false },
};

const archivedLink = {
    id: 2,
    control_id: 7,
    risk_id: 42,
    effectiveness: 'medium',
    risk: { id: 42, name: 'Archived risk', description: 'Archived risk description', is_archived: true },
};

function renderOverview(onRiskClick = vi.fn()) {
    return render(
        <ControlDetailOverviewTab
            control={{
                id: 7,
                name: 'Access review',
                risk_level: 2,
                frequency: 'quarterly',
                control_form: 'preventive',
            } as never}
            t={(key) => key}
            linkedRisks={[activeLink, archivedLink] as never}
            activeLinkedRisks={[activeLink] as never}
            archivedLinkedRisks={[archivedLink] as never}
            canLinkRisk={false}
            canUnlinkRisk={false}
            linkErrorKey={null}
            linkedRisksErrorKey={null}
            linkedRisksOutcome="content"
            isLinkDialogOpen={false}
            selectedRisk={null}
            isRiskModalOpen={false}
            onOpenLinkDialog={vi.fn()}
            onCloseLinkDialog={vi.fn()}
            onLinkRisk={vi.fn()}
            onUnlinkRisk={vi.fn()}
            onRiskClick={onRiskClick}
            onCloseRiskModal={vi.fn()}
            onRetryLinkedRisks={vi.fn()}
        />
    );
}

describe('ControlDetailOverviewTab linked-risk controls', () => {
    it('renders every overview card fully opaque on its first committed frame', () => {
        renderOverview();

        const methodologyCard = screen.getByRole('heading', {
            name: 'controls:detail.methodology_source',
        }).closest('.glass-card');
        expect(methodologyCard).not.toBeNull();
        const grid = methodologyCard!.parentElement!;
        expect(grid).toHaveStyle({ opacity: '1' });
        expect(grid.children).toHaveLength(3);
        for (const card of Array.from(grid.children)) {
            expect(card).toHaveStyle({ opacity: '1' });
        }
    });

    it('renders active and archived risks as native buttons and forwards their ids', async () => {
        const user = userEvent.setup();
        const onRiskClick = vi.fn();

        renderOverview(onRiskClick);

        const activeButton = screen.getByRole('button', { name: /Active risk/i });
        const archivedButton = screen.getByRole('button', { name: /Archived risk/i });
        expect(activeButton).not.toHaveAttribute('role');
        expect(archivedButton).not.toHaveAttribute('role');
        await user.tab();
        expect(activeButton).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.tab();
        expect(archivedButton).toHaveFocus();
        await user.keyboard(' ');
        expect(onRiskClick).toHaveBeenNthCalledWith(1, 41, expect.any(Object));
        expect(onRiskClick).toHaveBeenNthCalledWith(2, 42, expect.any(Object));
    });
});

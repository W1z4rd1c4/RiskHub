import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

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

describe('ControlDetailOverviewTab linked-risk controls', () => {
    it('renders active and archived risks as native buttons and forwards their ids', async () => {
        const user = userEvent.setup();
        const onRiskClick = vi.fn();

        render(
            <ControlDetailOverviewTab
                control={{
                    id: 7,
                    name: 'Access review',
                    risk_level: 3,
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
                isLinkDialogOpen={false}
                selectedRisk={null}
                isRiskModalOpen={false}
                onOpenLinkDialog={vi.fn()}
                onCloseLinkDialog={vi.fn()}
                onLinkRisk={vi.fn()}
                onUnlinkRisk={vi.fn()}
                onRiskClick={onRiskClick}
                onCloseRiskModal={vi.fn()}
            />
        );

        const activeButton = screen.getByRole('button', { name: /Active risk/i });
        const archivedButton = screen.getByRole('button', { name: /Archived risk/i });
        expect(activeButton).not.toHaveAttribute('role');
        expect(archivedButton).not.toHaveAttribute('role');
        expect(activeButton.className).toContain('focus-visible:ring-2');
        expect(archivedButton.className).toContain('focus-visible:ring-2');

        activeButton.focus();
        await user.keyboard('{Enter}');
        archivedButton.focus();
        await user.keyboard(' ');
        expect(onRiskClick).toHaveBeenNthCalledWith(1, 41, expect.any(Object));
        expect(onRiskClick).toHaveBeenNthCalledWith(2, 42, expect.any(Object));
    });
});

import { fireEvent, render, screen } from '@testing-library/react';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { ProcessPendingCreationsPanel } from '@/pages/processes/ProcessPendingCreationsPanel';
import type { ProcessPendingCreationRead } from '@/types/process';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoAxeViolations(node: Element): Promise<void> {
    const results = await axe.run(node, {
        runOnly: { type: 'tag', values: AXE_TAGS },
        rules: { 'color-contrast': { enabled: false } },
    });
    const summary = results.violations.map((violation) => (
        `${violation.id} (${violation.nodes.length}): ${violation.help}`
    )).join('\n');
    expect(summary, summary).toBe('');
}

const pending: ProcessPendingCreationRead = {
    approval_id: 85,
    proposal_id: 'proposal-create-85',
    proposal_version: 1,
    status: 'pending_creation',
    requested_at: '2026-07-17T00:00:00Z',
    requested_by_name: 'Alice',
    reason: 'New critical function',
    proposed: {
        l0_area: 'Operations',
        l1_process: 'Critical settlement',
        process_owner: 'Alice Owner',
        owning_department: 'Operations',
    },
    derived: { cif: 'yes', criticality_class: 'critical' },
    capabilities: {
        can_view_diff: true,
        can_cancel: true,
        is_requester: true,
        can_resolve: false,
    },
};

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ProcessPendingCreationsPanel', () => {
    it('keeps the pending creation separate and exposes only safe labels and approval actions', () => {
        const onCancel = vi.fn();
        const onOpenRequest = vi.fn();
        render(
            <ProcessPendingCreationsPanel
                items={[pending]}
                cancellingApprovalId={null}
                onCancel={onCancel}
                onOpenRequest={onOpenRequest}
            />,
        );

        expect(screen.getByTestId('process-pending-creations')).toHaveTextContent('Critical settlement');
        expect(screen.getByTestId('process-pending-creations')).toHaveTextContent('Alice Owner');
        expect(screen.getByTestId('process-pending-creations')).not.toHaveTextContent('proposal-create-85');
        fireEvent.click(screen.getByRole('button', { name: 'Open request' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
        expect(onOpenRequest).toHaveBeenCalledWith(85, 'mine');
        expect(onCancel).toHaveBeenCalledWith(85);
    });

    it('does not disclose proposed values without diff capability', () => {
        render(
            <ProcessPendingCreationsPanel
                items={[{
                    ...pending,
                    capabilities: {
                        can_view_diff: false,
                        can_cancel: false,
                        is_requester: false,
                        can_resolve: true,
                    },
                }]}
                cancellingApprovalId={null}
                onCancel={vi.fn()}
                onOpenRequest={vi.fn()}
            />,
        );
        const panel = screen.getByTestId('process-pending-creations');
        expect(panel).not.toHaveTextContent('Critical settlement');
        expect(panel).not.toHaveTextContent('Operations');
        expect(panel).not.toHaveTextContent('Alice Owner');
        expect(panel).not.toHaveTextContent('New critical function');
        expect(panel).not.toHaveTextContent('Alice');
        expect(panel).not.toHaveTextContent('Yes');
        expect(panel).not.toHaveTextContent('85');
        expect(screen.getByText(/hidden by your permission scope/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open request' })).toBeEnabled();
    });

    it('keeps the redacted card generic in Czech and passes the accessibility scan', async () => {
        await i18n.changeLanguage('cs');
        const { container } = render(
            <ProcessPendingCreationsPanel
                items={[{
                    ...pending,
                    capabilities: {
                        can_view_diff: false,
                        can_cancel: false,
                        is_requester: false,
                        can_resolve: true,
                    },
                }]}
                cancellingApprovalId={null}
                onCancel={vi.fn()}
                onOpenRequest={vi.fn()}
            />,
        );

        const panel = screen.getByTestId('process-pending-creations');
        expect(panel).toHaveTextContent('Navrhované hodnoty jsou skryté');
        expect(panel).not.toHaveTextContent('Critical settlement');
        expect(panel).not.toHaveTextContent('New critical function');
        await expectNoAxeViolations(container);
    });

    it('routes an eligible non-requester resolver to the actionable queue', () => {
        const onOpenRequest = vi.fn();
        render(
            <ProcessPendingCreationsPanel
                items={[{
                    ...pending,
                    capabilities: {
                        can_view_diff: true,
                        can_cancel: false,
                        is_requester: false,
                        can_resolve: true,
                    },
                }]}
                cancellingApprovalId={null}
                onCancel={vi.fn()}
                onOpenRequest={onOpenRequest}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open request' }));
        expect(onOpenRequest).toHaveBeenCalledWith(85, 'pending');
    });
});

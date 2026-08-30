import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskLinkedControlsSection } from '@/components/risks/detail-overview/RiskLinkedControlsSection';
import { renderWithoutProviders as render } from '@test/render';
import { server } from '@test/mocks/server';

const createdControl = {
    id: 72,
    name: 'Context control',
    description: 'Context control description',
    control_form: 'manual',
    data_source: 'Claims ledger',
    methodology_reference: 'CTRL-72',
    process_owner_position: 'Control owner',
    control_owner_id: 99,
    department_id: 1,
    frequency: 'monthly',
    risk_level: 3,
    status: 'draft',
    is_archived: false,
    created_at: '2026-08-30T10:00:00Z',
    updated_at: '2026-08-30T10:00:00Z',
};

function SectionHarness({ onRefreshData }: { onRefreshData: () => void }) {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(true);

    return (
        <RiskLinkedControlsSection
            linkedControls={[]}
            activeControls={[]}
            draftControls={[]}
            archivedControls={[]}
            isLinkDialogOpen={false}
            setIsLinkDialogOpen={() => {}}
            dialogMode="both"
            setDialogMode={() => {}}
            isCreateDialogOpen={isCreateDialogOpen}
            setIsCreateDialogOpen={setIsCreateDialogOpen}
            onLinkControl={async () => {}}
            onUnlinkControl={async () => {}}
            onOpenCreateControl={() => setIsCreateDialogOpen(true)}
            onNavigateToControl={() => {}}
            onRefreshData={onRefreshData}
            canCreateLinkedControl
            canLinkControls
            canUnlinkControls
        />
    );
}

function renderSection(onRefreshData = vi.fn()) {
    const router = createMemoryRouter([{
        path: '/',
        element: <SectionHarness onRefreshData={onRefreshData} />,
    }]);
    render(<RouterProvider router={router} />);
    return onRefreshData;
}

async function fillValidControl(selectRisk: boolean) {
    fireEvent.change(screen.getByPlaceholderText('e.g. Daily Transaction Reconciliation'), {
        target: { value: 'Context control' },
    });
    fireEvent.change(screen.getByPlaceholderText('Describe the purpose and steps of this control...'), {
        target: { value: 'Context control description' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.click(await screen.findByRole('button', { name: /Control Owner/i }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Chief Accountant'), {
        target: { value: 'Control owner' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    fireEvent.change(screen.getByPlaceholderText('Data Source (e.g. SAP Export)'), {
        target: { value: 'Claims ledger' },
    });
    fireEvent.change(screen.getByPlaceholderText('Methodology Reference (e.g. Standard OS 18)'), {
        target: { value: 'CTRL-72' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    if (selectRisk) {
        fireEvent.click(await screen.findByRole('button', { name: /Authentication Drift/i }));
    }
}

describe('RiskLinkedControlsSection contextual Control creation', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/users/lookup/control-owners', () => HttpResponse.json([{
                id: 99,
                name: 'Control Owner',
                email: 'owner@example.test',
                role_name: 'employee',
                department_id: 1,
                department_name: 'IT',
            }])),
            http.get('*/api/v1/departments', () => HttpResponse.json([{
                id: 1,
                name: 'IT',
                code: 'IT',
                user_count: 0,
                risk_count: 0,
                high_risk_count: 0,
                control_count: 0,
                kri_count: 0,
                breaching_kri_count: 0,
                total_net_score: 0,
            }])),
            http.post('*/api/v1/controls', () => HttpResponse.json(createdControl, { status: 201 })),
        );
    });

    it('renders the localized partial-link warning near the module while closing and refetching', async () => {
        server.use(
            http.post('*/api/v1/controls/72/risks', () =>
                HttpResponse.json({ detail: 'Risk link failed' }, { status: 500 })),
        );
        const onRefreshData = renderSection();
        await screen.findByTestId('control-form-lookups-ready');
        await fillValidControl(true);

        fireEvent.click(screen.getByRole('button', { name: 'Create Control' }));

        expect(await screen.findByRole('status')).toHaveTextContent(
            'Control created, but linking the selected risk failed.',
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onRefreshData).toHaveBeenCalledTimes(1);
    });

    it('preserves the successful close and refetch flow without rendering a warning', async () => {
        const onRefreshData = renderSection();
        await screen.findByTestId('control-form-lookups-ready');
        await fillValidControl(false);

        fireEvent.click(screen.getByRole('button', { name: 'Create Control' }));

        await waitFor(() => expect(onRefreshData).toHaveBeenCalledTimes(1));
        expect(screen.getByText('No controls linked to this risk.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});

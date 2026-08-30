import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Link, RouterProvider, createMemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { KRIFormContainer } from '@/components/kri-form/KRIFormContainer';
import type { KRIFormVendorContext } from '@/components/kri-form/kriForm.types';
import type { KRICreate, KeyRiskIndicator } from '@/types/kri';
import { renderWithoutProviders as render } from '@test/render';
import { server } from '@test/mocks/server';

const initialData: Partial<KRICreate> = {
    risk_id: 1,
    metric_name: 'Baseline KRI',
    description: 'Baseline KRI description',
    current_value: 10,
    lower_limit: 2,
    upper_limit: 20,
    unit: '%',
    frequency: 'quarterly',
    reporting_owner_id: undefined,
};

const createdKri: KeyRiskIndicator = {
    id: 71,
    risk_id: 1,
    metric_name: 'Changed KRI',
    description: 'Baseline KRI description',
    current_value: 10,
    lower_limit: 2,
    upper_limit: 20,
    unit: '%',
    frequency: 'quarterly',
    breach_status: 'within',
    last_updated: '2026-08-30T10:00:00Z',
    created_at: '2026-08-30T10:00:00Z',
};

function KriCreateHarness({
    data = initialData,
    initialLinkedVendorIds = [],
    vendorContext = null,
}: {
    data?: Partial<KRICreate>;
    initialLinkedVendorIds?: number[];
    vendorContext?: KRIFormVendorContext | null;
}) {
    const navigate = useNavigate();
    return (
        <>
            <Link to="/done">Leave route</Link>
            <KRIFormContainer
                initialData={data}
                initialLinkedVendorIds={initialLinkedVendorIds}
                vendorContext={vendorContext}
                onCancel={() => navigate('/done')}
                onSuccess={() => navigate('/done')}
            />
        </>
    );
}

function renderKriCreate(options: {
    data?: Partial<KRICreate>;
    initialLinkedVendorIds?: number[];
    vendorContext?: KRIFormVendorContext | null;
} = {}) {
    const router = createMemoryRouter([
        { path: '/new', element: <KriCreateHarness {...options} /> },
        { path: '/done', element: <p>Destination reached</p> },
        { path: '/approvals', element: <p>Approval destination reached</p> },
    ], { initialEntries: ['/new'] });
    render(<RouterProvider router={router} />);
    return router;
}

describe('KRI create dirty-task protection', () => {
    beforeEach(() => {
        server.use(
            http.get('*/api/v1/vendors', () => HttpResponse.json({
                items: [
                    {
                        id: 12,
                        name: 'Vendor Twelve',
                        outsourcing_owner_user_id: 1,
                        linked_risks: [],
                        vendor_type: 'ict',
                        risk_score_1_5: 1,
                        supports_important_core_insurance_function: false,
                        dora_relevant: false,
                        is_significant_vendor: false,
                        has_alternative_providers: false,
                        process: 'Operations',
                        is_archived: false,
                        created_at: '2026-08-30T10:00:00Z',
                        updated_at: '2026-08-30T10:00:00Z',
                    },
                    {
                        id: 21,
                        name: 'Vendor Twenty-One',
                        outsourcing_owner_user_id: 1,
                        linked_risks: [],
                        vendor_type: 'ict',
                        risk_score_1_5: 1,
                        supports_important_core_insurance_function: false,
                        dora_relevant: false,
                        is_significant_vendor: false,
                        has_alternative_providers: false,
                        process: 'Operations',
                        is_archived: false,
                        created_at: '2026-08-30T10:00:00Z',
                        updated_at: '2026-08-30T10:00:00Z',
                    },
                ],
                total: 2,
                offset: 0,
                limit: 25,
            })),
        );
    });

    it('retains a changed create draft on Stay', async () => {
        const router = renderKriCreate();
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByDisplayValue('Baseline KRI'), {
            target: { value: 'Changed KRI' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
        expect(router.state.location.pathname).toBe('/new');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByDisplayValue('Changed KRI')).toBeInTheDocument();
    });

    it('ignores lookup search', async () => {
        renderKriCreate({ initialLinkedVendorIds: [12, 21] });
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByPlaceholderText('Search vendors...'), {
            target: { value: 'lookup only' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('canonicalizes the selected Vendor set', async () => {
        renderKriCreate({ initialLinkedVendorIds: [12, 21] });
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        const vendorTwelve = await screen.findByRole('checkbox', { name: 'Vendor Twelve' });
        fireEvent.click(vendorTwelve);
        fireEvent.click(vendorTwelve);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('does not dirty a Vendor-context create when its auto-linked Vendor is selected explicitly', async () => {
        server.use(
            http.get('*/api/v1/vendors/12/linked-risks', () => HttpResponse.json([])),
        );
        renderKriCreate({
            vendorContext: {
                vendorId: 12,
                vendorName: 'Vendor Twelve',
                returnTo: '/done',
            },
        });
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Vendor Twelve' }));
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('accepts the created entity before success navigation', async () => {
        server.use(
            http.post('*/api/v1/kris', () => HttpResponse.json(createdKri, { status: 201 })),
        );
        renderKriCreate();
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByDisplayValue('Baseline KRI'), {
            target: { value: 'Changed KRI' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create KRI' }));

        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('locks submitted KRI fields until a deferred create settles', async () => {
        const user = userEvent.setup();
        let resolveCreate: ((response: Response) => void) | undefined;
        server.use(
            http.post('*/api/v1/kris', () => new Promise<Response>((resolve) => {
                resolveCreate = resolve;
            })),
        );
        renderKriCreate();
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        const metricName = screen.getByDisplayValue('Baseline KRI');
        fireEvent.change(metricName, { target: { value: 'Changed KRI' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create KRI' }));

        await waitFor(() => expect(metricName).toBeDisabled());
        await user.type(metricName, 'Late mutation');
        expect(metricName).toHaveValue('Changed KRI');

        await act(async () => resolveCreate?.(HttpResponse.json(createdKri, { status: 201 })));
        expect(await screen.findByText('Destination reached')).toBeInTheDocument();
    });

    it('accepts a protected parent-Risk approval before real router navigation', async () => {
        server.use(
            http.get('*/api/v1/vendors/12/linked-risks', () => HttpResponse.json([])),
            http.post('*/api/v1/vendors/12/linked-risks', () => HttpResponse.json({
                status: 'approval_required',
                message: 'Parent Risk link queued for approval.',
                approval_id: 899,
                action_type: 'edit',
                pending_fields: ['linked_risks'],
                proposal_id: 'proposal-risk',
                proposal_version: 1,
            }, { status: 202 })),
        );
        const router = renderKriCreate({
            vendorContext: {
                vendorId: 12,
                vendorName: 'Vendor Twelve',
                returnTo: '/done',
                protectedChangeRequiresApproval: true,
            },
        });
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByDisplayValue('Baseline KRI'), {
            target: { value: 'Governed parent risk KRI' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create KRI' }));
        const mismatchDialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(mismatchDialog).getByRole('button', {
            name: /Request parent Risk link approval/i,
        }));
        const reasonDialog = await screen.findByRole('alertdialog');
        fireEvent.change(within(reasonDialog).getByRole('textbox', { name: /Request reason/i }), {
            target: { value: 'Govern the parent Risk first' },
        });
        fireEvent.click(within(reasonDialog).getByRole('button', { name: /Continue/i }));

        expect(await screen.findByText('Approval destination reached')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/approvals');
        expect(router.state.location.search).toBe('?tab=mine&approvalId=899');
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('keeps a rejected create dirty', async () => {
        server.use(
            http.post('*/api/v1/kris', () =>
                HttpResponse.json({ detail: 'KRI save failed' }, { status: 500 })),
        );
        renderKriCreate();
        await screen.findByText('Authentication Drift');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.change(screen.getByDisplayValue('Baseline KRI'), {
            target: { value: 'Changed KRI' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create KRI' }));
        expect(await screen.findByText(/KRI save failed/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('link', { name: 'Leave route' }));

        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    });
});

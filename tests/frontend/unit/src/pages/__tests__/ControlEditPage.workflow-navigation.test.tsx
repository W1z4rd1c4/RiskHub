import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ControlEditPage } from '@/pages/ControlEditPage';
import { ApiClientError } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { lookupApi } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import type { Control } from '@/types/control';
import { createTestQueryClient } from '@test/queryClient';

const control: Control = {
    id: 10,
    name: 'Payment reconciliation',
    description: 'Reconcile payment batches.',
    control_owner_id: 5,
    department_id: 2,
    process_owner_position: 'Payments lead',
    data_source: 'Payment ledger',
    methodology_reference: 'CTRL-PAY-01',
    control_form: 'manual',
    frequency: 'monthly',
    risk_level: 3,
    status: 'active',
    is_archived: false,
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    capabilities: {
        can_update: true,
        can_link_risk: true,
    } as Control['capabilities'],
};

function DetailProbe() {
    const location = useLocation();
    const flash = (location.state as { controlFlash?: { message: string } } | null)?.controlFlash;
    return (
        <>
            <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
            <output data-testid="control-flash">{flash?.message ?? 'no flash'}</output>
        </>
    );
}

describe('ControlEditPage workflow navigation', () => {
    beforeEach(() => {
        vi.spyOn(controlApi, 'getControl').mockResolvedValue(control);
        vi.spyOn(controlApi, 'updateControl').mockResolvedValue(control);
        vi.spyOn(controlApi, 'linkRisk').mockRejectedValue(new Error('link failed'));
        vi.spyOn(lookupApi, 'getControlOwners').mockResolvedValue([]);
        vi.spyOn(lookupApi, 'getDepartments').mockResolvedValue([]);
        vi.spyOn(riskApi, 'getRisks').mockResolvedValue({
            items: [{
                id: 91,
                risk_id_code: 'R-091',
                name: 'Payment interruption',
                process: 'Payments',
                category: 'Operations',
                description: 'Payment processing may stop.',
                gross_score: 9,
                net_score: 4,
                status: 'active',
                is_priority: false,
                is_archived: false,
            }],
            total: 1,
            offset: 0,
            limit: 100,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the partial-link warning and exact list context after a direct edit save', async () => {
        const returnTo = '/controls?q=payments&page=3#group-heading';
        const router = createMemoryRouter([
            { path: '/controls/:id/edit', element: <ControlEditPage /> },
            { path: '/controls/:id', element: <DetailProbe /> },
        ], { initialEntries: [`/controls/10/edit?return_to=${encodeURIComponent(returnTo)}`] });
        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        const user = userEvent.setup();
        await screen.findByTestId('control-form-lookups-ready');
        await user.click(screen.getByRole('button', { name: /link.*risk/i }));
        await user.click(await screen.findByRole('button', { name: /payment interruption/i }));
        await user.click(screen.getByRole('button', { name: /edit control/i }));

        expect(await screen.findByTestId('location')).toHaveTextContent(
            `/controls/10?return_to=${encodeURIComponent(returnTo)}`,
        );
        expect(screen.getByTestId('control-flash')).toHaveTextContent(
            'Control updated, but linking the selected risk failed.',
        );
    });

    it('keeps a failed edit load on its exact URL and retries only that record', async () => {
        const returnTo = '/controls?q=payments&page=3#group-heading';
        const editUrl = `/controls/10/edit?return_to=${encodeURIComponent(returnTo)}`;
        const failure = new ApiClientError({
            status: 500,
            messageKey: 'errorKeys.server',
            rawMessage: 'Payment reconciliation must not leak from the server response',
        });
        vi.mocked(controlApi.getControl)
            .mockRejectedValueOnce(failure)
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce(control);
        const router = createMemoryRouter([
            { path: '/controls/:id/edit', element: <><ControlEditPage /><DetailProbe /></> },
            { path: '/controls/:id', element: <DetailProbe /> },
        ], { initialEntries: [editUrl] });

        render(
            <QueryClientProvider client={createTestQueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('Record unavailable');
        expect(alert).not.toHaveTextContent('Payment reconciliation');
        expect(screen.getByTestId('location')).toHaveTextContent(editUrl);

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

        await screen.findByTestId('control-form-lookups-ready');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(editUrl);
    });

    it('returns from a failed edit load to the exact safe register working set', async () => {
        const returnTo = '/controls?q=payments&page=3#group-heading';
        vi.mocked(controlApi.getControl).mockRejectedValueOnce(
            new ApiClientError({ status: 404, messageKey: 'errorKeys.not_found' }),
        );
        const router = createMemoryRouter([
            { path: '/controls/:id/edit', element: <><ControlEditPage /><DetailProbe /></> },
            { path: '/controls', element: <DetailProbe /> },
        ], { initialEntries: [`/controls/10/edit?return_to=${encodeURIComponent(returnTo)}`] });

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        await screen.findByRole('heading', { name: /record unavailable/i });
        await userEvent.click(screen.getByRole('button', { name: 'Control Catalog' }));

        expect(await screen.findByTestId('location')).toHaveTextContent(returnTo);
    });

    it('offers only safe Back navigation for a malformed route id', async () => {
        const returnTo = '/controls?q=payments&page=3#group-heading';
        const router = createMemoryRouter([
            { path: '/controls/:id/edit', element: <><ControlEditPage /><DetailProbe /></> },
            { path: '/controls', element: <DetailProbe /> },
        ], { initialEntries: [`/controls/13junk/edit?return_to=${encodeURIComponent(returnTo)}`] });

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
        );

        await screen.findByRole('heading', { name: /record unavailable/i });
        expect(controlApi.getControl).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Control Catalog' }));
        expect(await screen.findByTestId('location')).toHaveTextContent(returnTo);
    });
});

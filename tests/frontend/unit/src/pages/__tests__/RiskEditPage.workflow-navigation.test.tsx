import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskEditPage } from '@/pages/RiskEditPage';
import { lookupApi } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import { riskHubApi } from '@/services/riskHubApi';
import type { Risk } from '@/types/risk';
import { createTestQueryClient } from '@test/queryClient';

const risk = {
    id: 10,
    name: 'Operational resilience risk',
    process: 'Payments',
    subprocess: 'Settlement',
    risk_type: 'operational',
    category: 'Operations',
    description: 'A valid risk used for edit workflow navigation.',
    status: 'active',
    department_id: 2,
    owner_id: 3,
    gross_probability: 3,
    gross_impact: 3,
    net_probability: 2,
    net_impact: 2,
    capabilities: { can_update: true },
} as Risk;

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function renderRiskEdit(returnTo: string) {
    const queryClient = createTestQueryClient();
    const router = createMemoryRouter([
        { path: '/risks/:id/edit', element: <><RiskEditPage /><LocationProbe /></> },
        { path: '/risks/:id', element: <LocationProbe /> },
    ], { initialEntries: [`/risks/10/edit?return_to=${encodeURIComponent(returnTo)}`] });
    return render(
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
}

async function submitEdit() {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('risk-form-next-button'));
    await user.click(screen.getByTestId('risk-form-next-button'));
    await user.click(screen.getByTestId('risk-form-submit-button'));
}

describe('RiskEditPage workflow navigation', () => {
    beforeEach(() => {
        vi.spyOn(riskApi, 'getRisk').mockResolvedValue(risk);
        vi.spyOn(riskApi, 'getRisks').mockResolvedValue({
            items: [], total: 0, offset: 0, limit: 100,
        });
        vi.spyOn(riskApi, 'updateRisk').mockResolvedValue(risk);
        vi.spyOn(lookupApi, 'getRiskOwners').mockResolvedValue([{
            id: 3,
            name: 'Risk Owner',
            email: 'owner@riskhub.test',
            role_name: 'risk_manager',
            department_id: 2,
        }]);
        vi.spyOn(lookupApi, 'getDepartments').mockResolvedValue([{
            id: 2,
            name: 'Operations',
        }]);
        vi.spyOn(riskHubApi, 'getPublicRiskTypes').mockResolvedValue([{
            code: 'operational',
            display_name: 'Operational',
            color: '#3b82f6',
            icon: null,
            sort_order: 1,
        }]);
        vi.spyOn(riskHubApi, 'getConfigValue').mockResolvedValue({ value: 10 });
    });

    it('returns an immediately saved edit to detail with the validated list working set', async () => {
        const returnTo = '/risks?q=payments&page=4#group-heading';
        renderRiskEdit(returnTo);

        await submitEdit();

        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent(
                `/risks/10?return_to=${encodeURIComponent(returnTo)}`,
            );
        });
    });

    it('keeps an approval-queued edit on its route with the validated list working set', async () => {
        const returnTo = '/risks?q=payments&page=4#group-heading';
        vi.mocked(riskApi.updateRisk).mockResolvedValueOnce({
            status: 'approval_required',
            approval_id: 88,
            message: 'Queued for approval',
        });
        renderRiskEdit(returnTo);

        await submitEdit();

        expect(await screen.findByText('Queued for approval')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(
            `/risks/10/edit?return_to=${encodeURIComponent(returnTo)}`,
        );
    });
});

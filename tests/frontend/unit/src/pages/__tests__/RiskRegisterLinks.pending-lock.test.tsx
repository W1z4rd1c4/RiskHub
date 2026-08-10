import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RiskRegisterLinksSection } from '@/components/risks/detail-overview/RiskRegisterLinksSection';
import { riskRegisterLinksApi } from '@/services/threatApi';
import type { Risk } from '@/types/risk';

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getRiskLinks: vi.fn().mockResolvedValue([]),
        getThreats: vi.fn().mockResolvedValue({ items: [] }),
    },
    riskRegisterLinksApi: {
        getThreatLinks: vi.fn().mockResolvedValue([]),
        getProcessLinks: vi.fn().mockResolvedValue([{
            id: 61,
            risk_id: 4,
            process_id: 9,
            process_name: 'Locked settlement',
            process_business_edit_blocked: true,
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]),
        getAssetLinks: vi.fn().mockResolvedValue([]),
        addThreatLink: vi.fn(),
        removeThreatLink: vi.fn(),
        addProcessLink: vi.fn(),
        removeProcessLink: vi.fn(),
        addAssetLink: vi.fn(),
        removeAssetLink: vi.fn(),
    },
}));

vi.mock('@/services/processApi', () => ({
    processApi: { getProcesses: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: { getAssets: vi.fn().mockResolvedValue({ items: [] }) },
}));

describe('RiskRegisterLinksSection Process impact lock', () => {
    it('keeps the relationship readable but disables the row-authorized unlink', async () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        expect(await screen.findByText('Locked settlement')).toBeInTheDocument();
        expect(screen.getByTestId('risk-process-link-remove-61')).toBeDisabled();
        expect(screen.getByText(/pending governed change/i)).toBeInTheDocument();
    });

    it('collects a reason and navigates to a governed Risk-to-Asset unlink approval', async () => {
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([{
            id: 71,
            risk_id: 4,
            asset_id: 11,
            asset_name: 'Protected asset',
            capabilities: { can_delete: true },
            created_at: '2026-07-17T08:00:00Z',
        }]);
        vi.mocked(riskRegisterLinksApi.removeAssetLink).mockResolvedValue({
            status: 'approval_required',
            message: 'Queued',
            approval_id: 187,
            action_type: 'edit',
            pending_fields: ['relationship'],
            proposal_id: 'proposal-risk-asset-187',
            proposal_version: 1,
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <RiskRegisterLinksSection risk={{ id: 4 } as Risk} canManageLinks />
                    <LocationProbe />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        fireEvent.click(await screen.findByTestId('risk-asset-link-remove-71'));
        const dialog = screen.getByRole('alertdialog');
        fireEvent.change(within(dialog).getByRole('textbox', { name: /request reason/i }), {
            target: { value: 'Review protected risk dependency' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }));

        await waitFor(() => {
            expect(riskRegisterLinksApi.removeAssetLink).toHaveBeenCalledWith(
                4,
                71,
                'Review protected risk dependency',
            );
            expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=mine&approvalId=187');
        });
    });
});

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname}{location.search}</div>;
}

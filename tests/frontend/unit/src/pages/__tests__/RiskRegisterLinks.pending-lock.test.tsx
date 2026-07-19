import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RiskRegisterLinksSection } from '@/components/risks/detail-overview/RiskRegisterLinksSection';
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
});

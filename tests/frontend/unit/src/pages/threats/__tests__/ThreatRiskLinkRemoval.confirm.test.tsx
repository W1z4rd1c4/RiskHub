import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskRegisterLinksSection } from '@/components/risks/detail-overview/RiskRegisterLinksSection';
import { FeedbackProvider } from '@/contexts/FeedbackContext';
import '@/i18n';
import { ThreatRiskLinksSection } from '@/pages/threats/ThreatRiskLinksSection';
import { ApiClientError } from '@/services/apiClient';
import { riskRegisterLinksApi, threatApi } from '@/services/threatApi';
import type { Risk } from '@/types/risk';
import type { Threat } from '@/types/threat';

/**
 * GAP-C-01 (R3-02) / D10: removing a Threat↔Risk link is confirmed on BOTH
 * sides with the unlink intent; nothing is sent before the confirmation, a
 * failure stays inside the open dialog, and success is a toast.
 */

const link = {
    id: 5,
    threat_id: 3,
    risk_id: 4,
    threat_name: 'Credential Stuffing',
    risk_id_code: 'R-0004',
    risk_name: 'Authentication Drift',
    capabilities: { can_delete: true },
    created_at: '2026-07-17T08:00:00Z',
};

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getRiskLinks: vi.fn(),
        removeRiskLink: vi.fn(),
        addRiskLink: vi.fn(),
        getThreats: vi.fn().mockResolvedValue({ items: [] }),
    },
    riskRegisterLinksApi: {
        getThreatLinks: vi.fn(),
        getProcessLinks: vi.fn().mockResolvedValue([]),
        getAssetLinks: vi.fn().mockResolvedValue([]),
        addThreatLink: vi.fn(),
        removeThreatLink: vi.fn(),
        addProcessLink: vi.fn(),
        removeProcessLink: vi.fn(),
        addAssetLink: vi.fn(),
        removeAssetLink: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/processApi', () => ({
    processApi: { getProcesses: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: { getAssets: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

function wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <FeedbackProvider>{children}</FeedbackProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

const threat = { id: 3, name: 'Credential Stuffing', stewardship_status: 'assigned', is_archived: false } as unknown as Threat;
const risk = { id: 4, name: 'Authentication Drift' } as unknown as Risk;

const SIDES = [
    {
        name: 'Threat page',
        renderSection: () => render(<ThreatRiskLinksSection threat={threat} canManageLinks />, { wrapper }),
        removeButtonTestId: 'threat-risk-link-remove-5',
        remove: () => vi.mocked(threatApi.removeRiskLink),
        expectedName: 'R-0004: Authentication Drift',
    },
    {
        name: 'Risk page',
        renderSection: () => render(<RiskRegisterLinksSection risk={risk} canManageLinks />, { wrapper }),
        removeButtonTestId: 'risk-threat-link-remove-5',
        remove: () => vi.mocked(riskRegisterLinksApi.removeThreatLink),
        expectedName: 'Credential Stuffing',
    },
] as const;

describe('Threat ↔ Risk link removal confirmation (GAP-C-01)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(threatApi.getRiskLinks).mockResolvedValue([link]);
        vi.mocked(riskRegisterLinksApi.getThreatLinks).mockResolvedValue([link]);
        vi.mocked(riskRegisterLinksApi.getProcessLinks).mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi.getAssetLinks).mockResolvedValue([]);
    });

    it.each(SIDES)('$name asks for confirmation with the unlink intent before removing', async ({
        renderSection, removeButtonTestId, remove, expectedName,
    }) => {
        remove().mockResolvedValue(undefined);
        renderSection();

        const removeButton = await screen.findByTestId(removeButtonTestId);
        expect(removeButton.querySelector('svg.lucide-unlink')).not.toBeNull();
        expect(removeButton.querySelector('svg.lucide-trash-2')).toBeNull();
        fireEvent.click(removeButton);

        expect(remove()).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        expect(within(dialog).getByRole('heading', { name: `Remove link to ${expectedName}?` })).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /delete/i })).toBeNull();

        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove link' }));

        await waitFor(() => expect(remove()).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        const toast = (await screen.findByText('Link removed')).closest('li');
        expect(toast).toHaveAttribute('data-tone', 'success');
    });

    it.each(SIDES)('$name keeps a failed removal inside the open dialog', async ({
        renderSection, removeButtonTestId, remove,
    }) => {
        remove().mockRejectedValue(new ApiClientError({ status: 500, messageKey: 'errorKeys.server' }));
        renderSection();

        fireEvent.click(await screen.findByTestId(removeButtonTestId));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove link' }));

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent('Server error. Please try again later.');
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it.each(SIDES)('$name cancels without removing anything', async ({ renderSection, removeButtonTestId, remove }) => {
        renderSection();

        fireEvent.click(await screen.findByTestId(removeButtonTestId));
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(remove()).not.toHaveBeenCalled();
    });
});

import type { threatApi as actualThreatApi, riskRegisterLinksApi as actualRiskRegisterLinksApi } from '@/services/threatApi';
import type { riskApi as actualRiskApi } from '@/services/riskApi';
import type { processApi as actualProcessApi } from '@/services/processApi';
import type { assetApi as actualAssetApi } from '@/services/assetApi';
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
const { threatApi, riskRegisterLinksApi } = vi.hoisted(() => ({
    threatApi: {
        getRiskLinks: vi.fn<typeof actualThreatApi.getRiskLinks>(),
        removeRiskLink: vi.fn<typeof actualThreatApi.removeRiskLink>(),
        addRiskLink: vi.fn<typeof actualThreatApi.addRiskLink>(),
        getThreats: vi.fn<typeof actualThreatApi.getThreats>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }),
    },
    riskRegisterLinksApi: {
        getThreatLinks: vi.fn<typeof actualRiskRegisterLinksApi.getThreatLinks>(),
        getProcessLinks: vi.fn<typeof actualRiskRegisterLinksApi.getProcessLinks>().mockResolvedValue([]),
        getAssetLinks: vi.fn<typeof actualRiskRegisterLinksApi.getAssetLinks>().mockResolvedValue([]),
        addThreatLink: vi.fn<typeof actualRiskRegisterLinksApi.addThreatLink>(),
        removeThreatLink: vi.fn<typeof actualRiskRegisterLinksApi.removeThreatLink>(),
        addProcessLink: vi.fn<typeof actualRiskRegisterLinksApi.addProcessLink>(),
        removeProcessLink: vi.fn<typeof actualRiskRegisterLinksApi.removeProcessLink>(),
        addAssetLink: vi.fn<typeof actualRiskRegisterLinksApi.addAssetLink>(),
        removeAssetLink: vi.fn<typeof actualRiskRegisterLinksApi.removeAssetLink>(),
    },
}));
import type { Risk } from '@/types/risk';
import type { Threat, ThreatRiskLink } from '@/types/threat';

/**
 * GAP-C-01 (R3-02) / D10: removing a Threat↔Risk link is confirmed on BOTH
 * sides with the unlink intent; nothing is sent before the confirmation, a
 * failure stays inside the open dialog, and success is a toast.
 */

const link: ThreatRiskLink = {
    id: 5,
    threat_id: 3,
    risk_id: 4,
    threat_name: 'Credential Stuffing',
    risk_id_code: 'R-0004',
    risk_name: 'Authentication Drift',
    capabilities: { can_delete: true },
    created_at: '2026-07-17T08:00:00Z',
};

vi.mock('@/services/threatApi', () => ({ threatApi, riskRegisterLinksApi }));
vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn<typeof actualRiskApi.getRisks>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }) },
}));

vi.mock('@/services/processApi', () => ({
    processApi: { getProcesses: vi.fn<typeof actualProcessApi.getProcesses>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100, pending_creations: [] }) },
}));

vi.mock('@/services/assetApi', () => ({
    assetApi: { getAssets: vi.fn<typeof actualAssetApi.getAssets>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }) },
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

const threat: Threat = {
    id: 3,
    name: 'Credential Stuffing',
    stewardship_status: 'assigned',
    is_archived: false,
    created_at: '2026-07-17T08:00:00Z',
    updated_at: '2026-07-17T08:00:00Z',
};
const risk: Risk = {
    id: 4,
    risk_id_code: 'R-0004',
    name: 'Authentication Drift',
    process: 'Authentication',
    risk_type: 'operational',
    description: 'Authentication risk fixture',
    gross_probability: 3,
    gross_impact: 3,
    gross_score: 9,
    net_probability: 2,
    net_impact: 2,
    net_score: 4,
    status: 'active',
    is_archived: false,
    is_priority: false,
    created_at: '2026-07-17T08:00:00Z',
    updated_at: '2026-07-17T08:00:00Z',
};

const SIDES = [
    {
        name: 'Threat page',
        renderSection: () => render(<ThreatRiskLinksSection threat={threat} canManageLinks />, { wrapper }),
        removeButtonTestId: 'threat-risk-link-remove-5',
        remove: () => vi.mocked(threatApi).removeRiskLink,
        expectedName: 'R-0004: Authentication Drift',
    },
    {
        name: 'Risk page',
        renderSection: () => render(<RiskRegisterLinksSection risk={risk} canManageLinks />, { wrapper }),
        removeButtonTestId: 'risk-threat-link-remove-5',
        remove: () => vi.mocked(riskRegisterLinksApi).removeThreatLink,
        expectedName: 'Credential Stuffing',
    },
] as const;

describe('Threat ↔ Risk link removal confirmation (GAP-C-01)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(threatApi).getRiskLinks.mockResolvedValue([link]);
        vi.mocked(riskRegisterLinksApi).getThreatLinks.mockResolvedValue([link]);
        vi.mocked(riskRegisterLinksApi).getProcessLinks.mockResolvedValue([]);
        vi.mocked(riskRegisterLinksApi).getAssetLinks.mockResolvedValue([]);
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

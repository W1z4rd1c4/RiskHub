import type { threatApi as actualThreatApi } from '@/services/threatApi';
import type { riskApi as actualRiskApi } from '@/services/riskApi';
/**
 * AX-04 / AX-01 / audit §4.8: the Threat risk-link picker is labelled (not placeholder-only) and the
 * remove action names the linked risk. Removal still needs confirmation (GAP-C-01).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FeedbackProvider } from '@/contexts/FeedbackContext';
import i18n from '@/i18n';
import { ThreatRiskLinksSection } from '@/pages/threats/ThreatRiskLinksSection';
const threatApi = vi.hoisted(() => ({
        getRiskLinks: vi.fn<typeof actualThreatApi.getRiskLinks>().mockResolvedValue([{
            id: 5,
            threat_id: 3,
            created_at: '2026-07-17T08:00:00Z',
            risk_id: 11,
            risk_id_code: 'R-11',
            risk_name: 'Data leak',
            capabilities: { can_delete: true },
        }]),
        removeRiskLink: vi.fn<typeof actualThreatApi.removeRiskLink>().mockResolvedValue(undefined),
        addRiskLink: vi.fn<typeof actualThreatApi.addRiskLink>(),
    }));
import type { Threat } from '@/types/threat';

vi.mock('@/services/threatApi', () => ({
    threatApi: threatApi,
}));
vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn<typeof actualRiskApi.getRisks>().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 }) },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

const threat: Threat = {
    id: 3,
    name: 'Credential Stuffing',
    stewardship_status: 'assigned',
    is_archived: false,
    created_at: '2026-07-17T08:00:00Z',
    updated_at: '2026-07-17T08:00:00Z',
};

function renderSection(canManageLinks = true) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <FeedbackProvider>
                    <ThreatRiskLinksSection threat={threat} canManageLinks={canManageLinks} />
                </FeedbackProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('ThreatRiskLinksSection labels', () => {
    it('labels the risk picker and names the add and remove actions', async () => {
        const { container } = renderSection();

        expect(await screen.findByRole('combobox', { name: 'Risk' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
        expect(await screen.findByRole('button', { name: 'Remove link: R-11: Data leak' })).toBe(
            screen.getByTestId('threat-risk-link-remove-5'),
        );

        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
            rules: { 'color-contrast': { enabled: false } },
        });
        expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });

    it('confirms the removal before it calls the API', async () => {
        const user = userEvent.setup();
        renderSection();

        await user.click(await screen.findByTestId('threat-risk-link-remove-5'));
        expect(vi.mocked(threatApi).removeRiskLink).not.toHaveBeenCalled();
        const dialog = screen.getByRole('alertdialog');
        await user.click(within(dialog).getByRole('button', { name: 'Remove link' }));
        expect(vi.mocked(threatApi).removeRiskLink).toHaveBeenCalledWith(3, 5);
    });

    it('translates the label in Czech', async () => {
        await i18n.changeLanguage('cs');
        renderSection();

        expect(await screen.findByRole('combobox', { name: 'Riziko' })).toBeInTheDocument();
    });
});

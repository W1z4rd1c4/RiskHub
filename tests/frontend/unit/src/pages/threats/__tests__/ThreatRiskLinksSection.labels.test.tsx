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
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getRiskLinks: vi.fn().mockResolvedValue([{
            id: 5,
            risk_id: 11,
            risk_id_code: 'R-11',
            risk_name: 'Data leak',
            capabilities: { can_delete: true },
        }]),
        removeRiskLink: vi.fn().mockResolvedValue(undefined),
        addRiskLink: vi.fn(),
    },
}));
vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

const threat = { id: 3, name: 'Credential Stuffing', is_archived: false } as unknown as Threat;

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
        expect(threatApi.removeRiskLink).not.toHaveBeenCalled();
        const dialog = screen.getByRole('alertdialog');
        await user.click(within(dialog).getByRole('button', { name: 'Remove link' }));
        expect(threatApi.removeRiskLink).toHaveBeenCalledWith(3, 5);
    });

    it('translates the label in Czech', async () => {
        await i18n.changeLanguage('cs');
        renderSection();

        expect(await screen.findByRole('combobox', { name: 'Riziko' })).toBeInTheDocument();
    });
});

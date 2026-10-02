import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import i18n from '@/i18n';
import { riskHubKeys } from '@/lib/queryKeys';
import type { Risk } from '@/types/risk';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithQueryClient, screen, within } from '@test/render';

/**
 * PG-02 / ADR-008: the quick view must classify scores with the configurable
 * Risk Hub thresholds (useRiskThresholds), never hard-coded 20/12/6 bands.
 */

function buildRisk(gross: number, net: number): Risk {
    return {
        id: 7,
        risk_id_code: 'RSK-007',
        name: 'Payment outage',
        process: 'Payments',
        risk_type: 'operational',
        category: 'IT',
        description: 'Core payment rail unavailable.',
        gross_probability: 4,
        gross_impact: 4,
        gross_score: gross,
        net_probability: 2,
        net_impact: 3,
        net_score: net,
        updated_at: '2026-09-01T10:00:00Z',
    } as Risk;
}

function renderModal(ui: ReactElement, thresholds: { critical: number; high: number; medium: number }) {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(riskHubKeys.thresholdsPublic(), thresholds);
    queryClient.setQueryData(riskHubKeys.publicRiskTypes(), [
        { code: 'operational', display_name: 'Operational risk', color: '#000', icon: null, sort_order: 1 },
    ]);
    return renderWithQueryClient(<MemoryRouter>{ui}</MemoryRouter>, { queryClient });
}

function scoreCard(fieldLabel: string): HTMLElement {
    const heading = screen.getByRole('heading', { name: fieldLabel });
    const card = heading.parentElement;
    if (!card) throw new Error(`no score card for ${fieldLabel}`);
    return card;
}

describe('RiskQuickViewModal thresholds (ADR-008)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('classifies with the default configured thresholds 16/10/5, not 20/12/6', () => {
        // 16 is critical and 5 is medium at defaults; the old 20/12/6 map said high and low.
        renderModal(
            <RiskQuickViewModal risk={buildRisk(16, 5)} isOpen onClose={vi.fn()} />,
            { critical: 16, high: 10, medium: 5 },
        );

        const gross = within(scoreCard('Gross Score'));
        expect(gross.getByText('16')).toHaveClass('text-destructive');
        expect(gross.getByText('Critical')).toBeInTheDocument();

        const net = within(scoreCard('Net Score'));
        expect(net.getByText('5')).not.toHaveClass('text-success-text');
        expect(net.getByText('Medium')).toBeInTheDocument();
    });

    it('follows custom Risk Hub thresholds', () => {
        renderModal(
            <RiskQuickViewModal risk={buildRisk(12, 3)} isOpen onClose={vi.fn()} />,
            { critical: 12, high: 8, medium: 3 },
        );

        expect(within(scoreCard('Gross Score')).getByText('Critical')).toBeInTheDocument();
        expect(within(scoreCard('Net Score')).getByText('Medium')).toBeInTheDocument();
    });

    it('shows the risk type display name instead of the raw code', () => {
        renderModal(
            <RiskQuickViewModal risk={buildRisk(4, 2)} isOpen onClose={vi.fn()} />,
            { critical: 16, high: 10, medium: 5 },
        );

        expect(screen.getByText('Operational risk')).toBeInTheDocument();
        expect(screen.getAllByText('Low')).toHaveLength(2);
    });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VendorLinkedControlCard } from '@/components/vendors/VendorLinkedControlCard';
import { VendorLinkedRiskCard } from '@/components/vendors/VendorLinkedRiskCard';

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskTypes: () => ({
        getColor: () => '#3b82f6',
        getDisplayName: () => 'Operational',
    }),
    useRiskThresholds: () => ({
        // D1: the linked-risk scores render as SeverityBadges on the configured bands.
        getSeverityBand: (score: number) => (score >= 12 ? 'high' : 'medium'),
    }),
}));

describe('vendor linked cards', () => {
    it('keeps linked cards keyboard-focusable and natively activatable', async () => {
        const user = userEvent.setup();
        const onControlClick = vi.fn();
        const onRiskClick = vi.fn();

        render(
            <>
                <VendorLinkedControlCard
                    control={{
                        id: 11,
                        name: 'Access review',
                        frequency: 'monthly',
                        risk_level: 3,
                        monitoring_status: 'on_track',
                    }}
                    onClick={onControlClick}
                />
                <VendorLinkedRiskCard
                    risk={{
                        id: 12,
                        risk_id_code: 'R-0012',
                        name: 'Identity compromise',
                        process: 'Identity governance',
                        gross_score: 12,
                        net_score: 8,
                        is_priority: false,
                    }}
                    onClick={onRiskClick}
                />
            </>,
        );

        const controlCard = screen.getByRole('button', { name: /Access review/i });
        const riskCard = screen.getByRole('button', { name: /Identity compromise/i });

        await user.tab();
        expect(controlCard).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.tab();
        expect(riskCard).toHaveFocus();
        await user.keyboard(' ');
        expect(onControlClick).toHaveBeenCalledOnce();
        expect(onRiskClick).toHaveBeenCalledOnce();
    });

    it('renders each card as a titled article with D1 score badges and an archived badge when archived (D13, GAP-D-14)', () => {
        render(
            <>
                <VendorLinkedControlCard
                    archived
                    control={{
                        id: 21,
                        name: 'Backup test',
                        frequency: 'monthly',
                        risk_level: 2,
                        monitoring_status: 'passed',
                    }}
                />
                <VendorLinkedRiskCard
                    archived
                    risk={{
                        id: 22,
                        risk_id_code: 'R-0022',
                        name: 'Ransomware',
                        process: 'Operations',
                        gross_score: 12,
                        net_score: 8,
                        is_priority: false,
                    }}
                />
            </>,
        );

        const articles = screen.getAllByRole('article');
        expect(articles).toHaveLength(2);
        expect(screen.getByRole('heading', { level: 3, name: 'Backup test' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'R-0022: Ransomware' })).toBeInTheDocument();
        expect(screen.getByText('controls:status.archived')).toHaveAttribute('data-tone', 'neutral');
        expect(screen.getByText('risks:status.archived')).toHaveAttribute('data-tone', 'neutral');
        expect(screen.getByText('common:labels.gross: 12')).toHaveAttribute('data-severity', 'high');
        expect(screen.getByText('common:labels.net: 8')).toHaveAttribute('data-severity', 'medium');
        for (const article of articles) {
            expect(article.className).not.toMatch(/(?:^|\s)opacity-/);
        }
    });
});

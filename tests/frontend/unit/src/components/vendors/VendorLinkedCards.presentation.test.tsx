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
        getScoreBadgeColor: () => 'text-warning-text bg-warning/10 border-warning/20',
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
});

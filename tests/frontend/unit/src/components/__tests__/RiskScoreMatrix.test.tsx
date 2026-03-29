/**
 * Tests for RiskScoreMatrix component.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RiskScoreMatrix } from '@/components/RiskScoreMatrix';

vi.mock('@/hooks/useRiskHubConfig', () => ({
    useRiskThresholds: () => ({
        thresholds: {
            critical: 16,
            high: 10,
            medium: 5,
        },
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { score?: number }) => {
            switch (key) {
                case 'matrix.probability_axis':
                    return 'Probability';
                case 'matrix.impact_axis':
                    return 'Impact';
                case 'matrix.score_label':
                    return String(options?.score ?? '');
                case 'matrix.gross_risk':
                    return 'Gross Risk';
                case 'matrix.net_risk':
                    return 'Net Risk';
                default:
                    return key;
            }
        },
        i18n: { language: 'en' },
    }),
}));

describe('RiskScoreMatrix', () => {
    it('renders the matrix grid with probability and impact', () => {
        render(<RiskScoreMatrix probability={3} impact={4} type="net" />);

        // Check for probability label
        expect(screen.getByText(/Probability/i)).toBeInTheDocument();
        // Check for impact label  
        expect(screen.getByText(/Impact/i)).toBeInTheDocument();
    });

    it('displays score in matrix', () => {
        render(<RiskScoreMatrix probability={3} impact={4} type="gross" />);

        // Score display (3 * 4 = 12)
        expect(screen.getAllByText('12')).toHaveLength(2);
    });
});

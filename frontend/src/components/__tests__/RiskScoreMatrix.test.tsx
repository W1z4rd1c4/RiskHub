/**
 * Tests for RiskScoreMatrix component.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { RiskScoreMatrix } from '../RiskScoreMatrix';

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
        expect(screen.getByText('12')).toBeInTheDocument();
    });
});

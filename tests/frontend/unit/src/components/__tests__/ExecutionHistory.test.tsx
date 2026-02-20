/**
 * Tests for ExecutionHistory component.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ExecutionHistory } from '@/components/executions/ExecutionHistory';

describe('ExecutionHistory', () => {
    it('renders loading state initially', () => {
        render(<ExecutionHistory controlId={1} />);

        expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });

    it('renders execution records after loading', async () => {
        render(<ExecutionHistory controlId={1} />);

        await waitFor(() => {
            // Should show execution results - loading gone
            expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
        });
    });
});

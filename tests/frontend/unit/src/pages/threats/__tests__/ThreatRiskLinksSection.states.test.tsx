import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeedbackProvider } from '@/contexts/FeedbackContext';
import '@/i18n';
import { ThreatRiskLinksSection } from '@/pages/threats/ThreatRiskLinksSection';
import { threatApi } from '@/services/threatApi';
import type { Threat } from '@/types/threat';

/**
 * GAP-C-11 / §4.15: the Threat page's linked-risks region renders exactly one of
 * loading, error (with retry), empty or data. A failed load is never shown as
 * "No risks are linked to this threat yet."
 */

vi.mock('@/services/threatApi', () => ({
    threatApi: {
        getRiskLinks: vi.fn(),
        removeRiskLink: vi.fn(),
        addRiskLink: vi.fn(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: { getRisks: vi.fn().mockResolvedValue({ items: [] }) },
}));

vi.mock('@/services/logger', () => ({ logError: vi.fn() }));

const EMPTY_COPY = 'No risks are linked to this threat yet.';
const threat = { id: 3, name: 'Credential Stuffing', is_archived: false } as unknown as Threat;

function renderSection() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <FeedbackProvider>{children}</FeedbackProvider>
            </MemoryRouter>
        </QueryClientProvider>
    );
    return render(<ThreatRiskLinksSection threat={threat} canManageLinks={false} />, { wrapper });
}

describe('ThreatRiskLinksSection load states (GAP-C-11)', () => {
    beforeEach(() => {
        vi.mocked(threatApi.getRiskLinks).mockReset();
    });

    it('announces the first load instead of claiming there are no links', () => {
        vi.mocked(threatApi.getRiskLinks).mockReturnValue(new Promise(() => undefined));
        renderSection();

        expect(screen.getByTestId('threat-risk-links-loading')).toContainElement(screen.getByRole('status'));
        expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
    });

    it('renders a load failure as an error with retry, never as the empty state', async () => {
        vi.mocked(threatApi.getRiskLinks)
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce([]);
        renderSection();

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByText(EMPTY_COPY)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await waitFor(() => expect(threatApi.getRiskLinks).toHaveBeenCalledTimes(2));
    });

    it('shows the empty state only after a successful empty load', async () => {
        vi.mocked(threatApi.getRiskLinks).mockResolvedValue([]);
        renderSection();

        const empty = await screen.findByText(EMPTY_COPY);
        expect(empty.closest('[role="status"]')).not.toBeNull();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProviderWithReady } from '@test/authBootstrap';
import i18n from '@/i18n';
import type { IctRegisterDq } from '@/types/ictRegisterDq';

// FR-P3-4 (#62, N17 / C3 / C4): the DQ screen does not consume SortableTable, so
// it drives the shared table-error contract (#70) directly. These tests pin the
// explicit aria-busy loading branch and the localized error + retry branch so a
// failed fetch is never rendered as an empty screen or a false 0/0/0 summary.

const getDataQuality = vi.fn();

vi.mock('@/services/ictRegisterDqApi', () => ({
    ictRegisterDqApi: {
        getDataQuality: (...args: unknown[]) => getDataQuality(...args),
    },
}));

const EN_TABLE_ERROR = "We couldn't load this table. Please try again.";
const CS_TABLE_ERROR = 'Tuto tabulku se nepodařilo načíst. Zkuste to prosím znovu.';

function samplePayload(): IctRegisterDq {
    return {
        finding_count: 1,
        checks: [
            {
                check_id: 'DQ-01',
                area: 'processes',
                title_cs: 'Proces bez vlastníka',
                severity: 'high',
                threshold: 0,
                count: 2,
                status: 'NÁLEZ',
                violating_rows: [],
            },
        ],
    };
}

async function renderPage() {
    const { IctRegisterDqPage } = await import('@/pages/IctRegisterDqPage');
    render(
        <MemoryRouter>
            <AuthProviderWithReady>
                <IctRegisterDqPage />
            </AuthProviderWithReady>
        </MemoryRouter>
    );
}

afterEach(async () => {
    getDataQuality.mockReset();
    await i18n.changeLanguage('en');
});

describe('IctRegisterDqPage loading + error branches (FR-P3-4)', () => {
    it('renders an aria-busy loading branch and no false 0/0/0 while the first fetch is in flight', async () => {
        getDataQuality.mockReturnValue(new Promise<IctRegisterDq>(() => {}));
        await renderPage();

        const loading = await screen.findByTestId('dq-loading');
        expect(loading).toHaveAttribute('aria-busy', 'true');
        // C3: the 0/0/0 summary tiles must not render during load.
        expect(screen.queryByTestId('dq-summary-total')).not.toBeInTheDocument();
    });

    it('replaces the screen with the shared localized error + retry when the first fetch fails', async () => {
        getDataQuality.mockRejectedValue(new Error('boom'));
        await renderPage();

        const errorBlock = await screen.findByTestId('dq-error');
        expect(errorBlock).toHaveTextContent(EN_TABLE_ERROR);
        // C4: a failed fetch is never an empty / zero state.
        expect(screen.queryByTestId('dq-summary-total')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('retries the fetch and recovers to the data view when Retry is clicked', async () => {
        getDataQuality
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(samplePayload());
        const user = userEvent.setup();
        await renderPage();

        await user.click(await screen.findByRole('button', { name: 'Retry' }));

        expect(await screen.findByTestId('dq-summary-total')).toBeInTheDocument();
        expect(screen.queryByTestId('dq-error')).not.toBeInTheDocument();
        await waitFor(() => expect(getDataQuality).toHaveBeenCalledTimes(2));
    });

    it('keeps the last-good summary and overlays a retry banner when a refetch fails (stale-data)', async () => {
        getDataQuality
            .mockResolvedValueOnce(samplePayload())
            .mockRejectedValueOnce(new Error('boom'));
        const user = userEvent.setup();
        await renderPage();

        // First load succeeds → the real summary is shown.
        expect(await screen.findByTestId('dq-summary-total')).toHaveTextContent('1');

        // Refetch fails → non-blocking banner over the stale summary, never 0/0/0.
        await user.click(screen.getByTestId('dq-refresh-button'));
        expect(await screen.findByTestId('dq-error-banner')).toHaveTextContent(EN_TABLE_ERROR);
        expect(screen.getByTestId('dq-summary-total')).toHaveTextContent('1');
    });

    it('localizes the error message in Czech', async () => {
        await i18n.changeLanguage('cs');
        getDataQuality.mockRejectedValue(new Error('boom'));
        await renderPage();

        expect(await screen.findByTestId('dq-error')).toHaveTextContent(CS_TABLE_ERROR);
    });
});

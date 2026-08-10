import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { AuthProviderWithReady } from '@test/authBootstrap';
import { IctCommitteeSection } from '@/components/dashboard/IctCommitteeSection';
import i18n from '@/i18n';
import type { IctCommittee } from '@/types/ictRegisterCommittee';

// FR-P3-4 (#62, N17 / C3 / C4): the Committee screen does not consume
// SortableTable, so it drives the shared table-error contract (#70) directly.
// These tests pin the explicit aria-busy loading branch and the localized error +
// retry branch so a failed fetch is never rendered as an empty / zero screen.

const getCommittee = vi.fn();

vi.mock('@/services/ictRegisterCommitteeApi', () => ({
    ictRegisterCommitteeApi: {
        getCommittee: (...args: unknown[]) => getCommittee(...args),
    },
}));

const EN_TABLE_ERROR = "We couldn't load this table. Please try again.";
const CS_TABLE_ERROR = 'Tuto tabulku se nepodařilo načíst. Zkuste to prosím znovu.';

function renderSection() {
    render(
        <MemoryRouter>
            <AuthProviderWithReady>
                <ThemeProvider>
                    <IctCommitteeSection />
                </ThemeProvider>
            </AuthProviderWithReady>
        </MemoryRouter>
    );
}

afterEach(async () => {
    getCommittee.mockReset();
    await i18n.changeLanguage('en');
});

describe('IctCommitteeSection loading + error branches (FR-P3-4)', () => {
    it('renders an aria-busy loading branch and no dashboard tiles while the first fetch is in flight', async () => {
        getCommittee.mockReturnValue(new Promise<IctCommittee>(() => {}));
        renderSection();

        const loading = await screen.findByTestId('committee-loading');
        expect(loading).toHaveAttribute('aria-busy', 'true');
        // C3/C4: no tiles (and therefore no false zero counts) render during load.
        expect(screen.queryByTestId('committee-state-process_count')).not.toBeInTheDocument();
    });

    it('replaces the screen with the shared localized error + retry when the first fetch fails', async () => {
        getCommittee.mockRejectedValue(new Error('boom'));
        renderSection();

        const errorBlock = await screen.findByTestId('committee-error');
        expect(errorBlock).toHaveTextContent(EN_TABLE_ERROR);
        // C4: a failed fetch is never an empty / zero state.
        expect(screen.queryByTestId('committee-state-process_count')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('re-invokes the fetch when Retry is clicked', async () => {
        getCommittee.mockRejectedValue(new Error('boom'));
        const user = userEvent.setup();
        renderSection();

        await user.click(await screen.findByRole('button', { name: 'Retry' }));

        await waitFor(() => expect(getCommittee).toHaveBeenCalledTimes(2));
    });

    it('localizes the error message in Czech', async () => {
        await i18n.changeLanguage('cs');
        getCommittee.mockRejectedValue(new Error('boom'));
        renderSection();

        expect(await screen.findByTestId('committee-error')).toHaveTextContent(CS_TABLE_ERROR);
    });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableErrorState } from '@/components/tables/tableError';
import i18n from '@/i18n';

const EN_MESSAGE = "We couldn't load this table. Please try again.";
const CS_MESSAGE = 'Tuto tabulku se nepodařilo načíst. Zkuste to prosím znovu.';

afterEach(async () => {
    // The unit-test i18n instance is a singleton; reset language after each test.
    await i18n.changeLanguage('en');
});

describe('TableErrorState', () => {
    it('renders the localized error message and a retry affordance', () => {
        render(<TableErrorState onRetry={vi.fn()} />);

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(EN_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('invokes the retry callback when the retry button is clicked', async () => {
        const onRetry = vi.fn();
        const user = userEvent.setup();
        render(<TableErrorState onRetry={onRetry} />);

        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('localizes the message and retry label for Czech', async () => {
        await i18n.changeLanguage('cs');
        render(<TableErrorState onRetry={vi.fn()} />);

        expect(screen.getByText(CS_MESSAGE)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Zkusit znovu' })).toBeInTheDocument();
    });

    it('renders a compact banner variant that keeps a retry affordance for stale data', () => {
        render(<TableErrorState variant="banner" onRetry={vi.fn()} testId="stale-banner" />);

        const banner = screen.getByTestId('stale-banner');
        expect(banner).toHaveTextContent(EN_MESSAGE);
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('omits the retry button when no onRetry handler is supplied (read-only surface)', () => {
        render(<TableErrorState />);

        expect(screen.getByText(EN_MESSAGE)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('disables the retry button while a retry is in flight', () => {
        render(<TableErrorState onRetry={vi.fn()} isRetrying />);

        expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });

    it('supports message and retry-label overrides', () => {
        render(
            <TableErrorState message="Custom failure" retryLabel="Again" onRetry={vi.fn()} />,
        );

        expect(screen.getByText('Custom failure')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
    });
});

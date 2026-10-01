import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DetailLoadUnavailableState } from '@/pages/detail/DetailLoadState';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 (D14, AX-06): the unavailable-detail state uses the
 * shared `BackButton`, named by the destination label the page passes in.
 */
describe('DetailLoadUnavailableState', () => {
    it('renders the destination-labelled BackButton as a secondary button that calls onBack', async () => {
        const user = userEvent.setup();
        const onBack = vi.fn();
        renderWithoutProviders(<DetailLoadUnavailableState backLabel="Back to KRIs" onBack={onBack} />);

        const back = screen.getByRole('button', { name: 'Back to KRIs' });
        expect(back).toHaveAttribute('type', 'button');
        expect(back.className.split(/\s+/)).toContain('bg-secondary');
        expect(back.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

        await user.click(back);
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('offers Retry next to the back button when the page can retry', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        renderWithoutProviders(
            <DetailLoadUnavailableState backLabel="Back to Risks" onBack={vi.fn()} onRetry={onRetry} />,
        );

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Back to Risks' })).toBeEnabled();
    });
});

import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RefreshButton } from '@/components/ui/RefreshButton';
import i18n from '@/i18n';
import { renderWithoutProviders, screen } from '@test/render';

/**
 * Audit 2026-09-30 §4.7 (FB-02): one refresh affordance with a translated
 * name, a spinning icon and `aria-busy` while the data is being fetched.
 */

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('RefreshButton', () => {
    it('defaults to the translated common:actions.refresh name (en + cs)', async () => {
        const { unmount } = renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Refresh' })).toHaveTextContent('Refresh');
        unmount();

        await i18n.changeLanguage('cs');
        renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Obnovit' })).toBeInTheDocument();
    });

    it('accepts a caller label as the accessible name', () => {
        renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} label="Refresh audit trail" />);
        expect(screen.getByRole('button', { name: 'Refresh audit trail' })).toBeInTheDocument();
    });

    it('calls onRefresh on click, Enter and Space when idle', async () => {
        const user = userEvent.setup();
        const onRefresh = vi.fn();
        renderWithoutProviders(<RefreshButton onRefresh={onRefresh} />);
        const button = screen.getByRole('button', { name: 'Refresh' });
        expect(button).toHaveAttribute('aria-busy', 'false');
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button.querySelector('svg')).not.toHaveClass('animate-spin');

        await user.click(button);
        await user.keyboard('{Enter}');
        await user.keyboard(' ');
        expect(onRefresh).toHaveBeenCalledTimes(3);
    });

    it('spins, reports aria-busy and ignores repeat activations while fetching, without losing focus', async () => {
        const user = userEvent.setup();
        const onRefresh = vi.fn();
        renderWithoutProviders(<RefreshButton onRefresh={onRefresh} isFetching />);
        const button = screen.getByRole('button', { name: 'Refresh' });

        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();
        const icon = button.querySelector('svg');
        expect(icon).toHaveClass('animate-spin');
        expect(icon).toHaveAttribute('aria-hidden', 'true');

        await user.tab();
        expect(button).toHaveFocus();
        await user.keyboard('{Enter}');
        await user.click(button);
        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('renders an icon-only variant named by aria-label with a matching tooltip', () => {
        renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} iconOnly label="Refresh departments" />);
        const button = screen.getByRole('button', { name: 'Refresh departments' });
        expect(button).toHaveAttribute('title', 'Refresh departments');
        expect(button).toHaveTextContent('');
        expect(button.className.split(/\s+/)).toContain('w-10');
    });

    it('maps size="compact" onto the 32px compact and iconCompact geometry', () => {
        const { unmount } = renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} size="compact" />);
        expect(screen.getByRole('button', { name: 'Refresh' }).className.split(/\s+/)).toContain('h-8');
        unmount();

        renderWithoutProviders(<RefreshButton onRefresh={vi.fn()} iconOnly size="compact" />);
        const iconButton = screen.getByRole('button', { name: 'Refresh' }).className.split(/\s+/);
        expect(iconButton).toContain('w-8');
        expect(iconButton).toContain('h-8');
    });
});

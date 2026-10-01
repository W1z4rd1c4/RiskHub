import { useState } from 'react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogPagination } from '@/components/activity-log/ActivityLogPagination';
import i18n from '@/i18n';
import { DetailActionBanner } from '@/pages/detail/DetailActionBanner';
import { renderWithoutProviders, screen, userEvent } from '@test/render';

/**
 * AX-01 / PG-33 (Phase 0): icon-only buttons on shared surfaces carry a translated
 * accessible name, an explicit `type="button"`, and hide their decorative icon.
 */

function PaginationHarness() {
    const [page, setPage] = useState(0);
    return <ActivityLogPagination page={page} setPage={setPage} limit={10} total={35} isLoading={false} />;
}

describe('AX-01 icon-only button names', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
    });

    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it('names the DetailActionBanner dismiss button and keeps its icon decorative', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        renderWithoutProviders(
            <DetailActionBanner message={{ key: 'saved' }} messageText="Change sent for approval" onClose={onClose} />,
        );

        const dismiss = screen.getByRole('button', { name: 'Dismiss message' });
        expect(dismiss).toHaveAttribute('type', 'button');
        expect(dismiss.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        await user.click(dismiss);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('translates the dismiss name into Czech', async () => {
        await i18n.changeLanguage('cs');
        renderWithoutProviders(
            <DetailActionBanner message={{ key: 'saved', isError: true }} messageText="Chyba" onClose={vi.fn()} />,
        );

        expect(screen.getByRole('button', { name: 'Zavřít zprávu' })).toBeInTheDocument();
    });

    it('names ActivityLogPagination chevrons and marks the current page', async () => {
        const user = userEvent.setup();
        renderWithoutProviders(<PaginationHarness />);

        const previous = screen.getByRole('button', { name: 'Previous page' });
        const next = screen.getByRole('button', { name: 'Next page' });
        expect(previous).toHaveAttribute('type', 'button');
        expect(previous).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page');

        await user.click(next);
        expect(screen.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: 'Go to page 1' })).not.toHaveAttribute('aria-current');
        expect(previous).toBeEnabled();
    });
});

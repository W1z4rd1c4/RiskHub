import { afterAll, describe, expect, it } from 'vitest';

import { PendingChangeBadge } from '@/components/approvals/PendingChangeBadge';
import i18n from '@/i18n';
import { renderWithoutProviders, screen } from '@test/render';

/** Audit §4.9 / PG-29: one pending-approval badge for every register row. */
describe('PendingChangeBadge', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each([
        ['en', 'Pending approval'],
        ['cs', 'Čeká na schválení'],
    ] as const)('announces the full pending-approval meaning in %s', async (language, srText) => {
        await i18n.changeLanguage(language);
        renderWithoutProviders(<PendingChangeBadge data-testid="pending" />);

        const badge = screen.getByTestId('pending');
        expect(badge).toHaveAttribute('data-tone', 'warning');
        expect(badge).toHaveAttribute('title', srText);
        expect(badge).toHaveTextContent(srText);
    });
});

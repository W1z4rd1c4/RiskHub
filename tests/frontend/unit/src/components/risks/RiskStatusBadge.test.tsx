import { afterAll, describe, expect, it } from 'vitest';

import { RiskPriorityBadge, RiskStatusBadge } from '@/components/risks/RiskStatusBadge';
import i18n from '@/i18n';
import type { RiskDisplayStatus } from '@/pages/risks/risksPagePresentation';
import { renderWithoutProviders, screen } from '@test/render';

const STATUSES: RiskDisplayStatus[] = ['active', 'emerging', 'archived'];

/** Audit §4.9 / PG-03, PG-46: translated risk status badges and a named priority star. */
describe('RiskStatusBadge', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each(['en', 'cs'] as const)('resolves a translated label for every status in %s', async (language) => {
        await i18n.changeLanguage(language);
        for (const status of STATUSES) {
            const { unmount } = renderWithoutProviders(<RiskStatusBadge status={status} />);
            const badge = document.querySelector(`[data-status="${status}"]`);
            expect(badge).not.toBeNull();
            expect(badge?.textContent).toBe(i18n.t(`risks:status.${status}`));
            expect(badge?.textContent).not.toBe(status);
            unmount();
        }
    });

    it.each([
        ['en', 'Priority risk'],
        ['cs', 'Prioritní riziko'],
    ] as const)('names the priority star in %s', async (language, name) => {
        await i18n.changeLanguage(language);
        renderWithoutProviders(<RiskPriorityBadge />);
        expect(screen.getByRole('img', { name })).toBeInTheDocument();
    });
});

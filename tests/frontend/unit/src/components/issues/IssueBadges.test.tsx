import { afterAll, describe, expect, it } from 'vitest';

import { IssueSeverityBadge, IssueStatusBadge } from '@/components/issues/IssueBadges';
import i18n from '@/i18n';
import type { IssueSeverity, IssueStatus } from '@/types/issue';
import { renderWithoutProviders } from '@test/render';

const STATUSES: IssueStatus[] = ['open', 'triaged', 'in_progress', 'ready_for_validation', 'closed'];
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];

/** Audit §4.9 / DS-13, D1: issue badges on the shared shell with translated labels. */
describe('Issue badges', () => {
    afterAll(async () => {
        await i18n.changeLanguage('en');
    });

    it.each(['en', 'cs'] as const)('translates every status and severity in %s', async (language) => {
        await i18n.changeLanguage(language);
        for (const status of STATUSES) {
            const { container, unmount } = renderWithoutProviders(<IssueStatusBadge status={status} />);
            expect(container.textContent).toBe(i18n.t(`issues:status.${status}`));
            expect(container.textContent).not.toContain('_');
            unmount();
        }
        for (const severity of SEVERITIES) {
            const { container, unmount } = renderWithoutProviders(<IssueSeverityBadge severity={severity} />);
            const badge = container.querySelector('[data-severity]');
            expect(badge?.textContent).toBe(i18n.t(`issues:severity.${severity}`));
            unmount();
        }
    });
});

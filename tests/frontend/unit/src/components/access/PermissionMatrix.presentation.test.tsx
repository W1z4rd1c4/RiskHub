import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionChips, PermissionMatrix } from '@/components/access/PermissionMatrix';
import i18n from '@/i18n';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('permission access presentation', () => {
    it('uses English task labels and discloses raw tokens only on request', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();

        render(<PermissionMatrix permissions={['risks:write', 'activity_log:read', 'legacy_permission']} />);

        expect(screen.getByRole('button', { name: 'Can manage risks' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Can view activity log' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Restricted permission' })).toBeVisible();
        expect(screen.getByText('Additional access')).toBeVisible();

        for (const token of ['risks:write', 'activity_log:read', 'legacy_permission']) {
            expect(screen.getByText(token)).not.toBeVisible();
            expect(screen.queryByTitle(token)).not.toBeInTheDocument();
        }

        await user.click(screen.getByText('Technical details'));
        for (const token of ['risks:write', 'activity_log:read', 'legacy_permission']) {
            expect(screen.getByText(token)).toBeVisible();
        }
    });

    it('uses Czech task labels and a localized restricted fallback', async () => {
        await i18n.changeLanguage('cs');

        render(<PermissionChips permissions={['approvals:write', 'legacy_permission']} />);

        expect(screen.getByText('Může vyřešit schválení')).toBeVisible();
        expect(screen.getByText('Omezené oprávnění')).toBeVisible();
        expect(screen.queryByText('approvals:write')).not.toBeInTheDocument();
        expect(screen.queryByText('legacy_permission')).not.toBeInTheDocument();
    });

    it('preserves editable permission changes while presenting task labels', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        const onPermissionsChange = vi.fn();

        render(
            <PermissionMatrix
                permissions={[]}
                editable
                onPermissionsChange={onPermissionsChange}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Can manage risks' }));
        expect(onPermissionsChange).toHaveBeenLastCalledWith(['risks:write']);
    });

    it('has no structural accessibility violations in the disclosure state', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        const { container } = render(
            <PermissionMatrix permissions={['risks:write', 'legacy_permission']} />,
        );

        await user.click(screen.getByText('Technical details'));
        const results = await axe.run(container, {
            runOnly: { type: 'tag', values: AXE_TAGS },
            rules: { 'color-contrast': { enabled: false } },
        });
        const summary = results.violations
            .map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.help}`)
            .join('\n');
        expect(summary, summary).toBe('');
    });
});

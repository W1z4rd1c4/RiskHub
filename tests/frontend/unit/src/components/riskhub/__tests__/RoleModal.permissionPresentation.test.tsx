import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoleModal } from '@/components/riskhub/roles/RoleModal';
import i18n from '@/i18n';
import type { PermissionRead } from '@/services/riskHubApi';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const permissions: PermissionRead[] = [
    { id: 1, resource: 'risks', action: 'write', description: 'Write risks from backend' },
    { id: 2, resource: 'activity_log', action: 'read', description: 'Read activity log from backend' },
    { id: 3, resource: 'legacy', action: 'custom', description: 'Legacy capability from backend' },
];

function renderRoleModal(onSave = vi.fn(async () => {})) {
    return {
        onSave,
        ...render(
            <RoleModal
                allPermissions={permissions}
                isOpen
                onClose={() => {}}
                onSave={onSave}
                permissionsLoading={false}
                role={null}
            />,
        ),
    };
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('RoleModal permission presentation', () => {
    it('uses English task labels, hides raw tokens, and preserves submitted ids', async () => {
        await i18n.changeLanguage('en');
        const user = userEvent.setup();
        const { onSave } = renderRoleModal();

        expect(screen.getByText('Risks')).toBeVisible();
        expect(screen.getByText('Activity Log')).toBeVisible();
        expect(screen.getByText('Additional access')).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Can manage risks' })).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Can view activity log' })).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Restricted permission' })).toBeVisible();

        for (const raw of ['risks', 'write', 'activity_log', 'read', 'legacy', 'custom']) {
            expect(screen.queryByText(raw)).not.toBeInTheDocument();
            expect(screen.queryByTitle(raw)).not.toBeInTheDocument();
        }
        for (const token of ['risks:write', 'activity_log:read', 'legacy:custom']) {
            expect(screen.getByText(token)).not.toBeVisible();
        }

        await user.type(screen.getByLabelText('Role Identifier'), 'risk_editor');
        await user.type(screen.getByLabelText('Display Name'), 'Risk Editor');
        await user.click(screen.getByRole('checkbox', { name: 'Can manage risks' }));
        await user.click(screen.getByRole('button', { name: 'Save Role' }));

        expect(onSave).toHaveBeenCalledWith({
            name: 'risk_editor',
            display_name: 'Risk Editor',
            description: '',
            permission_ids: [1],
        });
    });

    it('uses Czech task labels and the canonical Záznam aktivit term', async () => {
        await i18n.changeLanguage('cs');
        const user = userEvent.setup();
        renderRoleModal();

        expect(screen.getByText('Záznam aktivit')).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Může zobrazit Záznam aktivit' })).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Může spravovat rizika' })).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'Omezené oprávnění' })).toBeVisible();
        expect(screen.queryByText(/protokol aktivit/i)).not.toBeInTheDocument();

        for (const token of ['risks:write', 'activity_log:read', 'legacy:custom']) {
            expect(screen.getByText(token)).not.toBeVisible();
        }
        await user.click(screen.getByText('Technické podrobnosti'));
        for (const token of ['risks:write', 'activity_log:read', 'legacy:custom']) {
            expect(screen.getByText(token)).toBeVisible();
        }
    });

    it('has no structural accessibility violations with non-empty permissions', async () => {
        await i18n.changeLanguage('en');
        const { container } = renderRoleModal();

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

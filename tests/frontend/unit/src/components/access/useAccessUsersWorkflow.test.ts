import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { AccessUserRead } from '@/types/access';

import {
    buildAccessUserActionModel,
    buildAccessUserPresentationModel,
    resolveImportedUserTransition,
} from '@/components/access/useAccessUsersWorkflow';

describe('useAccessUsersWorkflow helpers', () => {
    it('resolves imported users and safe presentation facts', () => {
        const users: AccessUserRead[] = [
            {
                id: 42,
                name: 'Ada Lovelace',
                email: 'ada@example.test',
                is_active: true,
                role_id: 1,
                role: { id: 1, name: 'cro', display_name: 'CRO', description: null },
                department_id: null,
                manager_id: null,
                manager_name: null,
                scope_label: 'Global',
                effective_permissions: [],
                capabilities: {
                    can_edit_identity: true,
                    can_edit_business_access: true,
                    can_edit_role: true,
                    can_deactivate: true,
                    can_change_active_status: true,
                    can_break_glass_enable: false,
                    can_revoke_sessions: true,
                },
                department_name: null,
                access_scope: 'global',
                external_id: 'entra-1',
            },
        ];

        Reflect.deleteProperty(users[0], 'capabilities');

        expect(resolveImportedUserTransition({
            isAccessMode: true,
            importedUserId: 42,
            users,
        })?.user.name).toBe('Ada Lovelace');

        expect(buildAccessUserActionModel(users[0])).toMatchObject({
            canEdit: true,
            canDeactivate: true,
            canReactivate: false,
            canRunDirectoryCheck: false,
        });
        expect(buildAccessUserPresentationModel(users[0]).departmentText).toBe('Unknown department');
    });

    it('keeps UsersPage wired to the shared workflow module', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/UsersPage.tsx'), 'utf8');

        expect(source).toContain('useAccessUsersWorkflow');
    });

    it('keeps action and presentation models wired to production access rows', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/access/UsersTable.tsx'), 'utf8');

        expect(source).toContain('actionModelsByUserId.get(user.id)');
        expect(source).toContain('presentationModelsByUserId.get(user.id)');
        expect(source).toContain('<AccessUserRow');
    });
});

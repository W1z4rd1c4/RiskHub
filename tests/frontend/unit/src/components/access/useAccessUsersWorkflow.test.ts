import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
    buildAccessUserActionModel,
    buildAccessUserPresentationModel,
    resolveImportedUserTransition,
} from '@/components/access/useAccessUsersWorkflow';

describe('useAccessUsersWorkflow helpers', () => {
    it('resolves imported users and safe presentation facts', () => {
        const users = [
            {
                id: 42,
                name: 'Ada Lovelace',
                email: 'ada@example.test',
                is_active: true,
                role: { name: 'cro', display_name: 'CRO' },
                department_name: null,
                access_scope: 'global',
                external_id: 'entra-1',
            },
        ] as any[];

        expect(resolveImportedUserTransition({
            isAccessMode: true,
            importedUserId: 42,
            users,
        })?.user.name).toBe('Ada Lovelace');

        expect(buildAccessUserActionModel(users[0])).toMatchObject({
            canEdit: true,
            canDeactivate: true,
            canReactivate: false,
            canRunDirectoryCheck: true,
        });
        expect(buildAccessUserPresentationModel(users[0]).departmentText).toBe('Unknown department');
    });

    it('keeps UsersPage wired to the shared workflow module', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/UsersPage.tsx'), 'utf8');

        expect(source).toContain('useAccessUsersWorkflow');
    });

    it('keeps action and presentation models wired to production access rows', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/access/AccessUserRow.tsx'), 'utf8');

        expect(source).toContain('buildAccessUserActionModel');
        expect(source).toContain('buildAccessUserPresentationModel');
    });
});

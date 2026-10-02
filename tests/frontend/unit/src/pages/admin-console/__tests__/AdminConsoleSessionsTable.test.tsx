import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { SessionsTable } from '@/pages/admin-console/sections/ops/SessionsTable';
import type { ActiveSession } from '@/services/adminApi';

function makeSession(overrides: Partial<ActiveSession> = {}): ActiveSession {
    return {
        user_id: 1,
        user_name: 'Ada Lovelace',
        user_email: 'ada@example.test',
        role: 'Employee',
        department: 'Operations',
        last_activity: new Date().toISOString(),
        is_active: true,
        active_sessions: 1,
        last_login: new Date().toISOString(),
        ...overrides,
    };
}

afterEach(async () => {
    await i18n.changeLanguage('en');
});

describe('SessionsTable', () => {
    it('pluralizes the device count instead of printing "1 devices" (GAP-C-13)', async () => {
        render(
            <SessionsTable
                canRevokeSessions
                onRevoke={vi.fn()}
                sessions={[
                    makeSession({ user_id: 1, active_sessions: 1 }),
                    makeSession({ user_id: 2, user_name: 'Grace Hopper', active_sessions: 3 }),
                ]}
            />,
        );

        expect(screen.getByText('1 device')).toBeInTheDocument();
        expect(screen.getByText('3 devices')).toBeInTheDocument();
    });

    it('uses the Czech plural categories for the device count', async () => {
        await i18n.changeLanguage('cs');
        render(
            <SessionsTable
                canRevokeSessions={false}
                onRevoke={vi.fn()}
                sessions={[makeSession({ active_sessions: 2 })]}
            />,
        );

        expect(screen.getByText('2 zařízení')).toBeInTheDocument();
    });

    it('renders on the shared table primitives: named scroll region and column-scoped headers (DS-11)', () => {
        render(
            <SessionsTable canRevokeSessions onRevoke={vi.fn()} sessions={[makeSession({ is_active: false })]} />,
        );

        expect(screen.getByRole('region', { name: 'Active Sessions' })).toBeInTheDocument();
        for (const header of screen.getAllByRole('columnheader')) {
            expect(header).toHaveAttribute('scope', 'col');
        }
        // A revoked session shows its state as a badge rather than an action.
        expect(screen.getByText('Access Revoked')).toHaveAttribute('data-tone', 'danger');
        expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
    });
});

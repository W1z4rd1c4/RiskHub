import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode } from 'react';

import { AccessEditModal } from '@/components/access/AccessEditModal';
import { ApiClientError } from '@/services/apiClient';
import type { AccessUserRead, RoleWithPermissions } from '@/types/access';

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        allowEmpty,
        emptyLabel,
        className,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        allowEmpty?: boolean;
        emptyLabel?: string;
        className?: string;
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
            className={className}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
        >
            {allowEmpty && <option value="">{emptyLabel ?? placeholder ?? 'None'}</option>}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

const accessApiMocks = vi.hoisted(() => ({
    listAccessRoles: vi.fn(),
    listAccessUsers: vi.fn(),
    updateAccessUser: vi.fn(),
}));

const departmentApiMocks = vi.hoisted(() => ({
    getDepartments: vi.fn(),
}));

let currentPermissions = {
    canManagePrivileged: true,
    canEditAccessUsers: true,
    canManageUsers: true,
};

vi.mock('@/services/accessApi', () => ({
    accessApi: accessApiMocks,
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: departmentApiMocks,
}));

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => currentPermissions,
}));

function makeRole(id: number, name: string, displayName: string): RoleWithPermissions {
    return {
        id,
        name,
        display_name: displayName,
        description: `${displayName} role`,
        permissions: [],
    };
}

function makeAccessUser(overrides: Partial<AccessUserRead> = {}): AccessUserRead {
    return {
        id: 42,
        email: 'user@riskhub.test',
        name: 'Original User',
        is_active: true,
        role_id: 2,
        role: {
            id: 2,
            name: 'employee',
            display_name: 'Employee',
            description: 'Standard employee',
        },
        department_id: 10,
        department_name: 'Operations',
        manager_id: null,
        manager_name: null,
        access_scope: 'department',
        scope_label: 'Department',
        effective_permissions: ['risks:read'],
        ...overrides,
    };
}

describe('AccessEditModal', () => {
    beforeEach(() => {
        accessApiMocks.listAccessRoles.mockReset();
        accessApiMocks.listAccessUsers.mockReset();
        accessApiMocks.updateAccessUser.mockReset();
        departmentApiMocks.getDepartments.mockReset();
        currentPermissions = {
            canManagePrivileged: true,
            canEditAccessUsers: true,
            canManageUsers: true,
        };
        accessApiMocks.listAccessRoles.mockResolvedValue([
            makeRole(1, 'admin', 'Administrator'),
            makeRole(2, 'employee', 'Employee'),
        ]);
        accessApiMocks.listAccessUsers.mockResolvedValue([]);
        accessApiMocks.updateAccessUser.mockResolvedValue(makeAccessUser());
        departmentApiMocks.getDepartments.mockResolvedValue([]);
    });

    it('submits one combined PATCH for identity and access edits', async () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser()}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        const nameInput = await screen.findByDisplayValue('Original User');
        const emailInput = screen.getByDisplayValue('user@riskhub.test');

        await user.clear(nameInput);
        await user.type(nameInput, 'Updated User');
        await user.clear(emailInput);
        await user.type(emailInput, 'updated.user@riskhub.test');
        await user.click(screen.getByRole('button', { name: /administrator/i }));
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(accessApiMocks.updateAccessUser).toHaveBeenCalledWith(42, {
                name: 'Updated User',
                email: 'updated.user@riskhub.test',
                role_id: 1,
            });
        });
        expect(accessApiMocks.updateAccessUser).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the modal open after a duplicate-email failure without partial success callbacks', async () => {
        accessApiMocks.updateAccessUser.mockRejectedValue(
            new ApiClientError({
                status: 400,
                code: 'REQUEST_FAILED',
                messageKey: 'errorKeys.request_failed',
                rawMessage: 'Email already registered',
            })
        );

        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser()}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        const nameInput = await screen.findByDisplayValue('Original User');
        const emailInput = screen.getByDisplayValue('user@riskhub.test');

        await user.clear(nameInput);
        await user.type(nameInput, 'Pending User');
        await user.clear(emailInput);
        await user.type(emailInput, 'duplicate@riskhub.test');
        await user.click(screen.getByRole('button', { name: /administrator/i }));
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(accessApiMocks.updateAccessUser).toHaveBeenCalledTimes(1);
        });
        expect(onSaved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByText('Email already registered')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Pending User')).toBeInTheDocument();
        expect(screen.getByDisplayValue('duplicate@riskhub.test')).toBeInTheDocument();
    });

    it('submits access-only edits for CRO without identity fields', async () => {
        currentPermissions = {
            canManagePrivileged: true,
            canEditAccessUsers: true,
            canManageUsers: false,
        };

        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser()}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        await screen.findByText('Employee');
        expect(screen.queryByDisplayValue('Original User')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('user@riskhub.test')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /administrator/i }));
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(accessApiMocks.updateAccessUser).toHaveBeenCalledWith(42, { role_id: 1 });
        });
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

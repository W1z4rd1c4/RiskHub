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

vi.mock('@/services/accessApi', () => ({
    accessApi: accessApiMocks,
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: departmentApiMocks,
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
        capabilities: {
            can_edit_identity: true,
            can_edit_business_access: true,
            can_edit_role: true,
            can_deactivate: true,
            can_revoke_sessions: true,
        },
        ...overrides,
    };
}

describe('AccessEditModal', () => {
    beforeEach(() => {
        accessApiMocks.listAccessRoles.mockReset();
        accessApiMocks.listAccessUsers.mockReset();
        accessApiMocks.updateAccessUser.mockReset();
        departmentApiMocks.getDepartments.mockReset();
        accessApiMocks.listAccessRoles.mockResolvedValue([
            makeRole(1, 'admin', 'Administrator'),
            makeRole(2, 'employee', 'Employee'),
            makeRole(3, 'department_head', 'Department Head'),
        ]);
        accessApiMocks.listAccessUsers.mockResolvedValue([]);
        accessApiMocks.updateAccessUser.mockResolvedValue(makeAccessUser());
        departmentApiMocks.getDepartments.mockResolvedValue([]);
    });

    it('submits platform fields and admin role assignment for Admin', async () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser({
                    capabilities: {
                        can_edit_identity: true,
                        can_edit_business_access: false,
                        can_edit_role: true,
                        can_deactivate: true,
                        can_revoke_sessions: true,
                    },
                })}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        const [nameInput, emailInput] = await screen.findAllByRole('textbox');

        expect(accessApiMocks.listAccessRoles).toHaveBeenCalledTimes(1);
        expect(departmentApiMocks.getDepartments).not.toHaveBeenCalled();
        expect(accessApiMocks.listAccessUsers).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /employee/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /department head/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/reports to/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/global/i)).not.toBeInTheDocument();

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
        const [nameInput, emailInput] = await screen.findAllByRole('textbox');

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

    it('clears stale submit errors when reopened for a new edit session', async () => {
        accessApiMocks.updateAccessUser.mockRejectedValueOnce(
            new ApiClientError({
                status: 400,
                code: 'REQUEST_FAILED',
                messageKey: 'errorKeys.request_failed',
                rawMessage: 'Email already registered',
            })
        );

        const onClose = vi.fn();
        const onSaved = vi.fn();
        const modalUser = makeAccessUser();

        const { rerender } = render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={modalUser}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        const [, emailInput] = await screen.findAllByRole('textbox');
        await user.clear(emailInput);
        await user.type(emailInput, 'duplicate@riskhub.test');
        await user.click(screen.getByRole('button', { name: /administrator/i }));
        await user.click(screen.getByRole('button', { name: /save/i }));

        expect(await screen.findByText('Email already registered')).toBeInTheDocument();

        rerender(
            <AccessEditModal
                isOpen={false}
                onClose={onClose}
                user={modalUser}
                onSaved={onSaved}
            />
        );
        rerender(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={modalUser}
                onSaved={onSaved}
            />
        );

        await screen.findByDisplayValue('user@riskhub.test');
        expect(screen.queryByText('Email already registered')).not.toBeInTheDocument();
    });

    it('submits business access edits for CRO without platform fields or Admin role', async () => {
        departmentApiMocks.getDepartments.mockResolvedValue([
            { id: 20, name: 'Finance' },
        ]);
        accessApiMocks.listAccessUsers.mockResolvedValue([
            makeAccessUser({ id: 77, name: 'Manager User', email: 'manager@riskhub.test' }),
        ]);

        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser({
                    capabilities: {
                        can_edit_identity: false,
                        can_edit_business_access: true,
                        can_edit_role: true,
                        can_deactivate: false,
                        can_revoke_sessions: false,
                    },
                })}
                onSaved={onSaved}
            />
        );

        const user = userEvent.setup();
        await screen.findByText('Employee');
        expect(screen.queryByDisplayValue('Original User')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('user@riskhub.test')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /administrator/i })).not.toBeInTheDocument();
        expect(accessApiMocks.listAccessRoles).toHaveBeenCalledTimes(1);
        expect(departmentApiMocks.getDepartments).toHaveBeenCalledTimes(1);
        expect(accessApiMocks.listAccessUsers).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: /department head/i }));
        await user.selectOptions(screen.getByLabelText(/no department/i), '20');
        await user.selectOptions(screen.getByLabelText(/no manager/i), '77');
        await user.click(screen.getByText(/global/i));
        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(accessApiMocks.updateAccessUser).toHaveBeenCalledWith(42, {
                role_id: 3,
                department_id: 20,
                manager_id: 77,
                access_scope: 'global',
            });
        });
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('uses backend capabilities to hide locally allowed access actions', async () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser({
                    capabilities: {
                        can_edit_identity: false,
                        can_edit_business_access: false,
                        can_edit_role: false,
                        can_deactivate: false,
                        can_revoke_sessions: false,
                    },
                })}
                onSaved={onSaved}
            />
        );

        await screen.findByText('Original User');

        expect(screen.queryByDisplayValue('Original User')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /administrator/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    });

    it('hides editable fields and prevents payload fields when capabilities are missing', async () => {
        const onClose = vi.fn();
        const onSaved = vi.fn();

        render(
            <AccessEditModal
                isOpen
                onClose={onClose}
                user={makeAccessUser({ capabilities: null })}
                onSaved={onSaved}
            />
        );

        await screen.findByText('Original User');

        expect(screen.queryByDisplayValue('Original User')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /administrator/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
        expect(accessApiMocks.updateAccessUser).not.toHaveBeenCalled();
    });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { UsersFilterBar } from '@/components/access/UsersFilterBar';
import { UserNewLocalForm } from '@/pages/users/UserNewLocalForm';
import type { RoleWithPermissions } from '@/types/access';
import type { UserCreate } from '@/types/user';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const roles = [
    { id: 3, name: 'employee', display_name: 'Employee', description: null, permissions: [] },
] as unknown as RoleWithPermissions[];

const formData: UserCreate = {
    name: '',
    email: '',
    password: '',
    role_id: 3,
    department_id: null,
    is_active: true,
} as UserCreate;

function renderLocalForm(overrides: Partial<Parameters<typeof UserNewLocalForm>[0]> = {}) {
    return render(
        <UserNewLocalForm
            departments={[{ id: 1, name: 'Operations' }] as Parameters<typeof UserNewLocalForm>[0]['departments']}
            formData={formData}
            isLoading={false}
            onCancel={vi.fn()}
            onSubmit={vi.fn((event) => event.preventDefault())}
            roles={roles}
            setFormData={vi.fn()}
            {...overrides}
        />,
    );
}

describe('local user creation form (AX-04, DS-10)', () => {
    it('associates every control with a visible label and marks required fields', () => {
        renderLocalForm();

        for (const name of [/full name/i, /email address/i, /password/i]) {
            const input = screen.getByLabelText(name);
            expect(input).toBeRequired();
            expect(input).toHaveAttribute('aria-required', 'true');
        }
        expect(screen.getByRole('combobox', { name: /platform role/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /department/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /active and can log in immediately/i })).toBeChecked();
        // The required marker is decorative (the control carries aria-required).
        expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
        expect(screen.getByText('(optional)')).toBeInTheDocument();
    });

    it('uses Button primitives and announces a pending submit', () => {
        renderLocalForm({ isLoading: true });

        const submit = screen.getByRole('button', { name: /create user/i });
        expect(submit).toBeDisabled();
        expect(submit).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('button', { name: /cancel/i })).toHaveAttribute('type', 'button');
    });

    it('updates the form through the shared controls', async () => {
        const setFormData = vi.fn();
        renderLocalForm({ setFormData });
        const user = userEvent.setup();

        await user.type(screen.getByLabelText(/full name/i), 'A');
        expect(setFormData).toHaveBeenCalledWith(expect.objectContaining({ name: 'A' }));
        await user.click(screen.getByRole('checkbox', { name: /active and can log in immediately/i }));
        expect(setFormData).toHaveBeenLastCalledWith(expect.objectContaining({ is_active: false }));
    });

    it('has no structural accessibility violations', async () => {
        const { container } = renderLocalForm();

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

describe('users filter bar names (AX-04)', () => {
    it('names the search and every filter instead of announcing "Select"', () => {
        render(
            <UsersFilterBar
                isAccessMode
                roleOptions={[{ value: 'employee', label: 'Employee' }]}
                searchTerm=""
                setSearchTerm={vi.fn()}
                roleFilter=""
                setRoleFilter={vi.fn()}
                scopeFilter=""
                setScopeFilter={vi.fn()}
                permResourceFilter="all"
                setPermResourceFilter={vi.fn()}
                permActionFilter="all"
                setPermActionFilter={vi.fn()}
                hasPermFilters
                resetPermissionFilters={vi.fn()}
                filteredCount={1}
                totalCount={2}
            />,
        );

        expect(screen.getByRole('textbox', { name: /search by name or email/i })).toBeInTheDocument();
        const names = screen.getAllByRole('combobox').map((node) => node.getAttribute('aria-label'));
        expect(names).toEqual(['Role', 'Access Scope', 'Resource', 'Actions']);
        expect(screen.getByRole('button', { name: /clear/i })).toHaveAttribute('type', 'button');
    });
});

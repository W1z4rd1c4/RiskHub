import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RolesPanel } from '@/components/riskhub/RolesPanel';

const mockCreateRole = vi.fn();
const mockDeleteRole = vi.fn();
const mockGetPermissions = vi.fn();
const mockGetCapabilities = vi.fn();
const mockGetRoles = vi.fn();
const mockRestoreRole = vi.fn();
const mockUpdateRole = vi.fn();

vi.mock('@/services/riskHubApi', async () => {
    const actual = await vi.importActual<typeof import('@/services/riskHubApi')>('@/services/riskHubApi');
    return {
        ...actual,
        riskHubApi: {
            createRole: (...args: unknown[]) => mockCreateRole(...args),
            deleteRole: (...args: unknown[]) => mockDeleteRole(...args),
            getCapabilities: (...args: unknown[]) => mockGetCapabilities(...args),
            getPermissions: (...args: unknown[]) => mockGetPermissions(...args),
            getRoles: (...args: unknown[]) => mockGetRoles(...args),
            restoreRole: (...args: unknown[]) => mockRestoreRole(...args),
            updateRole: (...args: unknown[]) => mockUpdateRole(...args),
        },
    };
});

const permissions = [
    { id: 1, resource: 'risks', action: 'read', description: 'Read risks' },
    { id: 2, resource: 'risks', action: 'write', description: 'Write risks' },
    { id: 3, resource: 'controls', action: 'read', description: 'Read controls' },
];

const roles = [
    {
        id: 1,
        name: 'admin',
        display_name: 'Admin',
        description: 'System admin',
        is_system: true,
        is_active: true,
        user_count: 1,
        permissions: ['*:*'],
        capabilities: { can_update: false, can_delete: false, can_restore: false },
    },
    {
        id: 2,
        name: 'risk_owner',
        display_name: 'Risk Owner',
        description: 'Owns risk work',
        is_system: false,
        is_active: true,
        user_count: 0,
        permissions: ['risks:read'],
        capabilities: { can_update: true, can_delete: true, can_restore: false },
    },
    {
        id: 3,
        name: 'assigned_custom',
        display_name: 'Assigned Custom',
        description: 'Assigned custom role',
        is_system: false,
        is_active: true,
        user_count: 2,
        permissions: [],
        capabilities: { can_update: true, can_delete: true, can_restore: false },
    },
    {
        id: 4,
        name: 'archived_role',
        display_name: 'Archived Role',
        description: null,
        is_system: false,
        is_active: false,
        user_count: 0,
        permissions: [],
        capabilities: { can_update: false, can_delete: false, can_restore: true },
    },
];

function renderRolesPanel() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return render(<RolesPanel />, { wrapper });
}

async function waitForRoles() {
    await screen.findByText('Risk Owner');
}

describe('RolesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRoles.mockResolvedValue(roles);
        mockGetCapabilities.mockResolvedValue({
            risk_types: { can_create: true },
            departments: { can_create: true },
            roles: { can_create: true },
            approval_scenarios: { can_update: true },
            system_settings: { can_update: true },
            questionnaires: { can_batch_send: true },
        });
        mockGetPermissions.mockResolvedValue(permissions);
        mockCreateRole.mockResolvedValue(roles[1]);
        mockUpdateRole.mockResolvedValue({ ...roles[1], display_name: 'Risk Owner Updated' });
        mockDeleteRole.mockResolvedValue({ status: 'deleted', id: 2 });
        mockRestoreRole.mockResolvedValue({ ...roles[3], is_active: true });
    });

    it('renders roles and respects capability-driven actions', async () => {
        renderRolesPanel();
        await waitForRoles();

        const adminRow = screen.getByText('Admin').closest('tr');
        expect(adminRow).not.toBeNull();
        expect(within(adminRow as HTMLTableRowElement).getByRole('button', {
            name: /admin role cannot be edited/i,
        })).toBeDisabled();
        expect(within(adminRow as HTMLTableRowElement).queryByLabelText(/archive/i)).not.toBeInTheDocument();

        const archivedRow = screen.getByText('Archived Role').closest('tr');
        expect(archivedRow).not.toBeNull();
        fireEvent.click(within(archivedRow as HTMLTableRowElement).getByLabelText(/restore/i));

        await waitFor(() => expect(mockRestoreRole).toHaveBeenCalledWith(4));
    });

    it('submits create payloads with selected permissions', async () => {
        renderRolesPanel();
        await waitForRoles();

        fireEvent.click(screen.getByRole('button', { name: /add role/i }));
        fireEvent.change(screen.getByLabelText(/role identifier/i), { target: { value: 'Vendor_Lead!' } });
        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Vendor Lead' } });
        fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Vendor lead role' } });
        fireEvent.click(screen.getByLabelText(/Can manage risks/i));
        fireEvent.click(screen.getByRole('button', { name: /save role/i }));

        await waitFor(() => {
            expect(mockCreateRole).toHaveBeenCalledWith({
                name: 'vendor_lead',
                display_name: 'Vendor Lead',
                description: 'Vendor lead role',
                permission_ids: [2],
            });
        });
    });

    it('submits update payloads without immutable role name', async () => {
        renderRolesPanel();
        await waitForRoles();

        const row = screen.getByText('Risk Owner').closest('tr');
        expect(row).not.toBeNull();
        fireEvent.click(within(row as HTMLTableRowElement).getByLabelText(/^edit$/i));
        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Risk Owner Updated' } });
        fireEvent.click(screen.getByLabelText(/Can view controls/i));
        fireEvent.click(screen.getByRole('button', { name: /save role/i }));

        await waitFor(() => {
            expect(mockUpdateRole).toHaveBeenCalledWith(2, {
                display_name: 'Risk Owner Updated',
                description: 'Owns risk work',
                permission_ids: [1, 3],
            });
        });
    });

    it('blocks archiving assigned roles in the confirmation dialog', async () => {
        renderRolesPanel();
        await waitForRoles();

        const row = screen.getByText('Assigned Custom').closest('tr');
        expect(row).not.toBeNull();
        // D10: a role is soft-deleted and restorable, so the row action is a named Archive.
        const archiveButton = within(row as HTMLTableRowElement).getByRole('button', { name: 'Archive Assigned Custom' });
        expect(archiveButton.querySelector('svg.lucide-archive')).not.toBeNull();
        expect(archiveButton.querySelector('svg.lucide-trash-2')).toBeNull();
        fireEvent.click(archiveButton);

        const dialog = await screen.findByRole('alertdialog', { name: 'Archive role?' });
        expect(within(dialog).getByText(/Assigned Custom/)).toBeInTheDocument();
        expect(within(dialog).getByText(/Cannot archive: 2 users/i)).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /^archive$/i })).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('renders archive errors inside the open confirmation dialog', async () => {
        mockDeleteRole.mockRejectedValue(new Error('delete failed'));
        renderRolesPanel();
        await waitForRoles();

        const row = screen.getByText('Risk Owner').closest('tr');
        expect(row).not.toBeNull();
        fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Archive Risk Owner' }));
        const dialog = screen.getByRole('alertdialog', { name: 'Archive role?' });
        fireEvent.click(within(dialog).getByRole('button', { name: /^archive$/i }));

        const alert = await within(dialog).findByRole('alert');
        expect(alert).toHaveTextContent(/Something went wrong/i);
        expect(screen.getByRole('alertdialog', { name: 'Archive role?' })).toBeInTheDocument();
    });

    it('keeps the archive dialog busy while the request is in flight', async () => {
        let resolveArchive: (value: unknown) => void = () => undefined;
        mockDeleteRole.mockImplementation(() => new Promise((resolve) => { resolveArchive = resolve; }));
        renderRolesPanel();
        await waitForRoles();

        const row = screen.getByText('Risk Owner').closest('tr');
        fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Archive Risk Owner' }));
        const dialog = screen.getByRole('alertdialog', { name: 'Archive role?' });
        fireEvent.click(within(dialog).getByRole('button', { name: /^archive$/i }));

        await waitFor(() => expect(dialog).toHaveAttribute('aria-busy', 'true'));
        fireEvent.keyDown(dialog, { key: 'Escape' });
        expect(screen.getByRole('alertdialog', { name: 'Archive role?' })).toBeInTheDocument();

        resolveArchive({ status: 'deleted', id: 2 });
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    });

    it('shows a permission catalogue failure as an error with retry and blocks saving (GAP-C-11)', async () => {
        mockGetPermissions.mockReset();
        mockGetPermissions.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(permissions);
        renderRolesPanel();
        await waitForRoles();

        fireEvent.click(screen.getByRole('button', { name: /add role/i }));
        const error = await screen.findByTestId('role-modal-permissions-error');
        expect(error).toHaveAttribute('role', 'alert');
        expect(screen.getByRole('button', { name: /save role/i })).toBeDisabled();

        fireEvent.click(within(error).getByRole('button', { name: /retry/i }));

        expect(await screen.findByLabelText(/Can manage risks/i)).toBeInTheDocument();
        expect(screen.queryByTestId('role-modal-permissions-error')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save role/i })).toBeEnabled();
    });
});

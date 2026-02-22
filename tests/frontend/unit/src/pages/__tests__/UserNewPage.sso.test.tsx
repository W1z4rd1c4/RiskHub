import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { UserNewPage } from '@/pages/UserNewPage';

const mockNavigate = vi.fn();
const mockGetAuthConfig = vi.fn();

vi.mock('@/hooks/usePermissions', () => ({
    usePermissions: () => ({
        canManageUsers: true,
    }),
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    }),
}));

vi.mock('@/services/authConfig', () => ({
    getAuthConfig: (...args: unknown[]) => mockGetAuthConfig(...args),
    clearAuthConfigCache: vi.fn(),
}));

vi.mock('@/services/userApi', () => ({
    userApi: {
        listRoles: vi.fn().mockResolvedValue([]),
        createUser: vi.fn(),
    },
}));

vi.mock('@/services/departmentApi', () => ({
    departmentApi: {
        getDepartments: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/apiClient', () => ({
    apiClient: {
        toUiMessageKey: vi.fn().mockReturnValue('errorKeys.server'),
    },
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: () => <div data-testid="themed-select" />,
}));

vi.mock('@/components/users/DirectoryUserImportPanel', () => ({
    DirectoryUserImportPanel: ({ onImported }: { onImported: (result: { user_id: number }) => void }) => (
        <div>
            <div>Directory import panel</div>
            <button type="button" onClick={() => onImported({ user_id: 42 })}>
                Import user
            </button>
        </div>
    ),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('UserNewPage SSO mode', () => {
    beforeEach(() => {
        mockNavigate.mockReset();
        mockGetAuthConfig.mockReset();
    });

    it('renders directory import flow and no password field in microsoft_sso mode', async () => {
        mockGetAuthConfig.mockResolvedValue({
            auth_mode: 'microsoft_sso',
        });

        render(<UserNewPage />);

        await screen.findByText('Directory import panel');
        expect(document.querySelector('input[type="password"]')).toBeNull();
    });

    it('navigates to imported user detail after successful directory import', async () => {
        mockGetAuthConfig.mockResolvedValue({
            auth_mode: 'microsoft_sso',
        });

        render(<UserNewPage />);

        fireEvent.click(await screen.findByRole('button', { name: 'Import user' }));

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/users/42');
        });
    });
});

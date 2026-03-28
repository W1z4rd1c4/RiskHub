import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import adminEn from '@/i18n/locales/en/admin.json';

const mockSearchUsers = vi.fn();
const mockImportUser = vi.fn();
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

const { MockApiClientError } = vi.hoisted(() => {
    class HoistedMockApiClientError extends Error {
        status?: number;
        rawMessage?: string;

        constructor(payload: { status?: number; messageKey: string; rawMessage?: string }) {
            super(payload.messageKey);
            this.name = 'ApiClientError';
            this.status = payload.status;
            this.rawMessage = payload.rawMessage;
        }
    }

    return { MockApiClientError: HoistedMockApiClientError };
});

function resolveAdminTranslation(key: string): string | undefined {
    return key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
            return (current as Record<string, unknown>)[part];
        }
        return undefined;
    }, adminEn) as string | undefined;
}

const translateAdmin = (key: string, opts?: { defaultValue?: string }) =>
    resolveAdminTranslation(key) ?? opts?.defaultValue ?? key;

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: translateAdmin,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/directoryApi', () => ({
    directoryApi: {
        searchUsers: (...args: unknown[]) => mockSearchUsers(...args),
        importUser: (...args: unknown[]) => mockImportUser(...args),
    },
}));

vi.mock('@/services/apiClient', () => ({
    ApiClientError: MockApiClientError,
    apiClient: {
        getRawErrorMessage: (error: unknown) =>
            error instanceof MockApiClientError ? error.rawMessage : error instanceof Error ? error.message : undefined,
    },
}));

describe('DirectoryUserImportPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows setup help and reports unavailable state when provider search fails with 503', async () => {
        const onImported = vi.fn();
        const onProviderUnavailableChange = vi.fn();
        mockSearchUsers.mockRejectedValueOnce(
            new MockApiClientError({
                status: 503,
                messageKey: 'errorKeys.service_unavailable',
                rawMessage: 'Directory provider unavailable',
            }),
        );

        render(
            <DirectoryUserImportPanel
                onImported={onImported}
                onProviderUnavailableChange={onProviderUnavailableChange}
            />,
        );

        fireEvent.change(screen.getByPlaceholderText(adminEn.users.directory_search_placeholder), {
            target: { value: 'alice' },
        });

        await waitFor(() => {
            expect(mockSearchUsers).toHaveBeenCalledWith('alice', 25);
        });

        expect(await screen.findByText(adminEn.users.directory_setup_required)).toBeInTheDocument();
        expect(screen.getByText(adminEn.users.directory_setup_help)).toBeInTheDocument();
        expect(onProviderUnavailableChange).toHaveBeenLastCalledWith(true);
        expect(onImported).not.toHaveBeenCalled();
    });

    it('shows a generic search failure and no setup help for non-provider errors', async () => {
        const onImported = vi.fn();
        const onProviderUnavailableChange = vi.fn();
        mockSearchUsers.mockRejectedValueOnce(
            new MockApiClientError({
                status: 500,
                messageKey: 'errorKeys.server',
                rawMessage: 'Graph search failed',
            }),
        );

        render(
            <DirectoryUserImportPanel
                onImported={onImported}
                onProviderUnavailableChange={onProviderUnavailableChange}
            />,
        );

        fireEvent.change(screen.getByPlaceholderText(adminEn.users.directory_search_placeholder), {
            target: { value: 'alice' },
        });

        await waitFor(() => {
            expect(mockSearchUsers).toHaveBeenCalledWith('alice', 25);
        });

        expect(await screen.findByText(adminEn.users.directory_search_failed)).toBeInTheDocument();
        expect(screen.queryByText(adminEn.users.directory_setup_help)).not.toBeInTheDocument();
        expect(onProviderUnavailableChange).toHaveBeenLastCalledWith(false);
        expect(onImported).not.toHaveBeenCalled();
        expect(mockImportUser).not.toHaveBeenCalled();
    });

    it('shows a generic import failure and no setup help for non-provider errors', async () => {
        const onImported = vi.fn();
        const onProviderUnavailableChange = vi.fn();
        mockSearchUsers.mockResolvedValueOnce([
            {
                external_id: 'oid-1',
                display_name: 'Alice Example',
                email: 'alice@example.com',
                user_principal_name: 'alice@example.com',
                department: 'Finance',
                job_title: 'Analyst',
                account_enabled: true,
                source: 'graph',
            },
        ]);
        mockImportUser.mockRejectedValueOnce(
            new MockApiClientError({
                status: 500,
                messageKey: 'errorKeys.server',
                rawMessage: 'Graph request failed',
            }),
        );

        render(
            <DirectoryUserImportPanel
                onImported={onImported}
                onProviderUnavailableChange={onProviderUnavailableChange}
            />,
        );

        fireEvent.change(screen.getByPlaceholderText(adminEn.users.directory_search_placeholder), {
            target: { value: 'alice' },
        });

        await waitFor(() => {
            expect(mockSearchUsers).toHaveBeenCalledWith('alice', 25);
        });

        fireEvent.click(await screen.findByRole('button', { name: adminEn.users.import }));

        await waitFor(() => {
            expect(mockImportUser).toHaveBeenCalledWith('oid-1');
        });

        expect(await screen.findByText(adminEn.users.directory_import_failed)).toBeInTheDocument();
        expect(screen.queryByText(adminEn.users.directory_setup_help)).not.toBeInTheDocument();
        expect(onProviderUnavailableChange).toHaveBeenLastCalledWith(false);
        expect(onImported).not.toHaveBeenCalled();
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
    });
});

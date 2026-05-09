import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HTMLAttributes, ReactNode } from 'react';
import { createTestQueryClient } from '@test/queryClient';
import { renderWithQueryClient } from '@test/utils';

import { ApiClientError } from '@/services/apiClient';

const getAuditLogsMock = vi.fn();
const getCapabilitiesMock = vi.fn();
const getLogConfigMock = vi.fn();
const updateLogConfigMock = vi.fn();
const getLookupUsersMock = vi.fn();
const invalidateQueriesMock = vi.fn();
let latestQueryClient: ReturnType<typeof createTestQueryClient> | null = null;

vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    },
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string, options?: { count?: number }) => (options?.count ? `${key}: ${options.count}` : key),
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatDateTimeValue: (value: string) => `formatted:${value}`,
}));

vi.mock('@/components/ui/ThemedSelect', () => ({
    ThemedSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        allowEmpty,
        emptyLabel,
    }: {
        value: string;
        onValueChange: (value: string) => void;
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
        allowEmpty?: boolean;
        emptyLabel?: string;
    }) => (
        <select aria-label={placeholder ?? 'select'} value={value} onChange={(event) => onValueChange(event.target.value)}>
            {allowEmpty && <option value="">{emptyLabel ?? placeholder ?? 'None'}</option>}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        getAuditLogs: (...args: unknown[]) => getAuditLogsMock(...args),
        getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
        getLogConfig: (...args: unknown[]) => getLogConfigMock(...args),
        updateLogConfig: (...args: unknown[]) => updateLogConfigMock(...args),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getUsers: (...args: unknown[]) => getLookupUsersMock(...args),
    },
}));

import { AuditLogsPanel } from '@/pages/admin-console/sections/AdminConsoleAuditPanels';

function createAuditQueryClient() {
    const queryClient = createTestQueryClient();
    latestQueryClient = queryClient;
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((...args: Parameters<typeof queryClient.invalidateQueries>) => {
        invalidateQueriesMock(...args);
        return originalInvalidate(...args);
    }) as typeof queryClient.invalidateQueries;

    return queryClient;
}

function renderAuditLogsPanel() {
    return renderWithQueryClient(<AuditLogsPanel />, { queryClient: createAuditQueryClient() });
}

function auditLogsPayload() {
    return {
        entries: [
            {
                timestamp: '2026-04-25T10:00:00Z',
                level: 'INFO',
                event: 'user_update',
                logger_name: 'audit',
                request_id: 'req-1',
                user_id: 7,
                client_ip: '127.0.0.1',
                feature: 'users',
                extra: { target: 'user', changed: true },
            },
            {
                timestamp: '2026-04-25T11:00:00Z',
                level: 'INFO',
                event: 'risk_create',
                logger_name: 'audit',
                request_id: 'req-2',
                user_id: null,
                client_ip: null,
                feature: 'risks',
                extra: { risk_id: 'R-1' },
            },
        ],
        total_lines: 2,
        file_path: '/tmp/audit.log',
    };
}

describe('AuditLogsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getLogConfigMock.mockResolvedValue({
            app_log_rotation_size_mb: 25,
            app_log_retention_count: 5,
            audit_log_rotation_size_mb: 50,
            audit_log_retention_count: 10,
        });
        updateLogConfigMock.mockResolvedValue({
            app_log_rotation_size_mb: 30,
            app_log_retention_count: 5,
            audit_log_rotation_size_mb: 50,
            audit_log_retention_count: 10,
        });
        getCapabilitiesMock.mockResolvedValue({
            can_revoke_sessions: true,
            can_run_directory_check_all: true,
            can_update_log_config: true,
            can_export_loaded_audit_logs: true,
        });
        getAuditLogsMock.mockResolvedValue(auditLogsPayload());
        getLookupUsersMock.mockResolvedValue([
            { id: 7, name: 'Ada Lovelace', email: 'ada@example.test' },
        ]);
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:audit-export'),
        });
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it('loads and saves log rotation settings', async () => {
        renderAuditLogsPanel();

        const sizeInput = await screen.findByDisplayValue('25');
        fireEvent.change(sizeInput, { target: { value: '30' } });
        await waitFor(() => {
            expect(sizeInput).toHaveValue(30);
        });
        fireEvent.click(screen.getByRole('button', { name: 'audit.save_settings' }));

        await waitFor(() => {
            expect(updateLogConfigMock).toHaveBeenCalledWith({
                app_log_rotation_size_mb: 30,
                app_log_retention_count: 5,
                audit_log_rotation_size_mb: 50,
                audit_log_retention_count: 10,
            });
        });
        await waitFor(() => {
            expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['logConfig'] });
        });
        expect(await screen.findByText('audit.settings_saved_notice')).toBeInTheDocument();
    });

    it('keeps saved log rotation settings authoritative over stale cached config', async () => {
        getLogConfigMock
            .mockResolvedValueOnce({
                app_log_rotation_size_mb: 25,
                app_log_retention_count: 5,
                audit_log_rotation_size_mb: 50,
                audit_log_retention_count: 10,
            })
            .mockReturnValueOnce(new Promise(() => undefined));

        renderAuditLogsPanel();

        const sizeInput = await screen.findByDisplayValue('25');
        fireEvent.change(sizeInput, { target: { value: '30' } });
        fireEvent.click(screen.getByRole('button', { name: 'audit.save_settings' }));

        await waitFor(() => {
            expect(updateLogConfigMock).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText('audit.settings_saved_notice')).toBeInTheDocument();
        expect(screen.getByDisplayValue('30')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('25')).not.toBeInTheDocument();
        expect(latestQueryClient?.getQueryData(['logConfig'])).toEqual({
            app_log_rotation_size_mb: 30,
            app_log_retention_count: 5,
            audit_log_rotation_size_mb: 50,
            audit_log_retention_count: 10,
        });
    });

    it('preserves unsaved log rotation edits across log config refetches', async () => {
        getLogConfigMock
            .mockResolvedValueOnce({
                app_log_rotation_size_mb: 25,
                app_log_retention_count: 5,
                audit_log_rotation_size_mb: 50,
                audit_log_retention_count: 10,
            })
            .mockResolvedValueOnce({
                app_log_rotation_size_mb: 99,
                app_log_retention_count: 9,
                audit_log_rotation_size_mb: 99,
                audit_log_retention_count: 9,
            });

        renderAuditLogsPanel();

        const sizeInput = await screen.findByDisplayValue('25');
        fireEvent.change(sizeInput, { target: { value: '30' } });
        await waitFor(() => {
            expect(sizeInput).toHaveValue(30);
        });

        await latestQueryClient?.refetchQueries({ queryKey: ['logConfig'] });

        expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('99')).not.toBeInTheDocument();
    });

    it('renders audit logs, filters by event, opens details, and copies details', async () => {
        renderAuditLogsPanel();

        expect(await screen.findAllByText('user update')).not.toHaveLength(0);
        fireEvent.change(screen.getByLabelText('audit.all_events'), { target: { value: 'user_update' } });

        await waitFor(() => {
            expect(getAuditLogsMock).toHaveBeenLastCalledWith({ lines: 100, event_type: 'user_update' });
        });

        await screen.findAllByText('user update');
        const firstRow = screen.getAllByText('user update').find((element) => element.closest('tr'))?.closest('tr');
        expect(firstRow).not.toBeNull();
        fireEvent.click(within(firstRow as HTMLTableRowElement).getByRole('button', { name: 'audit.view' }));

        expect(await screen.findByText(/"target": "user"/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'audit.details_modal.copy' }));

        await waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('"changed": true'));
        });
        expect(await screen.findByRole('button', { name: 'audit.details_modal.copied' })).toBeInTheDocument();
    });

    it('resolves audit actor names through the user lookup', async () => {
        renderAuditLogsPanel();

        expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
        expect(getLookupUsersMock).toHaveBeenCalledWith({
            ids: [7],
            include_inactive: true,
        });
        expect(screen.queryByText('USR-7')).not.toBeInTheDocument();
    });

    it('falls back to Unknown user when an audit actor cannot be resolved', async () => {
        getLookupUsersMock.mockResolvedValueOnce([]);

        renderAuditLogsPanel();

        expect(await screen.findByText('common:fallbacks.unknown_user')).toBeInTheDocument();
        expect(screen.queryByText('USR-7')).not.toBeInTheDocument();
    });

    it('exports CSV and JSON from the loaded audit log entries without refetching', async () => {
        const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        renderAuditLogsPanel();

        await screen.findAllByText('user update');
        fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
        fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

        expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
        expect(URL.createObjectURL).toHaveBeenNthCalledWith(1, expect.any(Blob));
        expect(URL.createObjectURL).toHaveBeenNthCalledWith(2, expect.any(Blob));
        expect(clickMock).toHaveBeenCalledTimes(2);
        expect(getAuditLogsMock).toHaveBeenCalledTimes(1);
        clickMock.mockRestore();
    });

    it('does not export empty loaded audit log payloads', async () => {
        getAuditLogsMock.mockResolvedValueOnce({
            entries: [],
            total_lines: 0,
            file_path: '/tmp/audit.log',
        });
        const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        renderAuditLogsPanel();

        await screen.findByText('audit.event_feed');
        fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
        fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(clickMock).not.toHaveBeenCalled();
        clickMock.mockRestore();
    });

    it('hides audit export and log config save actions when admin capabilities are missing', async () => {
        getCapabilitiesMock.mockResolvedValueOnce({});

        renderAuditLogsPanel();

        await screen.findAllByText('user update');
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'JSON' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'audit.save_settings' })).not.toBeInTheDocument();
        });
    });

    it('shows a user-facing log config save error', async () => {
        updateLogConfigMock.mockRejectedValueOnce(new ApiClientError({
            status: 400,
            code: 'REQUEST_FAILED',
            messageKey: 'errorKeys.request_failed',
            rawMessage: 'Invalid log settings',
        }));

        renderAuditLogsPanel();

        const sizeInput = await screen.findByDisplayValue('25');
        fireEvent.change(sizeInput, { target: { value: '0' } });
        fireEvent.click(screen.getByRole('button', { name: 'audit.save_settings' }));

        expect(await screen.findByText('Invalid log settings')).toBeInTheDocument();
    });
});

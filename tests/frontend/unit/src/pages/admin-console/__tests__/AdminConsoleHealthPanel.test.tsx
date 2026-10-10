import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@test/queryClient';

const refreshHealthMock = vi.fn();
const getSystemStatsMock = vi.fn();
let healthData: unknown;
let schedulerData: unknown;
let outboxData: unknown;

vi.mock('@/i18n/hooks', async (importOriginal) => ({
    // `useFormat` stays real (locale en); only `useTranslation` is stubbed.
    ...(await importOriginal<typeof import('@/i18n/hooks')>()),
    useTranslation: () => ({
        t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/hooks/useAdaptivePollingQuery', () => ({
    useAdaptivePollingQuery: ({ queryKey }: { queryKey: unknown[] }) => {
        const key = String(queryKey[0]);
        const data = key === 'adminHealth' ? healthData : key === 'adminSchedulerStatus' ? schedulerData : outboxData;
        return {
            data,
            isLoading: false,
            isFetching: false,
            refresh: key === 'adminHealth' ? refreshHealthMock : vi.fn(),
        };
    },
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        getSystemHealth: vi.fn(),
        getSystemStats: (...args: unknown[]) => getSystemStatsMock(...args),
        getSchedulerStatus: vi.fn(),
        getOutboxStatus: vi.fn(),
    },
}));

import { HealthPanel } from '@/pages/admin-console/sections/AdminConsoleOpsPanels';

function renderPanel() {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <HealthPanel />
        </QueryClientProvider>,
    );
}

describe('HealthPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        healthData = {
            database_status: 'connected',
            database_latency_ms: 8,
            uptime_seconds: 3_900,
            memory_usage_mb: 128.4,
            last_check: '2026-03-07T12:00:00Z',
        };
        schedulerData = {
            process_role: 'scheduler',
            instance_id: 'scheduler-1',
            process_started_at: '2026-03-07T11:50:00Z',
            scheduler_enabled: true,
            scheduler_running: true,
            lock_provider: 'postgres_advisory',
            lock_acquired: true,
            current_owner_instance_id: 'scheduler-1',
            latest_runs: [{
                run_id: 'run-1',
                job_name: 'outbox_dispatch',
                status: 'succeeded',
                started_at: '2026-03-07T11:55:00Z',
                duration_ms: 250,
                error_message: null,
            }],
            running_jobs: [],
        };
        outboxData = {
            pending_count: 0,
            processing_count: 0,
            dead_letter_count: 0,
            oldest_pending_age_seconds: 42,
            last_dispatch_status: 'succeeded',
            last_dispatch_processed: 1,
            recent_failures: [],
        };
        getSystemStatsMock.mockResolvedValue({ active_users_24h: 3 });
    });

    it('renders units through Intl instead of hard-coded suffixes (GAP-D-17)', () => {
        renderPanel();

        expect(screen.getByText('health.latency: 8.00 ms')).toBeInTheDocument();
        expect(screen.getByText('128 MB')).toBeInTheDocument();
        expect(screen.getByText('1h 5m')).toBeInTheDocument();
        expect(screen.getByText('42 sec')).toBeInTheDocument();
        expect(screen.getByText('250 ms')).toBeInTheDocument();
    });

    it('translates job and outbox status codes with a humanized fallback', () => {
        renderPanel();

        // The stubbed `t` returns the humanized default, so the raw code never leaks.
        expect(screen.getAllByText('Succeeded').length).toBeGreaterThan(0);
        expect(screen.queryByText('succeeded')).not.toBeInTheDocument();
    });

    it('shows a retryable error instead of a false "Error" database card when the health query has no data (GAP-D-17)', () => {
        healthData = undefined;
        renderPanel();

        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(screen.queryByText('health.error')).not.toBeInTheDocument();
        expect(screen.queryByText('health.connected')).not.toBeInTheDocument();
        expect(screen.queryByText(/0h 0m/)).not.toBeInTheDocument();
        screen.getByRole('button', { name: /retry/i }).click();
        expect(refreshHealthMock).toHaveBeenCalledTimes(1);
    });
});

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSystemHealthMock = vi.fn();
const getSystemStatsMock = vi.fn();
const getSchedulerStatusMock = vi.fn();
const getOutboxStatusMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/hooks/useAdaptivePollingQuery', () => ({
    useAdaptivePollingQuery: ({ queryKey, queryFn }: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
        const key = String(queryKey[0]);
        if (key === 'adminHealth') {
            return {
                data: getSystemHealthMock(),
                isLoading: false,
                refresh: vi.fn(),
            };
        }
        if (key === 'adminSchedulerStatus') {
            return {
                data: getSchedulerStatusMock(),
                isLoading: false,
                refresh: vi.fn(),
            };
        }
        if (key === 'adminOutboxStatus') {
            return {
                data: getOutboxStatusMock(),
                isLoading: false,
                refresh: vi.fn(),
            };
        }
        return {
            data: undefined,
            isLoading: false,
            refresh: vi.fn(),
            queryFn,
        };
    },
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        getSystemHealth: (...args: unknown[]) => getSystemHealthMock(...args),
        getSystemStats: (...args: unknown[]) => getSystemStatsMock(...args),
        getSchedulerStatus: (...args: unknown[]) => getSchedulerStatusMock(...args),
        getOutboxStatus: (...args: unknown[]) => getOutboxStatusMock(...args),
    },
}));

import { HealthPanel } from '@/pages/admin-console/sections/AdminConsoleOpsPanels';

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('HealthPanel outbox status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getSystemHealthMock.mockReturnValue({
            database_status: 'connected',
            database_latency_ms: 8,
            uptime_seconds: 600,
            memory_usage_mb: 128,
            last_check: '2026-03-07T12:00:00Z',
        });
        getSchedulerStatusMock.mockReturnValue({
            process_role: 'scheduler',
            instance_id: 'scheduler-1',
            process_started_at: '2026-03-07T11:50:00Z',
            scheduler_enabled: true,
            scheduler_running: true,
            lock_provider: 'postgres_advisory',
            lock_acquired: true,
            current_owner_instance_id: 'scheduler-1',
            latest_runs: [],
            running_jobs: [],
        });
        getSystemStatsMock.mockResolvedValue({
            total_users: 10,
            active_users_24h: 3,
            total_risks: 4,
            total_controls: 5,
            total_kris: 2,
            pending_approvals: 1,
        });
        getOutboxStatusMock.mockReturnValue({
            pending_count: 2,
            processing_count: 1,
            dead_letter_count: 1,
            oldest_pending_age_seconds: 42,
            last_dispatch_started_at: '2026-03-07T11:59:50Z',
            last_dispatch_finished_at: '2026-03-07T11:59:55Z',
            last_dispatch_status: 'failed',
            last_dispatch_processed: 0,
            last_dispatch_error: 'network error',
            recent_failures: [
                {
                    id: 'evt-1',
                    event_type: 'approval.request_created',
                    status: 'dead_letter',
                    attempt_count: 10,
                    available_at: '2026-03-07T11:00:00Z',
                    created_at: '2026-03-07T10:59:00Z',
                    locked_by: 'scheduler-1',
                    last_error: 'network error',
                },
            ],
        });
    });

    it('renders outbox health metrics and recent failures', async () => {
        render(<HealthPanel />, { wrapper: createWrapper() });

        await waitFor(() => expect(getSystemStatsMock).toHaveBeenCalledTimes(1));
        expect(screen.getByText('health.outbox.title')).toBeInTheDocument();
        expect(screen.getByText('health.outbox.attention')).toBeInTheDocument();
        expect(screen.getByText('approval.request_created')).toBeInTheDocument();
        expect(screen.getByText(/health\.outbox\.attempts: 10/i)).toBeInTheDocument();
        expect(screen.getAllByText('network error')).toHaveLength(2);
    });
});

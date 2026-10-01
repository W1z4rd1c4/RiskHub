import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityLogEntries } from '@/components/activity-log/ActivityLogEntries';
import type { ActivityLogEntry } from '@/types/activityLog';

vi.mock('@/i18n/hooks', async () => {
    const formatters = await vi.importActual<typeof import('@/i18n/formatters')>('@/i18n/formatters');
    type FormatDate = Date | string | null | undefined;
    type FormatNumber = number | null | undefined;
    const format = {
        locale: 'en' as const,
        date: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatDateValue(value, 'en', options),
        dateTime: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatDateTimeValue(value, 'en', options),
        time: (value: FormatDate, options?: Intl.DateTimeFormatOptions) => formatters.formatTimeValue(value, 'en', options),
        relative: (value: FormatDate) => formatters.formatRelativeDateValue(value, 'en'),
        number: (value: FormatNumber, options?: Intl.NumberFormatOptions) => formatters.formatNumberValue(value, 'en', options),
        metric: (value: FormatNumber, unit?: string) => formatters.formatMetricNumberValue(value, 'en', unit),
        percent: (value: FormatNumber, fractionDigits?: number) => formatters.formatPercentValue(value, 'en', fractionDigits),
        currency: (value: FormatNumber, currency?: string) => formatters.formatCurrencyValue(value, 'en', currency),
        count: (count: number, key: string) => `${key}:${count}`,
    };
    return {
        useTranslation: () => ({
            t: (key: string, fallback?: string) => {
                const translations: Record<string, string> = {
                    'activity_log.select_risk': 'Select a risk to view activity.',
                    'activity_log.select_risk_hint': 'Choose a risk in the filter above to load entries.',
                };
                return translations[key] ?? fallback ?? key;
            },
            i18n: { language: 'en' },
        }),
        useFormat: () => format,
    };
});

function renderEntries(entries: ActivityLogEntry[]) {
    render(
        <ActivityLogEntries
            entries={entries}
            outcome={{ kind: 'content', isRefreshing: false }}
            needsRiskSelection={false}
            onRetry={() => {}}
        />
    );
}

describe('ActivityLogEntries', () => {
    it('does not quote generic entity labels', () => {
        renderEntries([
            {
                id: 1,
                entity_type: 'issue',
                entity_id: 42,
                entity_name: 'Issue',
                action: 'update',
                actor_id: 7,
                actor_name: 'Anna Kowalski',
                department_id: 3,
                changes: null,
                description: 'Sanitized entry',
                created_at: '2026-04-06T10:00:00Z',
            },
        ]);

        expect(screen.getByText('Anna Kowalski')).toBeInTheDocument();
        expect(screen.getByText('Sanitized entry')).toBeInTheDocument();
        expect(screen.queryByText('"Issue"')).not.toBeInTheDocument();
    });

    it('renders explicit safe entity labels when they differ from the entity type', () => {
        renderEntries([
            {
                id: 2,
                entity_type: 'risk',
                entity_id: 53,
                entity_name: 'R-AUD-053',
                action: 'update',
                actor_id: 8,
                actor_name: 'Risk Analyst',
                department_id: 5,
                changes: {
                    risk_id_code: { old: 'R-AUD-052', new: 'R-AUD-053' },
                },
                description: 'Updated Risk (fields: risk_id_code)',
                created_at: '2026-04-06T11:00:00Z',
            },
        ]);

        expect(screen.getAllByText('R-AUD-053')[0]).toBeInTheDocument();
        expect(screen.getByText('Updated Risk (fields: risk_id_code)')).toBeInTheDocument();
    });

    it('suppresses duplicate generic labels for mapped snake_case entity types', () => {
        renderEntries([
            {
                id: 3,
                entity_type: 'issue_exception',
                entity_id: 54,
                entity_name: 'Issue Exception',
                action: 'update',
                actor_id: 9,
                actor_name: 'Risk Analyst',
                department_id: 5,
                changes: null,
                description: 'Updated Issue Exception',
                created_at: '2026-04-06T12:00:00Z',
            },
        ]);

        expect(screen.getAllByText('Issue Exception')).toHaveLength(1);
    });

    it('suppresses duplicate generic labels for unmapped future snake_case entity types', () => {
        renderEntries([
            {
                id: 4,
                entity_type: 'future_entity_type',
                entity_id: 55,
                entity_name: 'Future Entity Type',
                action: 'create',
                actor_id: 10,
                actor_name: 'Ops Analyst',
                department_id: 6,
                changes: null,
                description: 'Created Future Entity Type',
                created_at: '2026-04-06T13:00:00Z',
            },
        ]);

        expect(screen.getAllByText('Future Entity Type')).toHaveLength(1);
    });

    it('shows the risk-selection empty state when by-risk mode has no selected risk', () => {
        render(
            <ActivityLogEntries
                entries={[]}
                outcome={{ kind: 'empty', isRefreshing: false }}
                needsRiskSelection
                onRetry={() => {}}
            />
        );

        expect(screen.getByText('Select a risk to view activity.')).toBeInTheDocument();
    });

    it('announces the first load through the shared loading state', () => {
        render(
            <ActivityLogEntries
                entries={[]}
                outcome={{ kind: 'initial-loading' }}
                onRetry={() => {}}
            />
        );

        expect(screen.getByRole('status')).toHaveTextContent('loading.activity_log');
    });

    it('renders access denied as an announced shared denied state', () => {
        render(
            <ActivityLogEntries
                entries={[]}
                outcome={{ kind: 'denied' }}
                onRetry={() => {}}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('access.denied_activity_log');
        expect(screen.getByRole('heading', { name: 'access.denied' })).toBeInTheDocument();
    });

    it('renders a load failure as an error with retry instead of an empty list', () => {
        const onRetry = vi.fn();
        render(
            <ActivityLogEntries
                entries={[]}
                outcome={{ kind: 'fatal-error', errorKey: 'errorKeys.server', isRetrying: false }}
                onRetry={onRetry}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('activity_log.failed_to_load');
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('keeps rows visible under a stale banner and marks the retry busy while retrying', () => {
        render(
            <ActivityLogEntries
                entries={[{
                    id: 9,
                    entity_type: 'risk',
                    entity_id: 1,
                    entity_name: 'R-1',
                    action: 'update',
                    actor_id: 1,
                    actor_name: 'Stale Actor',
                    department_id: 1,
                    changes: null,
                    description: 'Still visible',
                    created_at: '2026-04-06T10:00:00Z',
                }]}
                outcome={{ kind: 'stale-with-error', errorKey: 'errorKeys.server', isRetrying: true }}
                onRetry={() => {}}
            />
        );

        expect(screen.getByRole('alert')).toHaveTextContent('activity_log.may_be_out_of_date');
        expect(screen.getByText('Still visible')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'actions.retry' })).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByText('activity_log.retrying')).toBeInTheDocument();
    });

    it('renders the filtered-empty state as no results with a hint', () => {
        render(
            <ActivityLogEntries
                entries={[]}
                outcome={{ kind: 'empty', isRefreshing: false }}
                onRetry={() => {}}
            />
        );

        expect(screen.getByText('empty.no_activity_logs')).toBeInTheDocument();
        expect(screen.getByText('activity_log.try_adjusting_filters')).toBeInTheDocument();
    });
});

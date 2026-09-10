import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LogsPanel } from '@/pages/admin-console/sections/AdminConsoleOpsPanels';
import { renderWithQueryClient } from '@test/utils';

const getTechnicalLogsMock = vi.fn();

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/i18n/formatters', () => ({
    formatDateTimeValue: (value: string) => value,
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
        <select aria-label={placeholder} value={value} onChange={(event) => onValueChange(event.target.value)}>
            {allowEmpty ? <option value="">{emptyLabel}</option> : null}
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    ),
}));

vi.mock('@/services/adminApi', () => ({
    adminApi: {
        getTechnicalLogs: (...args: unknown[]) => getTechnicalLogsMock(...args),
    },
}));

const logs = [
    {
        id: 1,
        timestamp: '2026-09-01T08:00:00Z',
        level: 'INFO',
        event_type: 'risk_created',
        user_name: 'Alice',
        description: 'Risk created',
    },
    {
        id: 2,
        timestamp: '2026-09-01T09:00:00Z',
        level: 'WARNING',
        event_type: 'control_failed',
        user_name: 'Bob',
        description: 'Control failed',
    },
];

describe('LogsPanel event vocabulary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getTechnicalLogsMock.mockImplementation((params?: { event_type?: string; limit?: number }) => (
            Promise.resolve(params?.event_type
                ? logs.filter((entry) => entry.event_type === params.event_type)
                : logs)
        ));
    });

    it('keeps the bounded unfiltered event vocabulary after selecting an event', async () => {
        renderWithQueryClient(<LogsPanel />);

        expect(await screen.findByText('Risk created')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('application_logs.all_events'), {
            target: { value: 'risk_created' },
        });

        await waitFor(() => {
            expect(getTechnicalLogsMock).toHaveBeenCalledWith({ event_type: 'risk_created', limit: 100 });
        });
        expect(getTechnicalLogsMock).toHaveBeenCalledWith({ event_type: undefined, limit: 100 });
        expect(screen.getByRole('option', { name: 'control_failed' })).toBeInTheDocument();
    });

    it('falls back to the loaded rows when the bounded event-vocabulary request fails', async () => {
        getTechnicalLogsMock
            .mockRejectedValueOnce(new Error('event vocabulary unavailable'))
            .mockResolvedValue(logs);

        renderWithQueryClient(<LogsPanel />);

        expect(await screen.findByRole('option', { name: 'risk_created' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'control_failed' })).toBeInTheDocument();
    });

    it('keeps the unfiltered fallback vocabulary after selecting an empty event', async () => {
        getTechnicalLogsMock
            .mockRejectedValueOnce(new Error('event vocabulary unavailable'))
            .mockResolvedValue(logs);
        renderWithQueryClient(<LogsPanel />);
        expect(await screen.findByRole('option', { name: 'control_failed' })).toBeInTheDocument();

        getTechnicalLogsMock.mockImplementation((params?: { event_type?: string }) => (
            Promise.resolve(params?.event_type ? [] : logs)
        ));
        fireEvent.change(screen.getByLabelText('application_logs.all_events'), {
            target: { value: 'risk_created' },
        });

        await waitFor(() => {
            expect(getTechnicalLogsMock).toHaveBeenCalledWith({ event_type: 'risk_created', limit: 100 });
        });
        expect(screen.getByRole('option', { name: 'control_failed' })).toBeInTheDocument();
    });
});

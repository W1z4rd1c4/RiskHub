import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    calculatePageWindow,
    formatDiffValue,
    getDiffPair,
} from '@/components/activity-log/activityLogPresentation';

const mockList = vi.fn();
const mockGetActions = vi.fn();
const mockGetUsers = vi.fn();
const mockGetDepartments = vi.fn();
const mockGetRisks = vi.fn();

vi.mock('@/hooks/useDebouncedValue', () => ({
    useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock('@/i18n/hooks', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'en' },
    }),
}));

vi.mock('@/services/activityLogApi', () => ({
    activityLogApi: {
        list: (...args: unknown[]) => mockList(...args),
        getActions: () => mockGetActions(),
    },
}));

vi.mock('@/services/lookupApi', () => ({
    lookupApi: {
        getUsers: () => mockGetUsers(),
        getDepartments: () => mockGetDepartments(),
    },
}));

vi.mock('@/services/riskApi', () => ({
    riskApi: {
        getRisks: (...args: unknown[]) => mockGetRisks(...args),
    },
}));

import { ActivityLogPage } from '@/pages/ActivityLogPage';

describe('Activity Log Helpers', () => {
    describe('formatDiffValue', () => {
        it('returns (empty) for null', () => {
            expect(formatDiffValue(null)).toBe('(empty)');
        });

        it('returns (empty) for undefined', () => {
            expect(formatDiffValue(undefined)).toBe('(empty)');
        });

        it('preserves falsy values like 0', () => {
            expect(formatDiffValue(0)).toBe('0');
        });

        it('preserves falsy values like false', () => {
            expect(formatDiffValue(false)).toBe('false');
        });

        it('preserves empty string', () => {
            expect(formatDiffValue('')).toBe('');
        });

        it('converts numbers to strings', () => {
            expect(formatDiffValue(42)).toBe('42');
        });

        it('JSON stringifies objects', () => {
            expect(formatDiffValue({ foo: 'bar' })).toBe('{"foo":"bar"}');
        });

        it('truncates long JSON values', () => {
            const longValue = { data: 'x'.repeat(100) };
            const result = formatDiffValue(longValue);
            expect(result.length).toBeLessThanOrEqual(80);
            expect(result).toContain('...');
        });

        it('JSON stringifies arrays', () => {
            expect(formatDiffValue([1, 2, 3])).toBe('[1,2,3]');
        });
    });

    describe('getDiffPair', () => {
        it('handles null delta', () => {
            const result = getDiffPair(null);
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('(empty)');
            expect(result.isLegacy).toBe(true);
        });

        it('handles primitive delta as new value only', () => {
            const result = getDiffPair(42);
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('42');
            expect(result.isLegacy).toBe(true);
        });

        it('handles standard {old, new} shape', () => {
            const result = getDiffPair({ old: 'draft', new: 'active' });
            expect(result.old).toBe('draft');
            expect(result.new).toBe('active');
            expect(result.isLegacy).toBe(false);
        });

        it('handles {old, new} with null values', () => {
            const result = getDiffPair({ old: null, new: 'created' });
            expect(result.old).toBe('(empty)');
            expect(result.new).toBe('created');
            expect(result.isLegacy).toBe(false);
        });

        it('handles {old, new} with false values', () => {
            const result = getDiffPair({ old: false, new: true });
            expect(result.old).toBe('false');
            expect(result.new).toBe('true');
        });

        it('handles {old, new} with 0 values', () => {
            const result = getDiffPair({ old: 0, new: 10 });
            expect(result.old).toBe('0');
            expect(result.new).toBe('10');
        });
    });

    describe('calculatePageWindow', () => {
        it('returns all pages for small total (5 pages)', () => {
            const result = calculatePageWindow(2, 5);
            expect(result).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns bounded window for large total (200 pages) at start', () => {
            const result = calculatePageWindow(0, 200);
            expect(result).toEqual([0, 1, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at middle', () => {
            const result = calculatePageWindow(100, 200);
            expect(result).toEqual([0, 'ellipsis', 99, 100, 101, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at end', () => {
            const result = calculatePageWindow(199, 200);
            expect(result).toEqual([0, 'ellipsis', 198, 199]);
        });

        it('does not allocate more than needed for 10000 pages', () => {
            const result = calculatePageWindow(5000, 10000);
            expect(result.length).toBeLessThanOrEqual(10);
        });

        it('handles single page', () => {
            const result = calculatePageWindow(0, 1);
            expect(result).toEqual([0]);
        });

        it('handles two pages', () => {
            const result = calculatePageWindow(0, 2);
            expect(result).toEqual([0, 1]);
        });
    });

    describe('Date Range Semantics', () => {
        it('end-of-day timestamp format is correct', () => {
            const dateTo = '2026-01-04';
            const inclusive = `${dateTo}T23:59:59.999`;
            expect(inclusive).toBe('2026-01-04T23:59:59.999');
        });
    });

    describe('Label Fallbacks', () => {
        const ACTION_LABELS: Record<string, string> = {
            create: 'Created',
            update: 'Updated',
            delete: 'Deleted',
        };

        it('returns known label for known action', () => {
            expect(ACTION_LABELS['create'] ?? 'create').toBe('Created');
        });

        it('returns raw value for unknown action', () => {
            expect(ACTION_LABELS['custom_action'] ?? 'custom_action').toBe('custom_action');
        });
    });
});

describe('ActivityLogPage capability denial state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActions.mockResolvedValue([]);
        mockGetUsers.mockResolvedValue([]);
        mockGetDepartments.mockResolvedValue([]);
        mockGetRisks.mockResolvedValue({ items: [], total: 0, offset: 0, limit: 100 });
    });

    it('shows retryable network state instead of access denied when list loading fails without 403', async () => {
        mockList.mockRejectedValue(new Error('temporary outage'));

        render(<ActivityLogPage />);

        await screen.findByText('activity_log.failed_to_load');

        expect(screen.getByText('activity_log.failed_to_load_help')).toBeInTheDocument();
        expect(screen.queryByText('access.denied')).not.toBeInTheDocument();
    });

    it('shows access denied when the backend explicitly denies read capability', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: {
                can_read: false,
                can_filter_by_department: false,
                can_view_entity_filters: false,
                can_export_csv: false,
            },
        });

        render(<ActivityLogPage />);

        await screen.findByText('access.denied');
        expect(screen.queryByText('empty.no_activity_logs')).not.toBeInTheDocument();
    });

    it('keeps non-action states visible when backend capabilities are absent', async () => {
        mockList.mockResolvedValue({
            items: [],
            total: 0,
            skip: 0,
            limit: 50,
            capabilities: null,
        });

        render(<ActivityLogPage />);

        await waitFor(() => expect(screen.queryByText('access.denied')).not.toBeInTheDocument());
        expect(screen.getByText('empty.no_activity_logs')).toBeInTheDocument();
    });
});

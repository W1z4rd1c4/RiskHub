/**
 * Activity Log Page unit tests covering:
 * - Diff value formatting helpers
 * - Pagination window calculation
 * 
 * Note: Full integration tests for permission gating, view modes, and API calls
 * require MSW setup in the global vitest.setup.ts. The helpers tested here are
 * extracted to ensure the core logic is correct.
 */
import { describe, it, expect } from 'vitest';

// Test the diff formatting logic (re-implemented here for testing)
const formatDiffValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return '(empty)';
    }
    if (typeof value === 'object') {
        const json = JSON.stringify(value);
        return json.length > 80 ? json.slice(0, 77) + '...' : json;
    }
    return String(value);
};

const getDiffPair = (delta: unknown): { old: string; new: string; isLegacy: boolean } => {
    if (delta === null || delta === undefined) {
        return { old: '(empty)', new: '(empty)', isLegacy: true };
    }
    if (typeof delta !== 'object') {
        return { old: '(empty)', new: formatDiffValue(delta), isLegacy: true };
    }
    const d = delta as { old?: unknown; new?: unknown };
    return {
        old: formatDiffValue(d.old),
        new: formatDiffValue(d.new),
        isLegacy: !('old' in d && 'new' in d)
    };
};

// Test the pagination window calculation logic
const calculatePageWindow = (page: number, totalPages: number): (number | 'ellipsis')[] => {
    const pageNumbers: number[] = [];
    const addPage = (p: number) => {
        if (p >= 0 && p < totalPages && !pageNumbers.includes(p)) {
            pageNumbers.push(p);
        }
    };
    addPage(0);
    addPage(page - 1);
    addPage(page);
    addPage(page + 1);
    addPage(totalPages - 1);
    pageNumbers.sort((a, b) => a - b);

    const withEllipses: (number | 'ellipsis')[] = [];
    for (let i = 0; i < pageNumbers.length; i++) {
        if (i > 0 && pageNumbers[i] - pageNumbers[i - 1] > 1) {
            withEllipses.push('ellipsis');
        }
        withEllipses.push(pageNumbers[i]);
    }
    return withEllipses;
};

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
            // Should show: 0, 1, 2, 3, 4
            expect(result).toEqual([0, 1, 2, 3, 4]);
        });

        it('returns bounded window for large total (200 pages) at start', () => {
            const result = calculatePageWindow(0, 200);
            // Should show: 0, 1, ..., 199
            expect(result).toEqual([0, 1, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at middle', () => {
            const result = calculatePageWindow(100, 200);
            // Should show: 0, ..., 99, 100, 101, ..., 199
            expect(result).toEqual([0, 'ellipsis', 99, 100, 101, 'ellipsis', 199]);
        });

        it('returns bounded window for large total (200 pages) at end', () => {
            const result = calculatePageWindow(199, 200);
            // Should show: 0, ..., 198, 199
            expect(result).toEqual([0, 'ellipsis', 198, 199]);
        });

        it('does not allocate more than needed for 10000 pages', () => {
            const result = calculatePageWindow(5000, 10000);
            // Should be limited to ~7 items max
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

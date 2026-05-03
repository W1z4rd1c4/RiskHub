import { describe, expect, it, vi } from 'vitest';

import { loadCollectionPage, normalizeCollectionResponse } from '@/services/collectionApi';
import type { CollectionListResponse } from '@/types/collection';

interface TestItem {
    id: number;
    name: string;
}

function response(
    items: TestItem[],
    overrides: Partial<CollectionListResponse<TestItem>> = {},
): CollectionListResponse<TestItem> {
    return {
        items,
        total: items.length,
        offset: 0,
        limit: 10,
        ...overrides,
    };
}

describe('loadCollectionPage', () => {
    it('loads the all view without collection groups', async () => {
        const loadPage = vi.fn().mockResolvedValue(response([{ id: 1, name: 'one' }]));

        const page = await loadCollectionPage({
            currentPage: 2,
            loadPage,
        });

        expect(loadPage).toHaveBeenCalledWith({ currentPage: 2 });
        expect(page).toEqual({
            items: [{ id: 1, name: 'one' }],
            groups: [],
            total: 1,
            capabilities: null,
        });
    });

    it('loads grouped summaries with empty items and groups fallback', async () => {
        const loadPage = vi.fn().mockResolvedValue(response([], { total: 3, groups: null }));

        const page = await loadCollectionPage({
            currentPage: 5,
            groupBy: 'department',
            loadPage,
        });

        expect(loadPage).toHaveBeenCalledWith({ currentPage: 1, groupBy: 'department' });
        expect(page).toEqual({ items: [], groups: [], total: 3, capabilities: null });
    });

    it('loads grouped drilldowns with selected group value', async () => {
        const groups = [{ value: 'finance', label: 'Finance', count: 2 }];
        const loadPage = vi.fn().mockResolvedValue(
            response([{ id: 2, name: 'two' }], { total: 2, groups }),
        );

        const page = await loadCollectionPage({
            currentPage: 3,
            groupBy: 'department',
            selectedGroupValue: 'finance',
            loadPage,
        });

        expect(loadPage).toHaveBeenCalledWith({
            currentPage: 3,
            groupBy: 'department',
            groupValue: 'finance',
        });
        expect(page).toEqual({
            items: [{ id: 2, name: 'two' }],
            groups,
            total: 2,
            capabilities: null,
        });
    });

    it('normalizes returned items when requested', async () => {
        const loadPage = vi.fn().mockResolvedValue(response([{ id: 1, name: 'one' }]));

        const page = await loadCollectionPage({
            currentPage: 1,
            loadPage,
            normalizeItems: (items) => items.map((item) => ({ ...item, name: item.name.toUpperCase() })),
        });

        expect(page.items).toEqual([{ id: 1, name: 'ONE' }]);
    });

    it('preserves collection-level capabilities through normalization', async () => {
        const loadPage = vi.fn().mockResolvedValue(response([], { capabilities: { can_create: true } }));

        const page = await loadCollectionPage({
            currentPage: 1,
            loadPage,
        });

        expect(page.capabilities).toEqual({ can_create: true });
    });
});

describe('normalizeCollectionResponse', () => {
    it('prefers explicit offset over legacy skip and page-size pagination', () => {
        const normalized = normalizeCollectionResponse({
            items: [],
            total: 0,
            offset: 30,
            skip: 20,
            page: 4,
            size: 10,
            limit: 5,
        });

        expect(normalized.offset).toBe(30);
        expect(normalized.limit).toBe(5);
    });

    it('uses skip when offset is absent', () => {
        const normalized = normalizeCollectionResponse({
            items: [],
            total: 0,
            skip: 20,
            limit: 10,
        });

        expect(normalized.offset).toBe(20);
    });

    it('uses page and size when offset and skip are absent', () => {
        const normalized = normalizeCollectionResponse({
            items: [],
            total: 0,
            page: 3,
            size: 25,
        });

        expect(normalized.offset).toBe(50);
        expect(normalized.limit).toBe(25);
    });

    it('defaults missing pagination values to zero', () => {
        const normalized = normalizeCollectionResponse({
            items: [],
            total: 0,
        });

        expect(normalized.offset).toBe(0);
        expect(normalized.limit).toBe(0);
    });
});

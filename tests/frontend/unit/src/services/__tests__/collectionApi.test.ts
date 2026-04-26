import { describe, expect, it, vi } from 'vitest';

import { loadCollectionPage } from '@/services/collectionApi';
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

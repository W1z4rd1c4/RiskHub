import { describe, expect, expectTypeOf, it } from 'vitest';

import { normalizeCollectionResponse } from '@/services/collectionApi';

describe('normalizeCollectionResponse', () => {
    it('accepts legacy pagination while guaranteeing canonical output types', () => {
        const normalized = normalizeCollectionResponse({ items: [{ id: 1 }], total: 1, skip: 2, size: 5 });
        expectTypeOf(normalized.offset).toEqualTypeOf<number>();
        expectTypeOf(normalized.limit).toEqualTypeOf<number>();
        expectTypeOf(normalized.items).toEqualTypeOf<{ id: number }[]>();
        expectTypeOf<{ items: []; total: string }>().not.toExtend<Parameters<typeof normalizeCollectionResponse>[0]>();
        expectTypeOf<{ items: []; total: number; offset: string }>().not.toExtend<Parameters<typeof normalizeCollectionResponse>[0]>();
        expect(normalized).toMatchObject({ offset: 2, limit: 5 });
    });
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

import { describe, expect, it } from 'vitest';

import { normalizeCollectionResponse } from '@/services/collectionApi';

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

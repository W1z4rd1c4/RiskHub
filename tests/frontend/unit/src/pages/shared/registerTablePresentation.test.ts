import { describe, expect, it } from 'vitest';

import { buildRegisterTableModel } from '@/pages/shared/registerTablePresentation';
import type { CollectionGroup } from '@/types/collection';

interface TestRow {
    id: number;
    name: string;
}

describe('register table presentation', () => {
    it('builds safe table models for loading, empty, and grouped states', () => {
        const groups: CollectionGroup[] = [
            {
                value: '42',
                label: '',
                count: 2,
                active_count: 1,
                highlighted_count: 0,
            },
        ];

        const model = buildRegisterTableModel<TestRow>({
            emptyText: 'No rows',
            groups,
            groupPresentation: {
                fallbackLabel: 'Unknown owner',
            },
            isLoading: false,
            rows: [],
            rowKey: (row) => row.id,
        });

        expect(model).toMatchObject({
            emptyText: 'No rows',
            isEmpty: true,
            isLoading: false,
            rowKeys: [],
        });
        expect(model.groupCards[0]).toMatchObject({
            label: 'Unknown owner',
            showActive: true,
            showHighlighted: false,
            value: '42',
        });
    });
});

import { describe, expect, it } from 'vitest';

import { buildRegisterGroupCards } from '@/components/tables/registerGroupPresentation';
import type { CollectionGroup } from '@/types/collection';

describe('register group presentation', () => {
    it('builds safe card labels and display flags from backend groups', () => {
        const groups: CollectionGroup[] = [
            {
                value: '5',
                label: '',
                count: 3,
                active_count: 2,
                highlighted_count: 1,
            },
            {
                value: 'medium',
                label: 'Medium',
                count: 4,
                active_count: null,
                highlighted_count: 0,
            },
        ];

        const cards = buildRegisterGroupCards(groups, {
            fallbackLabel: 'Unknown group',
        });

        expect(cards[0]).toMatchObject({
            value: '5',
            label: 'Unknown group',
            showActive: true,
            showHighlighted: true,
        });
        expect(cards[1]).toMatchObject({
            value: 'medium',
            label: 'Medium',
            showActive: false,
            showHighlighted: false,
        });
    });

    it('honors entity label resolvers and hide flags', () => {
        const groups: CollectionGroup[] = [
            {
                value: 'overdue',
                label: 'Overdue',
                count: 2,
                active_count: 2,
                highlighted_count: 2,
            },
        ];

        const cards = buildRegisterGroupCards(groups, {
            groupLabel: (group) => `Status: ${group.label}`,
            hideActive: true,
            hideHighlighted: true,
        });

        expect(cards[0]).toMatchObject({
            label: 'Status: Overdue',
            showActive: false,
            showHighlighted: false,
        });
    });
});

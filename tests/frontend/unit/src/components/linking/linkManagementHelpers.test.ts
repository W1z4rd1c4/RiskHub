import { describe, expect, it } from 'vitest';

import { buildLinkedTargetIdSet } from '@/components/linking/linkManagementState';
import {
    buildExistingLinkPresentation,
    buildLinkSearchResultPresentation,
} from '@/components/linking/linkManagementPresentation';

const t = (key: string) => key;

describe('link management helpers', () => {
    it('builds linked target state and safe presentation models', () => {
        const linkedIds = buildLinkedTargetIdSet(
            [
                { id: 1, control_id: 11, effectiveness: 'high' },
                { id: 2, control_id: 12, effectiveness: 'medium' },
            ],
            'risk-to-control',
        );

        expect([...linkedIds]).toEqual([11, 12]);

        const archivedDenied = buildLinkSearchResultPresentation(
            'risk-to-control',
            {
                id: 99,
                name: 'Archived control',
                status: 'archived',
                capabilities: { can_restore: false },
            },
            t,
        );

        expect(archivedDenied).toMatchObject({
            canUnarchive: false,
            isArchived: true,
            title: 'Archived control',
            unarchiveLabel: 'actions.unarchive',
        });

        const existing = buildExistingLinkPresentation(
            { id: 3, control_id: 13, effectiveness: 'linked' },
            'risk-to-control',
            t,
        );

        expect(existing).toMatchObject({
            displayName: 'common:labels.unknown',
            targetId: 13,
        });
    });
});

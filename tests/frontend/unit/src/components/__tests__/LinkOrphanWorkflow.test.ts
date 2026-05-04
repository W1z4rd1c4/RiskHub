import { describe, expect, it } from 'vitest';

import {
    resetLinkPaginationOnSearch,
    resolveLinkActionOutcome,
} from '@/components/linking/linkManagementState';
import {
    buildOrphanResolutionLabel,
    resolveOrphanStaleTarget,
} from '@/components/governance/orphanResolutionState';

describe('link and orphan workflow helpers', () => {
    it('resets link pagination when search criteria changes', () => {
        expect(resetLinkPaginationOnSearch({ page: 4 })).toEqual({ page: 1 });
    });

    it('keeps failed unlink dialogs open', () => {
        expect(resolveLinkActionOutcome({ action: 'unlink', ok: false })).toEqual({
            shouldClose: false,
            shouldRefresh: false,
        });
    });

    it('uses safe orphan labels and stale-target facts', () => {
        expect(buildOrphanResolutionLabel(null, 'user')).toBe('Unknown user');
        expect(resolveOrphanStaleTarget({ stale: true })).toEqual({
            canSubmit: false,
            errorKey: 'orphaned_items.errors.stale_target',
        });
    });
});

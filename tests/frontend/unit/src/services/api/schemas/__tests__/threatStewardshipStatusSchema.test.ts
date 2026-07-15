import { describe, expect, it } from 'vitest';

import { threatSchema } from '@/services/api/schemas';

function threatPayload(stewardshipStatus?: string) {
    return {
        id: 73,
        name: 'Ransomware',
        ...(stewardshipStatus === undefined ? {} : { stewardship_status: stewardshipStatus }),
        is_archived: false,
        created_at: '2026-07-15T10:00:00Z',
        updated_at: '2026-07-15T10:00:00Z',
    };
}

describe('threatSchema stewardship status', () => {
    it.each([
        'assigned',
        'legacy_unassigned',
        'pending_governance',
        'invalid_assignment',
    ])('accepts the backend status %s', (status) => {
        expect(threatSchema.parse(threatPayload(status)).stewardship_status).toBe(status);
    });

    it('defaults legacy responses to assigned without treating them as a Governance orphan', () => {
        expect(threatSchema.parse(threatPayload()).stewardship_status).toBe('assigned');
    });

    it('rejects an unknown status instead of guessing a workflow', () => {
        expect(threatSchema.safeParse(threatPayload('unknown')).success).toBe(false);
    });
});

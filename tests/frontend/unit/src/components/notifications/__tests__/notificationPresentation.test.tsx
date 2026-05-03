import { describe, expect, it } from 'vitest';

import {
    buildNotificationPresentation,
    getNotificationPath,
} from '@/components/notifications/notificationPresentation';
import type { Notification } from '@/types/notification';

function notification(overrides: Partial<Notification>): Notification {
    return {
        id: 1,
        type: 'issue_assigned',
        title: 'Assigned issue',
        message: 'Issue assigned',
        resource_type: 'issue',
        resource_id: 77,
        is_read: false,
        created_at: '2026-04-01T00:00:00Z',
        expires_at: null,
        ...overrides,
    };
}

describe('notificationPresentation', () => {
    it('builds the same path and icon model for issue, vendor, approval, and unsupported notifications', () => {
        const cases = [
            { notification: notification({ type: 'issue_assigned', resource_type: 'issue', resource_id: 77 }), path: '/issues/77', icon: 'bell' },
            { notification: notification({ type: 'kri_overdue', resource_type: 'vendor', resource_id: 9 }), path: '/vendors/9', icon: 'alert-circle' },
            { notification: notification({ type: 'approval_pending', resource_type: 'approval', resource_id: 5 }), path: '/approvals', icon: 'clock' },
            { notification: notification({ type: 'kri_near_breach', resource_type: 'unsupported', resource_id: 3 }), path: null, icon: 'alert-triangle' },
        ];

        for (const entry of cases) {
            const model = buildNotificationPresentation(entry.notification);
            expect(model.path).toBe(entry.path);
            expect(model.iconToken).toBe(entry.icon);
            expect(getNotificationPath(entry.notification)).toBe(entry.path);
        }
    });
});

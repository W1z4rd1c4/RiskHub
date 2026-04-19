import type { Notification } from '@/types/notification';
import { buildVendorDetailPath } from '@/pages/vendors/vendorDetailPresentation';

export function getNotificationResourcePath(resourceType?: string | null, resourceId?: number | null): string | null {
    if (!resourceType || !resourceId) return null;

    switch (resourceType) {
        case 'risk':
            return `/risks/${resourceId}`;
        case 'control':
            return `/controls/${resourceId}`;
        case 'kri':
            return `/kris/${resourceId}`;
        case 'issue':
            return `/issues/${resourceId}`;
        case 'vendor':
            return buildVendorDetailPath(resourceId);
        case 'approval':
            return '/approvals';
        default:
            return null;
    }
}

export function getNotificationPath(notification: Notification): string | null {
    return getNotificationResourcePath(notification.resource_type, notification.resource_id);
}

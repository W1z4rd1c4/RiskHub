import { AlertCircle, AlertTriangle, Bell, CheckCircle, Clock } from 'lucide-react';

import { buildVendorDetailPath } from '@/pages/vendors/vendorDetailPresentation';
import type { Notification, NotificationType } from '@/types/notification';

export type NotificationIconToken = 'alert-circle' | 'alert-triangle' | 'bell' | 'check-circle' | 'clock';
export type NotificationTone = 'amber' | 'emerald' | 'orange' | 'rose' | 'rose-strong' | 'sky' | 'slate';

export type NotificationPresentationModel = {
    iconToken: NotificationIconToken;
    tone: NotificationTone;
    path: string | null;
    title: string;
    message: string;
    date: string;
    isRead: boolean;
};

export const notificationTypePresentation: Record<NotificationType, { iconToken: NotificationIconToken; tone: NotificationTone }> = {
    approval_cancelled: { iconToken: 'alert-triangle', tone: 'orange' },
    approval_pending: { iconToken: 'clock', tone: 'amber' },
    approval_resolved: { iconToken: 'check-circle', tone: 'emerald' },
    issue_assigned: { iconToken: 'bell', tone: 'sky' },
    issue_due_soon: { iconToken: 'clock', tone: 'amber' },
    issue_exception_approved: { iconToken: 'check-circle', tone: 'emerald' },
    issue_exception_requested: { iconToken: 'alert-triangle', tone: 'orange' },
    issue_overdue: { iconToken: 'alert-circle', tone: 'rose' },
    kri_breach_detected: { iconToken: 'alert-circle', tone: 'rose-strong' },
    kri_due_soon: { iconToken: 'clock', tone: 'amber' },
    kri_due_tomorrow: { iconToken: 'clock', tone: 'amber' },
    kri_near_breach: { iconToken: 'alert-triangle', tone: 'orange' },
    kri_overdue: { iconToken: 'alert-circle', tone: 'rose' },
    questionnaire_clarification_requested: { iconToken: 'alert-triangle', tone: 'orange' },
    questionnaire_due_soon: { iconToken: 'clock', tone: 'amber' },
    questionnaire_overdue: { iconToken: 'alert-circle', tone: 'rose' },
    questionnaire_sent: { iconToken: 'clock', tone: 'amber' },
    questionnaire_submitted: { iconToken: 'check-circle', tone: 'emerald' },
};

export function getNotificationResourcePath(resourceType?: string | null, resourceId?: number | null): string | null {
    if (!resourceType || !resourceId) {
        return null;
    }

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

export function buildNotificationPresentation(notification: Notification): NotificationPresentationModel {
    const presentation = notificationTypePresentation[notification.type] ?? {
        iconToken: 'bell' as const,
        tone: 'slate' as const,
    };
    return {
        ...presentation,
        date: notification.created_at,
        isRead: notification.is_read,
        message: notification.message,
        path: getNotificationPath(notification),
        title: notification.title,
    };
}

function toneClassName(tone: NotificationTone): string {
    switch (tone) {
        case 'amber':
            return 'text-amber-400';
        case 'emerald':
            return 'text-emerald-400';
        case 'orange':
            return 'text-orange-400';
        case 'rose':
            return 'text-rose-400';
        case 'rose-strong':
            return 'text-rose-500';
        case 'sky':
            return 'text-sky-400';
        case 'slate':
            return 'text-slate-400';
    }
}

export function NotificationPresentationIcon({
    model,
    size = 'md',
}: {
    model: Pick<NotificationPresentationModel, 'iconToken' | 'tone'>;
    size?: 'sm' | 'md';
}) {
    const sizeClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
    const className = `${sizeClass} ${toneClassName(model.tone)}`;

    switch (model.iconToken) {
        case 'alert-circle':
            return <AlertCircle className={className} />;
        case 'alert-triangle':
            return <AlertTriangle className={className} />;
        case 'check-circle':
            return <CheckCircle className={className} />;
        case 'clock':
            return <Clock className={className} />;
        case 'bell':
            return <Bell className={className} />;
    }
}

/**
 * Notification types for in-app notifications.
 */

export type NotificationType =
    | 'approval_pending'
    | 'approval_resolved'
    | 'kri_due_soon'
    | 'kri_due_tomorrow'
    | 'kri_overdue'
    | 'kri_near_breach'
    | 'kri_breach_detected';

export interface Notification {
    id: number;
    type: NotificationType;
    title: string;
    message: string;
    resource_type?: string;
    resource_id?: number;
    is_read: boolean;
    created_at: string;
    expires_at?: string;
}

export interface NotificationListResponse {
    items: Notification[];
    total: number;
    skip: number;
    limit: number;
    unread_count: number;
}

export interface NotificationQueryParams {
    skip?: number;
    limit?: number;
    unread_only?: boolean;
}

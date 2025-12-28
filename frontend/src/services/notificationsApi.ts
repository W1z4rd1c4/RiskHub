import { apiClient } from './apiClient';
import type { NotificationListResponse, NotificationQueryParams } from '../types/notification';

export const notificationsApi = {
    /**
     * List notifications for current user.
     */
    list: (params?: NotificationQueryParams) =>
        apiClient.get<NotificationListResponse>('/notifications', { params: params as Record<string, string | number | boolean | undefined> }),

    /**
     * Get unread notification count for badge.
     */
    getUnreadCount: () =>
        apiClient.get<{ count: number }>('/notifications/unread/count'),

    /**
     * Mark a single notification as read.
     */
    markAsRead: (id: number) =>
        apiClient.post<void>(`/notifications/${id}/read`, {}),

    /**
     * Mark all notifications as read.
     */
    markAllAsRead: () =>
        apiClient.post<void>('/notifications/read-all', {}),
};

import { apiClient } from './apiClient';
import type { NotificationListResponse, NotificationQueryParams, NotificationPreferences, NotificationPreferencesUpdate } from '../types/notification';

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

    /**
     * Get current user's notification preferences.
     */
    getPreferences: () =>
        apiClient.get<NotificationPreferences>('/notifications/preferences'),

    /**
     * Update current user's notification preferences.
     */
    updatePreferences: (updates: NotificationPreferencesUpdate) =>
        apiClient.put<NotificationPreferences>('/notifications/preferences', updates),
};


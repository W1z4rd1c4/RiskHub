import { apiClient } from './apiClient';
import {
    notificationCountSchema,
    notificationListResponseSchema,
    notificationPreferencesSchema,
    notificationUnreadCountSchema,
    voidSchema,
} from '@/services/api/schemas';
import type { NotificationQueryParams, NotificationPreferencesUpdate } from '../types/notification';

export const notificationsApi = {
    /**
     * List notifications for current user.
     */
    list: (params?: NotificationQueryParams) =>
        apiClient.get('/notifications', {
            params: params as Record<string, string | number | boolean | undefined>,
            schema: notificationListResponseSchema,
        }),

    /**
     * Get unread notification count for badge.
     */
    getUnreadCount: () =>
        apiClient.get('/notifications/unread/count', { schema: notificationCountSchema }),

    /**
     * Mark a single notification as read.
     * Returns the updated unread count for UI sync.
     */
    markAsRead: (id: number) =>
        apiClient.post(`/notifications/${id}/read`, {}, { schema: notificationUnreadCountSchema }),

    /**
     * Mark all notifications as read.
     */
    markAllAsRead: () =>
        apiClient.post('/notifications/read-all', {}, { schema: voidSchema }),

    /**
     * Get current user's notification preferences.
     */
    getPreferences: () =>
        apiClient.get('/notifications/preferences', { schema: notificationPreferencesSchema }),

    /**
     * Update current user's notification preferences.
     */
    updatePreferences: (updates: NotificationPreferencesUpdate) =>
        apiClient.put('/notifications/preferences', updates, {
            schema: notificationPreferencesSchema,
        }),
};

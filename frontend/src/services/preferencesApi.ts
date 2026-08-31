import { apiClient } from './apiClient';
import { userPreferencesSchema } from '@/services/api/schemas';

export interface UserPreferences {
    theme: 'light' | 'dark' | 'riskhub';
    language: 'en' | 'cs';
}

export interface PreferencesUpdate {
    theme?: 'light' | 'dark' | 'riskhub';
    language?: 'en' | 'cs';
}

export const preferencesApi = {
    /**
     * Get current user's preferences
     */
    async get(options: { signal?: AbortSignal } = {}): Promise<UserPreferences> {
        return apiClient.get('/preferences', { schema: userPreferencesSchema, ...options });
    },

    /**
     * Update current user's preferences
     */
    async update(
        prefs: PreferencesUpdate,
        options: { signal?: AbortSignal } = {},
    ): Promise<UserPreferences> {
        return apiClient.put('/preferences', prefs, { schema: userPreferencesSchema, ...options });
    },
};

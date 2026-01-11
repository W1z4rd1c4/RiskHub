import { apiClient } from './apiClient';

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
    async get(): Promise<UserPreferences> {
        return apiClient.get('/preferences');
    },

    /**
     * Update current user's preferences
     */
    async update(prefs: PreferencesUpdate): Promise<UserPreferences> {
        return apiClient.put('/preferences', prefs);
    },
};

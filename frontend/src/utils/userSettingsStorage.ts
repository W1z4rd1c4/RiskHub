/**
 * User settings storage utilities with server sync.
 * 
 * Strategy:
 * - On save: Update local immediately (responsive UI), then sync to server
 * - On login: Fetch from server and update local
 * - On logout: Clear local (guest state)
 */
import { preferencesApi, type UserPreferences, type PreferencesUpdate } from '@/services/preferencesApi';
import i18n from '@/i18n';

export const THEME_KEY = 'riskhub-theme';
export const LANGUAGE_KEY = 'riskhub-language';

// ============================================================================
// Local Storage Helpers (for immediate UI response)
// ============================================================================

export function getLocalTheme(): string {
    if (typeof window === 'undefined') return 'riskhub';
    return localStorage.getItem(THEME_KEY) || 'riskhub';
}

export function setLocalTheme(theme: string): void {
    localStorage.setItem(THEME_KEY, theme);
}

export function getLocalLanguage(): string {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem(LANGUAGE_KEY) || 'en';
}

export function setLocalLanguage(lang: string): void {
    localStorage.setItem(LANGUAGE_KEY, lang);
}

// ============================================================================
// Server Sync Helpers
// ============================================================================

/**
 * Fetch preferences from server and update local storage + i18n.
 * Called on login and page refresh.
 */
export async function syncPreferencesFromServer(): Promise<UserPreferences> {
    const prefs = await preferencesApi.get();

    // Update local cache with server values
    setLocalTheme(prefs.theme);
    setLocalLanguage(prefs.language);

    // Always dispatch synthetic storage events so same-tab listeners (ThemeContext) update.
    // Native StorageEvent only fires for OTHER tabs, not the current one.
    // We dispatch unconditionally because on login, localStorage was cleared.
    window.dispatchEvent(new StorageEvent('storage', {
        key: THEME_KEY,
        oldValue: null,
        newValue: prefs.theme,
        storageArea: localStorage,
    }));
    window.dispatchEvent(new StorageEvent('storage', {
        key: LANGUAGE_KEY,
        oldValue: null,
        newValue: prefs.language,
        storageArea: localStorage,
    }));

    // Also update i18n instance if language differs
    if (i18n.language !== prefs.language) {
        i18n.changeLanguage(prefs.language);
    }

    return prefs;
}

/**
 * Save theme to server and local storage.
 */
export async function saveThemeToServer(theme: string): Promise<void> {
    setLocalTheme(theme); // Immediate local update
    await preferencesApi.update({ theme: theme as PreferencesUpdate['theme'] });
}

/**
 * Save language to server and local storage.
 */
export async function saveLanguageToServer(lang: string): Promise<void> {
    setLocalLanguage(lang); // Immediate local update
    await preferencesApi.update({ language: lang as PreferencesUpdate['language'] });
}

// ============================================================================
// Logout Cleanup
// ============================================================================

/**
 * Clear local settings on logout.
 */
export function clearLocalSettings(): void {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(LANGUAGE_KEY);
}

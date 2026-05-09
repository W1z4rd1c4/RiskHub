const REFRESH_SESSION_HINT_COOKIE = 'riskhub_refresh_hint';
const EXPLICIT_LOGOUT_SUPPRESSION_KEY = 'riskhub_explicit_logout_suppressed';

function findCookieValue(name: string): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const prefix = `${name}=`;
    const cookie = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(prefix));

    if (!cookie) {
        return null;
    }

    return cookie.slice(prefix.length);
}

export function hasRefreshSessionHint(): boolean {
    return findCookieValue(REFRESH_SESSION_HINT_COOKIE) === '1';
}

export function clearRefreshSessionHint(): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.cookie = `${REFRESH_SESSION_HINT_COOKIE}=; Max-Age=0; path=/`;
}

export function __setRefreshSessionHintForTests(): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.cookie = `${REFRESH_SESSION_HINT_COOKIE}=1; path=/`;
}

function canUseSessionStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function isExplicitLogoutSuppressed(): boolean {
    if (!canUseSessionStorage()) {
        return false;
    }
    return window.sessionStorage.getItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY) === '1';
}

export function setExplicitLogoutSuppressed(): void {
    if (!canUseSessionStorage()) {
        return;
    }
    window.sessionStorage.setItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY, '1');
}

export function clearExplicitLogoutSuppressed(): void {
    if (!canUseSessionStorage()) {
        return;
    }
    window.sessionStorage.removeItem(EXPLICIT_LOGOUT_SUPPRESSION_KEY);
}

export function __resetExplicitLogoutSuppressionForTests(): void {
    clearExplicitLogoutSuppressed();
}

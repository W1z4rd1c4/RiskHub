const REFRESH_SESSION_HINT_COOKIE = 'riskhub_refresh_hint';

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

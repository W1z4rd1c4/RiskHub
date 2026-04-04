const CSRF_COOKIE_NAME = 'riskhub_csrf_token';

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

export function getCsrfToken(): string | null {
    return findCookieValue(CSRF_COOKIE_NAME);
}

export function clearCsrfToken(): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.cookie = `${CSRF_COOKIE_NAME}=; Max-Age=0; path=/`;
}

export function __setCsrfTokenForTests(token = 'test-csrf-token'): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.cookie = `${CSRF_COOKIE_NAME}=${token}; path=/`;
}

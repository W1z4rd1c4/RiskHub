let accessToken: string | null = null;

declare global {
    interface Window {
        __RISKHUB_ACCESS_TOKEN__?: string | null;
    }
}

function syncWindowToken(token: string | null): void {
    if (typeof window !== 'undefined') {
        window.__RISKHUB_ACCESS_TOKEN__ = token;
    }
}

export function getAccessToken(): string | null {
    return accessToken;
}

export function setAccessToken(token: string): void {
    accessToken = token;
    syncWindowToken(token);
}

export function clearAccessToken(): void {
    accessToken = null;
    syncWindowToken(null);
}

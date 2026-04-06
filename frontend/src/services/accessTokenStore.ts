import { getSessionSnapshot, setSessionSnapshot, subscribeSessionSnapshot } from '@/services/sessionStore';

export function getAccessToken(): string | null {
    return getSessionSnapshot().token;
}

export function setAccessToken(token: string): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token,
        user: previous.token === token ? previous.user : null,
        bootstrapStatus: previous.token === token && previous.user ? 'authenticated' : 'loading',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function clearAccessToken(): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: null,
        user: null,
        bootstrapStatus: 'anonymous',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
    let previousToken = getAccessToken();

    return subscribeSessionSnapshot(() => {
        const nextToken = getAccessToken();
        if (nextToken === previousToken) {
            return;
        }
        previousToken = nextToken;
        listener(nextToken);
    });
}

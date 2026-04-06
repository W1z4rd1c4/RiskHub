import type { AuthUser } from '@/services/authApi';
import { getSessionSnapshot, setSessionSnapshot } from '@/services/sessionStore';

export interface BootstrapSession {
    token: string;
    user: AuthUser;
}

export function getBootstrapSession(token: string): BootstrapSession | null {
    const snapshot = getSessionSnapshot();
    if (!snapshot.user || snapshot.token !== token) {
        return null;
    }
    return {
        token: snapshot.token,
        user: snapshot.user,
    };
}

export function setBootstrapSession(session: BootstrapSession): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        token: session.token,
        user: session.user,
        bootstrapStatus: 'authenticated',
        bootstrapError: null,
        logoutPending: false,
        logoutErrorKey: null,
    }));
}

export function clearBootstrapSession(): void {
    setSessionSnapshot((previous) => ({
        ...previous,
        user: null,
        bootstrapStatus: previous.token ? 'loading' : 'anonymous',
        bootstrapError: null,
    }));
}

export function __resetBootstrapSessionCacheForTests(): void {
    clearBootstrapSession();
}

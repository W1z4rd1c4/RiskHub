import type { AuthUser } from '@/services/authApi';

export type BootstrapSession = {
    token: string;
    user: AuthUser;
};

const BOOTSTRAP_CACHE_TTL_MS = 5_000;

let cachedBootstrap: (BootstrapSession & { expiresAt: number }) | null = null;

export function getBootstrapSession(token: string): BootstrapSession | null {
    if (!cachedBootstrap) {
        return null;
    }
    if (cachedBootstrap.token !== token) {
        return null;
    }
    if (cachedBootstrap.expiresAt <= Date.now()) {
        cachedBootstrap = null;
        return null;
    }
    return {
        token: cachedBootstrap.token,
        user: cachedBootstrap.user,
    };
}

export function setBootstrapSession(session: BootstrapSession): void {
    cachedBootstrap = {
        ...session,
        expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS,
    };
}

export function clearBootstrapSession(): void {
    cachedBootstrap = null;
}

export function __resetBootstrapSessionCacheForTests(): void {
    cachedBootstrap = null;
}

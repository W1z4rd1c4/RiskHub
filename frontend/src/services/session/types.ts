import type { AuthUser } from '@/services/authApi';

export type SessionBootstrapStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
export type SessionBootstrapError = 'service_unavailable' | null;

export interface SessionSnapshot {
    token: string | null;
    user: AuthUser | null;
    bootstrapStatus: SessionBootstrapStatus;
    bootstrapError: SessionBootstrapError;
    logoutPending: boolean;
    logoutErrorKey: string | null;
    lastUpdatedAt: number;
}

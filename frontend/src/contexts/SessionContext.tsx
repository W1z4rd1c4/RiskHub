import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { hasUserPermission } from '@/contexts/auth/permissions';
import type { AuthUser } from '@/services/authApi';
import { useSessionSnapshot } from '@/services/session';
import type { SessionBootstrapError, SessionBootstrapStatus } from '@/services/session/types';

export interface SessionContextValue {
    token: string | null;
    user: AuthUser | null;
    isLoading: boolean;
    bootstrapStatus: SessionBootstrapStatus;
    bootstrapError: SessionBootstrapError;
    logoutPending: boolean;
    logoutErrorKey: string | null;
    hasPermission: (resource: string, action: string) => boolean;
    isAuthenticated: boolean;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
    const session = useSessionSnapshot();
    const hasPermission = useCallback((resource: string, action: string): boolean => {
        return hasUserPermission(session.user, resource, action);
    }, [session.user]);

    const value = useMemo<SessionContextValue>(() => ({
        token: session.token,
        user: session.user,
        isLoading: session.bootstrapStatus === 'loading',
        bootstrapStatus: session.bootstrapStatus,
        bootstrapError: session.bootstrapError,
        logoutPending: session.logoutPending,
        logoutErrorKey: session.logoutErrorKey,
        hasPermission,
        isAuthenticated: Boolean(session.token && session.user),
    }), [
        session.token,
        session.user,
        session.bootstrapStatus,
        session.bootstrapError,
        session.logoutPending,
        session.logoutErrorKey,
        hasPermission,
    ]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
}

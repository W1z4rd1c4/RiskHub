import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthz } from '@/authz/useAuthz';

type GuardProps = {
    children: ReactNode;
};

function RedirectIfDenied({ allowed, children }: GuardProps & { allowed: boolean }) {
    if (!allowed) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

export function GovernanceRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.canViewGovernance}>{children}</RedirectIfDenied>;
}

export function ActivityLogRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.canViewActivityLog}>{children}</RedirectIfDenied>;
}

export function RiskWriteRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.canWriteRisks}>{children}</RedirectIfDenied>;
}

export function AuditTrailRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.canReadControls}>{children}</RedirectIfDenied>;
}

export function UsersRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.canViewUsersRoute}>{children}</RedirectIfDenied>;
}

export function UserLifecycleRouteGuard({ children }: GuardProps) {
    const authz = useAuthz();
    return <RedirectIfDenied allowed={authz.isPlatformAdmin}>{children}</RedirectIfDenied>;
}

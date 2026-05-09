import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import type { Authz } from '@/authz/policy';
import { useAuthz } from '@/authz/useAuthz';

type GuardProps = {
    children: ReactNode;
};

type BoolKeys = {
    [K in keyof Authz]: Authz[K] extends boolean ? K : never;
}[keyof Authz];

// eslint-disable-next-line react-refresh/only-export-components -- route guard factory is locked by architecture tests
export function createBusinessRouteGuard<K extends BoolKeys>(key: K) {
    return ({ children }: GuardProps) => {
        const authz = useAuthz();
        if (!authz[key]) {
            return <Navigate to="/" replace />;
        }

        return <>{children}</>;
    };
}

export const GovernanceRouteGuard = createBusinessRouteGuard('canViewGovernance');
export const ActivityLogRouteGuard = createBusinessRouteGuard('canViewActivityLog');
export const UsersRouteGuard = createBusinessRouteGuard('canViewUsersRoute');
export const UserLifecycleRouteGuard = createBusinessRouteGuard('isPlatformAdmin');

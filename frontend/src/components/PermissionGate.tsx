import { type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGateProps {
    resource: string;
    action: string;
    children: ReactNode;
    fallback?: ReactNode;
}

/**
 * Component that conditionally renders children based on user permissions.
 * 
 * @example
 * <PermissionGate resource="controls" action="write">
 *   <Button>Add Control</Button>
 * </PermissionGate>
 */
export function PermissionGate({
    resource,
    action,
    children,
    fallback = null,
}: PermissionGateProps) {
    const { isLoading } = useAuth();
    const { hasPermission } = usePermissions();

    if (isLoading) {
        return null;
    }

    if (hasPermission(resource, action)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
}

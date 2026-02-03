import { useMemo } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { buildAuthz } from './policy';

export function useAuthz() {
    const { user, hasPermission } = useAuth();
    return useMemo(() => buildAuthz(user, hasPermission), [user, hasPermission]);
}


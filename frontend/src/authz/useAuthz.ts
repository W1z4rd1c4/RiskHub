import { useMemo, useSyncExternalStore } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { isStrictCapabilitiesEnabled, subscribe } from '@/services/capabilityFlags';
import { buildAuthz } from './policy';

export function useAuthz() {
    const { user, hasPermission } = useAuth();
    const strictCapabilities = useSyncExternalStore(
        subscribe,
        isStrictCapabilitiesEnabled,
        isStrictCapabilitiesEnabled,
    );
    return useMemo(
        () => buildAuthz(user, hasPermission, user?.me_capabilities, strictCapabilities),
        [user, hasPermission, strictCapabilities],
    );
}

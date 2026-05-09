import { useQuery } from '@tanstack/react-query';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubKeys } from '@/lib/queryKeys';
import { riskHubApi } from '@/services/riskHubApi';

export function useRiskHubCapabilities() {
    return useQuery({
        queryKey: riskHubKeys.capabilities(),
        queryFn: () => riskHubApi.getCapabilities(),
    });
}

export function riskHubCapabilityEnabled<T extends object>(
    capabilities: T | null | undefined,
    key: keyof T,
): boolean {
    return resolveCapabilityFlag(capabilities, key);
}

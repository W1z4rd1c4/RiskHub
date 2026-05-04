import { useQuery } from '@tanstack/react-query';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { riskHubApi } from '@/services/riskHubApi';

export function useRiskHubCapabilities() {
    return useQuery({
        queryKey: ['riskHubCapabilities'],
        queryFn: () => riskHubApi.getCapabilities(),
    });
}

export function riskHubCapabilityEnabled<T extends object>(
    capabilities: T | null | undefined,
    key: keyof T,
): boolean {
    return resolveCapabilityFlag(capabilities, key);
}

import { useQuery } from '@tanstack/react-query';

import { riskHubKeys } from '@/lib/queryKeys';
import { riskHubApi } from '@/services/riskHubApi';

const ACCOUNTABILITY_REASSIGNMENT_SCENARIO = 'accountability_reassignment';

export function useAccountabilityReassignmentScenario() {
    const query = useQuery({
        queryKey: riskHubKeys.approvalScenarios(),
        queryFn: () => riskHubApi.getApprovalScenarios(),
        staleTime: 5 * 60_000,
    });
    const requiresApproval = (key: string) => query.data?.find(
        (scenario) => scenario.key === key,
    )?.requires_approval === true;

    return {
        isEnabled: requiresApproval(ACCOUNTABILITY_REASSIGNMENT_SCENARIO),
        isError: query.isError,
        isLoading: query.isLoading,
        requiresApproval,
    };
}

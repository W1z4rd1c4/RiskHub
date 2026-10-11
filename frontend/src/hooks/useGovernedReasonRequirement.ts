import { useQueries } from '@tanstack/react-query';
import { ictRegisterKeys } from '@/lib/queryKeys';

import { governedReasonRequirement, type GovernedReasonRecord } from '@/lib/governedReasonRequirement';
import { assetApi } from '@/services/assetApi';
import { processApi } from '@/services/processApi';
import { vendorApi } from '@/services/vendorApi';
import { useSessionSnapshot } from '@/services/session';

interface Participant {
    kind: 'asset' | 'process' | 'vendor';
    id: number | undefined;
    record?: GovernedReasonRecord | null;
}

/** Search pages are not complete inventories: resolve only missing exact rows. */
export function useGovernedReasonRequirement(participants: Participant[], enabled: boolean) {
    const session = useSessionSnapshot();
    const missing = participants.filter((item, index) =>
        typeof item.record?.capabilities?.protected_change_requires_approval !== 'boolean'
        && Number.isSafeInteger(item.id) && Number(item.id) > 0
        && participants.findIndex((other) => other.kind === item.kind && other.id === item.id) === index);
    const reads = useQueries({
        queries: missing.map((item) => ({
            queryKey: ictRegisterKeys.reasonRequirement(session.user?.id, item.kind, item.id),
            queryFn: async (): Promise<GovernedReasonRecord> => {
                if (item.kind === 'asset') return assetApi.getAsset(item.id!);
                if (item.kind === 'process') return processApi.getProcess(item.id!);
                return vendorApi.getVendor(item.id!);
            },
            enabled,
            retry: false,
            staleTime: 0,
        })),
    });
    return governedReasonRequirement(...participants.map((item) => {
        if (typeof item.record?.capabilities?.protected_change_requires_approval === 'boolean') return item.record;
        const index = missing.findIndex((other) => other.kind === item.kind && other.id === item.id);
        const read = reads[index];
        return read?.isSuccess && !read.isFetching ? read.data : undefined;
    }));
}

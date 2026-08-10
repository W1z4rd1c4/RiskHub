import { useState, useEffect } from 'react';
import { approvalsApi } from '@/services/approvalsApi';
import { logError } from '@/services/logger';
import type { ApprovalRequest } from '@/types/approval';

type ResourceType = 'risk' | 'control' | 'kri';

/**
 * Fetches all pending approval IDs for a given resource type.
 * Paginates through all pending approvals and returns a Set of resource IDs.
 *
 * @param resourceType - The type of resource ('risk', 'control', or 'kri')
 * @returns A Set containing the IDs of resources with pending approvals
 */
export function usePendingApprovalIds(resourceType: ResourceType): Set<number> {
    const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        let cancelled = false;
        const fetchPending = async () => {
            try {
                const pageSize = 100;
                let allItems: ApprovalRequest[] = [];
                let skip = 0;
                let total = 0;

                do {
                    const response = await approvalsApi.list({
                        status: 'pending',
                        limit: pageSize,
                        skip,
                    });
                    total = response.total;
                    allItems = [...allItems, ...response.items];
                    skip += pageSize;
                } while (skip < total);

                const ids = new Set<number>(
                    allItems
                        .filter((approval): approval is ApprovalRequest & { resource_id: number } => (
                            approval.resource_type === resourceType && approval.resource_id !== null
                        ))
                        .map((approval) => approval.resource_id),
                );
                if (!cancelled) {
                    setPendingIds(ids);
                }
            } catch (error) {
                logError('Failed to fetch pending approvals:', error);
            }
        };

        void fetchPending();
        return () => {
            cancelled = true;
        };
    }, [resourceType]);

    return pendingIds;
}

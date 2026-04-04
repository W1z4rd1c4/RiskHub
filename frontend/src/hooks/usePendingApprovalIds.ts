import { useState, useEffect } from 'react';
import { approvalsApi } from '@/services/approvalsApi';

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
        const fetchPending = async () => {
            try {
                const pageSize = 100;
                type ApprovalItem = { resource_type: string; resource_id: number };
                let allItems: ApprovalItem[] = [];
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
                        .filter((a) => a.resource_type === resourceType)
                        .map((a) => a.resource_id)
                );
                setPendingIds(ids);
            } catch (error) {
                console.error('Failed to fetch pending approvals:', error);
            }
        };

        void fetchPending();
    }, [resourceType]);

    return pendingIds;
}

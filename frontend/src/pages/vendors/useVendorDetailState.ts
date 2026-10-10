import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useDetailQuery } from '@/pages/detail/useDetailQuery';
import { useRestoreWithFeedback } from '@/pages/shared/useRestoreWithFeedback';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';

import type { VendorDetailMode } from './vendorDetailPresentation';

interface UseVendorDetailStateOptions {
    mode: VendorDetailMode;
}

export function useVendorDetailState({ mode }: UseVendorDetailStateOptions) {
    const { id } = useParams<{ id: string }>();
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const {
        isRetrying,
        loadOutcome,
        refetch: fetchVendor,
        resource: vendor,
        resourceId: vendorId,
    } = useDetailQuery<Vendor>({
        enabled: mode !== 'new',
        entity: 'vendor',
        rawId: id,
        load: (vendorId) => vendorApi.getVendor(vendorId),
    });

    const restoreWithFeedback = useRestoreWithFeedback();
    const restoreVendor = useCallback(async () => {
        if (!vendor) {
            return;
        }

        // D9: restore outcomes (success and failure) are toasts.
        const restored = vendor;
        await restoreWithFeedback({
            restore: () => vendorApi.restoreVendor(restored.id),
            name: restored.name,
            refresh: () => fetchVendor(),
        });
    }, [fetchVendor, restoreWithFeedback, vendor]);

    const canEdit = resolveCapabilityFlag(vendor?.capabilities, 'can_update');
    const canArchive = resolveCapabilityFlag(vendor?.capabilities, 'can_archive');
    const canRestore = resolveCapabilityFlag(vendor?.capabilities, 'can_restore');
    const canLinkRisk = resolveCapabilityFlag(vendor?.capabilities, 'can_link_risk');
    const canLinkControl = resolveCapabilityFlag(vendor?.capabilities, 'can_link_control');
    const canLinkKri = resolveCapabilityFlag(vendor?.capabilities, 'can_link_kri');
    const canCreateLinkedRisk = resolveCapabilityFlag(vendor?.capabilities, 'can_create_linked_risk');
    const canCreateLinkedControl = resolveCapabilityFlag(vendor?.capabilities, 'can_create_linked_control');
    const canCreateLinkedKri = resolveCapabilityFlag(vendor?.capabilities, 'can_create_linked_kri');
    const canCreateIssue = resolveCapabilityFlag(vendor?.capabilities, 'can_create_issue');

    return {
        canArchive,
        canEdit,
        canCreateIssue,
        canCreateLinkedControl,
        canCreateLinkedKri,
        canCreateLinkedRisk,
        canLinkControl,
        canLinkKri,
        canLinkRisk,
        canRestore,
        fetchVendor,
        isIssueModalOpen,
        isRetrying,
        loadOutcome,
        openIssueModal: () => setIsIssueModalOpen(true),
        closeIssueModal: () => setIsIssueModalOpen(false),
        restoreVendor,
        vendor,
        vendorId,
    };
}

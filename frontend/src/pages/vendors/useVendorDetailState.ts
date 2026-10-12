import { useState } from 'react';

import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useProtectedDetailState } from '@/pages/detail/useProtectedDetailState';
import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';

import type { VendorDetailMode } from './vendorDetailPresentation';

interface UseVendorDetailStateOptions {
    mode: VendorDetailMode;
}

export function useVendorDetailState({ mode }: UseVendorDetailStateOptions) {
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const {
        isRetrying, loadOutcome, refetch: fetchVendor, resource: vendor, resourceId: vendorId,
        restoreRecord: restoreVendor, canArchive, canEdit, canRestore,
    } = useProtectedDetailState<Vendor>({
        mode, entity: 'vendor',
        load: (id, signal) => vendorApi.getVendor(id, { signal }),
        restore: vendorApi.restoreVendor, name: (record) => record.name,
    });

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

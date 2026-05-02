import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { logError } from '@/services/logger';
import { isForbiddenApiError } from '@/services/apiClient';
import { vendorApi } from '@/services/vendorApi';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { Vendor } from '@/types/vendor';

import type { VendorDetailMode } from './vendorDetailPresentation';

interface UseVendorDetailStateOptions {
    mode: VendorDetailMode;
    notFoundMessage: string;
}

export function useVendorDetailState({
    mode,
    notFoundMessage,
}: UseVendorDetailStateOptions) {
    const { id } = useParams<{ id: string }>();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(mode !== 'new');
    const [error, setError] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const vendorId = Number(id);

    const fetchVendor = useCallback(async () => {
        if (!vendorId) {
            setVendor(null);
            setError(notFoundMessage);
            setIsAccessDenied(false);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const data = await vendorApi.getVendor(vendorId);
            setVendor(data);
            setError(null);
            setIsAccessDenied(false);
        } catch (loadError) {
            logError('Error fetching vendor:', loadError);
            const accessDenied = isForbiddenApiError(loadError);
            setIsAccessDenied(accessDenied);
            setVendor(null);
            setError(accessDenied ? null : notFoundMessage);
        } finally {
            setIsLoading(false);
        }
    }, [notFoundMessage, vendorId]);

    useEffect(() => {
        if (mode === 'new') {
            return;
        }
        void fetchVendor();
    }, [fetchVendor, mode]);

    const restoreVendor = useCallback(async () => {
        if (!vendor) {
            return;
        }

        try {
            await vendorApi.restoreVendor(vendor.id);
            await fetchVendor();
        } catch (restoreError) {
            logError('Error restoring vendor:', restoreError);
        }
    }, [fetchVendor, vendor]);

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
        error,
        fetchVendor,
        isAccessDenied,
        isIssueModalOpen,
        isLoading,
        openIssueModal: () => setIsIssueModalOpen(true),
        closeIssueModal: () => setIsIssueModalOpen(false),
        restoreVendor,
        vendor,
        vendorId,
    };
}

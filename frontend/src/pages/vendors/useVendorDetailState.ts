import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';

import {
    canEditVendorByOwnership,
    type VendorDetailMode,
} from './vendorDetailPresentation';

interface UseVendorDetailStateOptions {
    canDeleteVendor: boolean;
    canReadControls: boolean;
    canReadRisks: boolean;
    canWriteVendor: boolean;
    currentUserId: number | null | undefined;
    mode: VendorDetailMode;
    notFoundMessage: string;
}

export function useVendorDetailState({
    canDeleteVendor,
    canReadControls,
    canReadRisks,
    canWriteVendor,
    currentUserId,
    mode,
    notFoundMessage,
}: UseVendorDetailStateOptions) {
    const { id } = useParams<{ id: string }>();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(mode !== 'new');
    const [error, setError] = useState<string | null>(null);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const vendorId = Number(id);

    const fetchVendor = useCallback(async () => {
        if (!vendorId) {
            setVendor(null);
            setError(notFoundMessage);
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            const data = await vendorApi.getVendor(vendorId);
            setVendor(data);
            setError(null);
        } catch (loadError) {
            console.error('Error fetching vendor:', loadError);
            setError(notFoundMessage);
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
            console.error('Error restoring vendor:', restoreError);
        }
    }, [fetchVendor, vendor]);

    const canEditByOwnership = canEditVendorByOwnership(vendor, currentUserId);
    const canEdit = vendor?.capabilities?.can_update ?? (canWriteVendor || canEditByOwnership);
    const canArchive = vendor?.capabilities?.can_archive ?? Boolean(vendor?.status === 'active' && canDeleteVendor);
    const canRestore = vendor?.capabilities?.can_restore ?? Boolean(vendor?.status === 'inactive' && canDeleteVendor);
    const canLinkRisk = vendor?.capabilities?.can_link_risk ?? Boolean(canEdit && canReadRisks);
    const canLinkControl = vendor?.capabilities?.can_link_control ?? Boolean(canEdit && canReadControls);
    const canLinkKri = vendor?.capabilities?.can_link_kri ?? Boolean(canEdit && canReadRisks);

    return {
        canArchive,
        canEdit,
        canEditByOwnership,
        canLinkControl,
        canLinkKri,
        canLinkRisk,
        canRestore,
        error,
        fetchVendor,
        isIssueModalOpen,
        isLoading,
        openIssueModal: () => setIsIssueModalOpen(true),
        closeIssueModal: () => setIsIssueModalOpen(false),
        restoreVendor,
        vendor,
        vendorId,
    };
}

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
    canWriteVendor: boolean;
    currentUserId: number | null | undefined;
    mode: VendorDetailMode;
    notFoundMessage: string;
}

export function useVendorDetailState({
    canDeleteVendor,
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
    const canEdit = canWriteVendor || canEditByOwnership;
    const canArchive = Boolean(vendor?.status === 'active' && canDeleteVendor);
    const canRestore = Boolean(vendor?.status === 'inactive' && canDeleteVendor);

    return {
        canArchive,
        canEdit,
        canEditByOwnership,
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

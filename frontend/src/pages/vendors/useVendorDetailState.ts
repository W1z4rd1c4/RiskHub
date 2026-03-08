import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { vendorApi } from '@/services/vendorApi';
import type { Vendor } from '@/types/vendor';

import {
    buildVendorSearchParams,
    canEditVendorByOwnership,
    normalizeVendorLocation,
    type VendorDetailMode,
    type VendorSectionView,
    type VendorTabView,
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
    const [searchParams, setSearchParams] = useSearchParams();
    const searchKey = searchParams.toString();
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [isLoading, setIsLoading] = useState(mode !== 'new');
    const [error, setError] = useState<string | null>(null);
    const initialLocation = normalizeVendorLocation(searchParams.get('tab'), searchParams.get('section'));
    const [activeTab, setActiveTab] = useState<VendorTabView>(initialLocation.tab);
    const [activeSection, setActiveSection] = useState<VendorSectionView>(initialLocation.section);
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const vendorId = Number(id);

    useEffect(() => {
        const normalized = normalizeVendorLocation(searchParams.get('tab'), searchParams.get('section'));
        setActiveTab(normalized.tab);
        setActiveSection(normalized.section);

        if (normalized.shouldCanonicalize) {
            setSearchParams(buildVendorSearchParams(normalized.tab, normalized.section), { replace: true });
        }
    }, [searchKey, searchParams, setSearchParams]);

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

    const selectTab = useCallback(
        (tab: VendorTabView) => {
            setActiveTab(tab);
            setSearchParams(buildVendorSearchParams(tab, null), { replace: true });
        },
        [setSearchParams]
    );

    const selectSection = useCallback(
        (section: VendorSectionView) => {
            setActiveSection(section);
            setSearchParams(buildVendorSearchParams(activeTab, section), { replace: true });
        },
        [activeTab, setSearchParams]
    );

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
        activeSection,
        activeTab,
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
        selectSection,
        selectTab,
        vendor,
        vendorId,
    };
}

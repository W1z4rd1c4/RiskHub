import { useEffect, useMemo, useState } from 'react';

import type { KRIVendorOption } from '@/components/kri/KRIVendorSelector';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import { vendorApi } from '@/services/vendorApi';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { RiskSummary } from '@/types/risk';

import type { KRIFormVendorContext, KriVisibleUser } from './kriForm.types';
import { mapLinkedRiskToSummary, mapRiskToSummary, mergeRiskSummaries } from './kriForm.utils';

interface UseKriLookupsArgs {
    debouncedRiskSearch: string;
    debouncedVendorSearch: string;
    isEdit: boolean;
    riskId: number | undefined;
    selectedCategory: string;
    selectedDeptId: string;
    selectedProcess: string;
    showOnlyVendorLinkedRisks: boolean;
    vendorContext: KRIFormVendorContext | null;
}

export function useKriLookups({
    debouncedRiskSearch,
    debouncedVendorSearch,
    isEdit,
    riskId,
    selectedCategory,
    selectedDeptId,
    selectedProcess,
    showOnlyVendorLinkedRisks,
    vendorContext,
}: UseKriLookupsArgs) {
    const [genericRisks, setGenericRisks] = useState<RiskSummary[]>([]);
    const [isLoadingGenericRisks, setIsLoadingGenericRisks] = useState(false);
    const [isLoadingVendorLinkedRisks, setIsLoadingVendorLinkedRisks] = useState(Boolean(vendorContext));
    const [isLoadingVendors, setIsLoadingVendors] = useState(false);
    const [lookupErrorKey, setLookupErrorKey] = useState<string | null>(null);
    const [selectedRiskRecord, setSelectedRiskRecord] = useState<RiskSummary | null>(null);
    const [users, setUsers] = useState<KriVisibleUser[]>([]);
    const [vendorLinkedRiskIds, setVendorLinkedRiskIds] = useState<number[]>([]);
    const [vendorLinkedRisks, setVendorLinkedRisks] = useState<RiskSummary[]>([]);
    const [vendorOptions, setVendorOptions] = useState<KRIVendorOption[]>([]);

    useEffect(() => {
        if (isEdit || (vendorContext && showOnlyVendorLinkedRisks)) {
            setGenericRisks([]);
            return;
        }

        const loadRisks = async () => {
            try {
                setIsLoadingGenericRisks(true);
                setLookupErrorKey(null);
                const response = await riskApi.getRisks({
                    offset: 0,
                    limit: 50,
                    search: debouncedRiskSearch.trim() || undefined,
                    department_id: selectedDeptId ? parseInt(selectedDeptId, 10) : undefined,
                    process: selectedProcess || undefined,
                    category: selectedCategory || undefined,
                    include_archived: false,
                });
                setGenericRisks(response?.items ?? []);
            } catch {
                setGenericRisks([]);
                setLookupErrorKey('errorKeys.request_failed');
            } finally {
                setIsLoadingGenericRisks(false);
            }
        };

        void loadRisks();
    }, [
        debouncedRiskSearch,
        isEdit,
        selectedCategory,
        selectedDeptId,
        selectedProcess,
        showOnlyVendorLinkedRisks,
        vendorContext,
    ]);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const userList = await userApi.listVisibleUsers();
                setUsers(userList);
            } catch {
                setUsers([]);
            }
        };

        void loadUsers();
    }, []);

    useEffect(() => {
        const loadVendors = async () => {
            try {
                setIsLoadingVendors(true);
                const response = await vendorApi.getVendors({
                    offset: 0,
                    limit: 25,
                    include_archived: true,
                    search: debouncedVendorSearch.trim() || undefined,
                });
                setVendorOptions(
                    response.items.map((vendor) => ({
                        id: vendor.id,
                        name: vendor.name,
                        status: vendor.status,
                    })),
                );
            } catch {
                setVendorOptions([]);
            } finally {
                setIsLoadingVendors(false);
            }
        };

        void loadVendors();
    }, [debouncedVendorSearch]);

    useEffect(() => {
        if (!vendorContext) {
            setVendorLinkedRiskIds([]);
            setVendorLinkedRisks([]);
            setIsLoadingVendorLinkedRisks(false);
            return;
        }

        const loadVendorLinkedRisks = async () => {
            try {
                setIsLoadingVendorLinkedRisks(true);
                const linkedRisks = await vendorLinkApi.getLinkedRisks(vendorContext.vendorId);
                setVendorLinkedRiskIds(linkedRisks.map((risk) => risk.id));
                setVendorLinkedRisks(linkedRisks.map(mapLinkedRiskToSummary));
            } catch {
                setVendorLinkedRiskIds([]);
                setVendorLinkedRisks([]);
            } finally {
                setIsLoadingVendorLinkedRisks(false);
            }
        };

        void loadVendorLinkedRisks();
    }, [vendorContext]);

    const knownRisks = useMemo(
        () => mergeRiskSummaries(genericRisks, vendorLinkedRisks),
        [genericRisks, vendorLinkedRisks],
    );

    useEffect(() => {
        if (!riskId) {
            setSelectedRiskRecord(null);
            return;
        }

        const existingRisk = knownRisks.find((risk) => risk.id === riskId);
        if (existingRisk) {
            setSelectedRiskRecord(existingRisk);
            return;
        }

        const loadSelectedRisk = async () => {
            try {
                const risk = await riskApi.getRisk(riskId);
                setSelectedRiskRecord(mapRiskToSummary(risk));
            } catch {
                setSelectedRiskRecord(null);
            }
        };

        void loadSelectedRisk();
    }, [knownRisks, riskId]);

    return {
        genericRisks,
        isLoadingGenericRisks,
        isLoadingVendorLinkedRisks,
        isLoadingVendors,
        lookupErrorKey,
        selectedRiskRecord,
        users,
        vendorLinkedRiskIds,
        vendorLinkedRisks,
        vendorOptions,
    };
}

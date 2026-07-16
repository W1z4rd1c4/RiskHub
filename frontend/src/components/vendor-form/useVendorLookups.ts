import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ictRegisterKeys } from '@/lib/queryKeys';
import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import { vendorApi } from '@/services/vendorApi';

import {
    buildDepartmentOptions,
    buildOwnerOptions,
} from './vendorForm.mappers';
import type { DepartmentLookup } from './vendorForm.types';

export function useVendorLookups({ accountabilityEnabled }: { accountabilityEnabled: boolean }) {
    const [ownerSearch, setOwnerSearch] = useState('');
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [existingProcesses, setExistingProcesses] = useState<string[]>([]);
    const [subprocessesByProcess, setSubprocessesByProcess] = useState<Record<string, string[]>>({});

    const debouncedOwnerSearch = useDebouncedValue(ownerSearch, 250);
    const ownerQuery = useQuery({
        queryKey: ictRegisterKeys.vendorOwnerLookup(debouncedOwnerSearch),
        queryFn: () => lookupApi.getVendorOwners({
            q: debouncedOwnerSearch.trim() || undefined,
            limit: 50,
        }),
        enabled: accountabilityEnabled,
        staleTime: 5 * 60_000,
    });

    useEffect(() => {
        const loadLookups = async () => {
            const [departmentsResult, vendorsResult] = await Promise.allSettled([
                accountabilityEnabled
                    ? lookupApi.getVendorDepartments({ limit: 200 })
                    : Promise.resolve([] as DepartmentLookup[]),
                vendorApi.getVendors({ offset: 0, limit: 100 }),
            ]);
            setDepartments(departmentsResult.status === 'fulfilled' ? departmentsResult.value : []);
            if (vendorsResult.status === 'fulfilled') {
                const vendorData = vendorsResult.value;
                const processes = [...new Set(vendorData.items.map((vendor) => vendor.process).filter(Boolean))];
                setExistingProcesses(processes);

                const subprocMap: Record<string, string[]> = {};
                vendorData.items.forEach((vendor) => {
                    if (!vendor.process || !vendor.subprocess) {
                        return;
                    }
                    if (!subprocMap[vendor.process]) {
                        subprocMap[vendor.process] = [];
                    }
                    if (!subprocMap[vendor.process].includes(vendor.subprocess)) {
                        subprocMap[vendor.process].push(vendor.subprocess);
                    }
                });
                setSubprocessesByProcess(subprocMap);
            } else {
                setExistingProcesses([]);
                setSubprocessesByProcess({});
            }
        };

        void loadLookups();
    }, [accountabilityEnabled]);

    const users: UserLookupItem[] = useMemo(() => ownerQuery.data ?? [], [ownerQuery.data]);
    const ownerOptions = useMemo(() => buildOwnerOptions(users), [users]);
    const departmentOptions = useMemo(() => buildDepartmentOptions(departments), [departments]);

    return {
        departmentOptions,
        departments,
        existingProcesses,
        isOwnerLookupError: ownerQuery.isError,
        ownerSearch,
        ownerOptions,
        refetchOwners: ownerQuery.refetch,
        setOwnerSearch,
        subprocessesByProcess,
        users,
    };
}

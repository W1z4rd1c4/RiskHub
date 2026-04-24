import { useEffect, useMemo, useState } from 'react';

import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import { vendorApi } from '@/services/vendorApi';

import {
    buildDepartmentOptions,
    buildOwnerOptions,
} from './vendorForm.mappers';
import type { DepartmentLookup } from './vendorForm.types';

export function useVendorLookups() {
    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [existingProcesses, setExistingProcesses] = useState<string[]>([]);
    const [subprocessesByProcess, setSubprocessesByProcess] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [userData, departmentData, vendorData] = await Promise.all([
                    lookupApi.getUsers(),
                    lookupApi.getDepartments(),
                    vendorApi.getVendors({ offset: 0, limit: 100 }),
                ]);
                setUsers(userData);
                setDepartments(departmentData);

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
            } catch {
                setUsers([]);
                setDepartments([]);
                setExistingProcesses([]);
                setSubprocessesByProcess({});
            }
        };

        void loadLookups();
    }, []);

    const ownerOptions = useMemo(() => buildOwnerOptions(users), [users]);
    const departmentOptions = useMemo(() => buildDepartmentOptions(departments), [departments]);

    return {
        departmentOptions,
        departments,
        existingProcesses,
        ownerOptions,
        subprocessesByProcess,
        users,
    };
}

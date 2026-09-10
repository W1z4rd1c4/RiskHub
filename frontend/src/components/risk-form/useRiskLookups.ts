import { useEffect, useState } from 'react';

import { lookupApi, type UserLookupItem } from '@/services/lookupApi';
import { logError } from '@/services/logger';

export interface RiskDepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

export function useRiskLookups() {
    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<RiskDepartmentLookup[]>([]);
    const [existingProcesses, setExistingProcesses] = useState<string[]>([]);
    const [existingCategories, setExistingCategories] = useState<string[]>([]);
    const [subprocessesByProcess, setSubprocessesByProcess] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;

        void Promise.all([
            lookupApi.getRiskOwners({ limit: 200 }, { signal: controller.signal })
                .then((items) => { if (!cancelled) setUsers(items); })
                .catch((error) => { if (!cancelled) logError('Failed to load Risk owners:', error); }),
            lookupApi.getDepartments({ signal: controller.signal })
                .then((items) => { if (!cancelled) setDepartments(items); })
                .catch((error) => { if (!cancelled) logError('Failed to load Risk Departments:', error); }),
            lookupApi.getRiskFilters({ signal: controller.signal })
                .then((filters) => {
                    if (cancelled) return;
                    setExistingProcesses(filters.processes);
                    setExistingCategories(filters.categories);
                    setSubprocessesByProcess(filters.subprocesses_by_process);
                })
                .catch((error) => { if (!cancelled) logError('Failed to load Risk form suggestions:', error); }),
        ]);

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, []);

    return {
        departments,
        existingCategories,
        existingProcesses,
        subprocessesByProcess,
        users,
    };
}

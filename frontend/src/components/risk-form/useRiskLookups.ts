import { useEffect, useState } from 'react';

import { lookupApi, type UserLookupItem } from '@/services/lookupApi';
import { riskApi } from '@/services/riskApi';
import type { Risk } from '@/types/risk';

export interface RiskDepartmentLookup {
    id: number;
    name: string;
    code?: string;
}

interface RiskLookupItem {
    process?: string | null;
    subprocess?: string | null;
    category?: string | null;
}

async function fetchAllRisksForLookups(): Promise<Risk[]> {
    const limit = 100;
    const items: Risk[] = [];
    let offset = 0;

    for (;;) {
        const response = await riskApi.getRisks({ offset, limit });
        items.push(...response.items);
        if (offset + limit >= response.total) {
            return items;
        }
        offset += limit;
    }
}

function collectRiskLookupOptions(risks: RiskLookupItem[]) {
    const existingProcesses = [...new Set(risks.map((risk) => risk.process).filter((value): value is string => !!value))];
    const existingCategories = [...new Set(risks.map((risk) => risk.category).filter((value): value is string => !!value))];
    const subprocessesByProcess: Record<string, string[]> = {};

    risks.forEach((risk) => {
        if (!risk.process || !risk.subprocess) {
            return;
        }
        subprocessesByProcess[risk.process] = subprocessesByProcess[risk.process] ?? [];
        if (!subprocessesByProcess[risk.process].includes(risk.subprocess)) {
            subprocessesByProcess[risk.process].push(risk.subprocess);
        }
    });

    return {
        existingCategories,
        existingProcesses,
        subprocessesByProcess,
    };
}

export function useRiskLookups() {
    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<RiskDepartmentLookup[]>([]);
    const [existingProcesses, setExistingProcesses] = useState<string[]>([]);
    const [existingCategories, setExistingCategories] = useState<string[]>([]);
    const [subprocessesByProcess, setSubprocessesByProcess] = useState<Record<string, string[]>>({});

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [userData, deptData, risksData] = await Promise.all([
                    lookupApi.getUsers(),
                    lookupApi.getDepartments(),
                    fetchAllRisksForLookups(),
                ]);
                const options = collectRiskLookupOptions(risksData);
                setUsers(userData);
                setDepartments(deptData);
                setExistingProcesses(options.existingProcesses);
                setExistingCategories(options.existingCategories);
                setSubprocessesByProcess(options.subprocessesByProcess);
            } catch (error) {
                console.error('Failed to load risk form lookups:', error);
            }
        };
        void loadLookups();
    }, []);

    return {
        departments,
        existingCategories,
        existingProcesses,
        subprocessesByProcess,
        users,
    };
}

export const riskLookupsTestExports = {
    collectRiskLookupOptions,
    fetchAllRisksForLookups,
};

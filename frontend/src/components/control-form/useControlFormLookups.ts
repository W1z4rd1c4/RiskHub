import { useCallback, useEffect, useState } from 'react';

import { lookupApi } from '@/services/lookupApi';
import type { UserLookupItem } from '@/services/lookupApi';
import type { DepartmentSummary } from '@/services/departmentApi';
import { riskApi } from '@/services/riskApi';
import type { RiskSummary } from '@/types/risk';

import { getControlFormErrorKey } from './controlFormUtils';
import { logError } from '@/services/logger';

export function useControlFormLookups() {
    const [users, setUsers] = useState<UserLookupItem[]>([]);
    const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
    const [risks, setRisks] = useState<RiskSummary[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(true);
    const [isLoadingRisks, setIsLoadingRisks] = useState(false);
    const [dataErrorKey, setDataErrorKey] = useState<string | null>(null);

    const loadLookups = useCallback(async () => {
        try {
            setIsLoadingLookups(true);
            const [usersData, departmentData] = await Promise.all([
                lookupApi.getUsers(),
                lookupApi.getDepartments(),
            ]);
            setUsers(usersData);
            setDepartments(departmentData);
        } catch (error) {
            logError('Failed to load control form lookups:', error);
            setDataErrorKey(getControlFormErrorKey(error));
        } finally {
            setIsLoadingLookups(false);
        }
    }, []);

    const loadRisks = useCallback(async () => {
        try {
            setIsLoadingRisks(true);
            const response = await riskApi.getRisks({ limit: 100 });
            setRisks(response?.items ?? []);
        } catch (error) {
            logError('Failed to load risks:', error);
            setDataErrorKey(getControlFormErrorKey(error));
        } finally {
            setIsLoadingRisks(false);
        }
    }, []);

    const reloadData = useCallback(async () => {
        setDataErrorKey(null);
        await Promise.all([loadLookups(), loadRisks()]);
    }, [loadLookups, loadRisks]);

    useEffect(() => {
        void reloadData();
    }, [reloadData]);

    return {
        users,
        departments,
        risks,
        isLoadingLookups,
        isLoadingRisks,
        dataErrorKey,
        reloadData,
    };
}

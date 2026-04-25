import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiClient } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { departmentApi, type DepartmentSummary } from '@/services/departmentApi';
import { logError } from '@/services/logger';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import type { ControlRiskLink } from '@/types/control';
import type { OrphanedItem } from '@/types/orphanedItem';
import type { RiskSummary } from '@/types/risk';

import {
    canSubmitOrphanResolution,
    filterRisks,
    getOrphanResolutionRequirements,
    sortedAssignableUsers,
    toActiveUserOptions,
    uniqueRiskDepartments,
    type OrphanUserOption,
    type OrphanUserRead,
} from './resolveOrphanHelpers';

interface UseResolveOrphanWorkflowOptions {
    isOpen: boolean;
    onClose: () => void;
    onResolved: () => void;
    orphan: OrphanedItem | null;
}

export function useResolveOrphanWorkflow({
    isOpen,
    onClose,
    onResolved,
    orphan,
}: UseResolveOrphanWorkflowOptions) {
    const [users, setUsers] = useState<OrphanUserOption[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
    const [selectedRiskId, setSelectedRiskId] = useState<number | null>(null);
    const [allDepartments, setAllDepartments] = useState<DepartmentSummary[]>([]);
    const [allRisks, setAllRisks] = useState<RiskSummary[]>([]);
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [riskSearchQuery, setRiskSearchQuery] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [selectedRiskDept, setSelectedRiskDept] = useState('');
    const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearInitTimer = useCallback(() => {
        if (initTimerRef.current) {
            clearTimeout(initTimerRef.current);
            initTimerRef.current = null;
        }
    }, []);

    const fetchControlStatus = useCallback(async () => {
        if (orphan?.item_type === 'control') {
            const risks = await controlApi.getLinkedRisks(orphan.item_id);
            setLinkedRisks(risks);
        }
    }, [orphan?.item_id, orphan?.item_type]);

    const loadDepartments = useCallback(async () => {
        const departments = await departmentApi.getDepartments();
        setAllDepartments(departments);
    }, []);

    const loadRisks = useCallback(async () => {
        const response = await riskApi.getRisks({ limit: 100 });
        setAllRisks(response.items);
    }, []);

    const loadUsers = useCallback(async () => {
        const activeUsers = (await userApi.listUsers(0, 100)) as OrphanUserRead[];
        setUsers(toActiveUserOptions(activeUsers));
    }, []);

    const initializeData = useCallback(async () => {
        try {
            const promises: Promise<unknown>[] = [loadUsers(), loadDepartments()];

            if (orphan?.item_type === 'control' || orphan?.item_type === 'kri') {
                promises.push(loadRisks());
            }

            if (orphan?.item_type === 'control') {
                promises.push(fetchControlStatus());
            }

            await Promise.all(promises);
            clearInitTimer();
            initTimerRef.current = setTimeout(() => setIsInitialized(true), 150);
        } catch (err) {
            logError('Failed to initialize resolution data:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        }
    }, [clearInitTimer, fetchControlStatus, loadDepartments, loadRisks, loadUsers, orphan?.item_type]);

    useEffect(() => {
        if (!isOpen) {
            clearInitTimer();
            return;
        }

        setIsInitialized(false);
        setLinkedRisks([]);
        setSelectedUserId(null);
        setSelectedDepartmentId(null);
        setSelectedRiskId(null);
        setErrorKey(null);
        setSearchQuery('');
        setRiskSearchQuery('');
        setSelectedDeptFilter(null);
        setSelectedRiskDept('');

        if (orphan) {
            void initializeData();
        }

        return clearInitTimer;
    }, [clearInitTimer, initializeData, isOpen, orphan]);

    const requirements = useMemo(() => {
        return orphan ? getOrphanResolutionRequirements(orphan, linkedRisks, isInitialized) : null;
    }, [isInitialized, linkedRisks, orphan]);

    const uniqueDepartments = useMemo(() => uniqueRiskDepartments(allRisks), [allRisks]);

    const filteredRisks = useMemo(() => {
        return filterRisks(allRisks, riskSearchQuery, selectedRiskDept);
    }, [allRisks, riskSearchQuery, selectedRiskDept]);

    const sortedUsers = useMemo(() => {
        return sortedAssignableUsers(users, searchQuery, selectedDeptFilter, orphan?.department_name ?? null);
    }, [orphan?.department_name, searchQuery, selectedDeptFilter, users]);

    const canSubmit = orphan && requirements
        ? canSubmitOrphanResolution({
            isInitialized,
            isSubmitting,
            orphan,
            requirements,
            selectedDepartmentId,
            selectedRiskId,
            selectedUserId,
        })
        : false;

    function handleSelectUser(user: OrphanUserOption) {
        setSelectedUserId(user.id);
        setSelectedDepartmentId(user.department_id);
    }

    async function handleSubmit() {
        if (!orphan) {
            return;
        }
        setIsSubmitting(true);
        setErrorKey(null);

        try {
            await orphanedItemsApi.resolveOrphan(orphan.id, {
                new_owner_id: selectedUserId || undefined,
                department_id: selectedDepartmentId || undefined,
                target_risk_id: selectedRiskId || undefined,
            });
            onResolved();
            onClose();
        } catch (err: unknown) {
            logError('Failed to resolve orphan:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    return {
        allDepartments,
        canSubmit,
        errorKey,
        filteredRisks,
        handleSelectUser,
        handleSubmit,
        isInitialized,
        isSubmitting,
        requirements,
        riskSearchQuery,
        searchQuery,
        selectedDepartmentId,
        selectedDeptFilter,
        selectedRiskDept,
        selectedRiskId,
        selectedUserId,
        setRiskSearchQuery,
        setSearchQuery,
        setSelectedDepartmentId,
        setSelectedDeptFilter,
        setSelectedRiskDept,
        setSelectedRiskId,
        sortedUsers,
        uniqueDepartments,
    };
}

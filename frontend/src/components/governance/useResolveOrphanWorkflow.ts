import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiClient } from '@/services/apiClient';
import { controlApi } from '@/services/controlApi';
import { departmentApi } from '@/services/departmentApi';
import { lookupApi } from '@/services/lookupApi';
import { logError } from '@/services/logger';
import { orphanedItemsApi } from '@/services/orphanedItemsApi';
import { riskApi } from '@/services/riskApi';
import { userApi } from '@/services/userApi';
import type { ControlRiskLink } from '@/types/control';
import type { OrphanedItem } from '@/types/orphanedItem';
import type { RiskSummary } from '@/types/risk';

import { buildOrphanResolutionLabel, resolveOrphanStaleTarget } from './orphanResolutionState';
import {
    canSubmitOrphanResolution,
    filterRisks,
    getOrphanResolutionRequirements,
    sortedAssignableUsers,
    toActiveUserOptions,
    uniqueRiskDepartments,
    type OrphanUserOption,
    type OrphanDepartmentOption,
    type OrphanUserRead,
} from './resolveOrphanHelpers';

interface UseResolveOrphanWorkflowOptions {
    isOpen: boolean;
    onClose: () => void;
    onResolved: () => void;
    orphan: OrphanedItem | null;
}

function ownerLookupFailureMessage(itemType: OrphanedItem['item_type'] | undefined): string {
    const entityName = itemType === 'asset'
        ? 'Asset'
        : itemType === 'vendor'
            ? 'Vendor'
            : 'Process';
    return `Failed to search ${entityName} owners:`;
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
    const [allDepartments, setAllDepartments] = useState<OrphanDepartmentOption[]>([]);
    const [allRisks, setAllRisks] = useState<RiskSummary[]>([]);
    const [linkedRisks, setLinkedRisks] = useState<ControlRiskLink[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentSearchQuery, setDepartmentSearchQuery] = useState('');
    const [riskSearchQuery, setRiskSearchQuery] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [selectedRiskDept, setSelectedRiskDept] = useState('');
    const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ownerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ownerRequestRef = useRef(0);
    const departmentSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const departmentRequestRef = useRef(0);
    const modalGenerationRef = useRef(0);

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

    const loadDepartments = useCallback(async (query?: string, generation = modalGenerationRef.current) => {
        if (orphan?.item_type === 'vendor') {
            if (generation === modalGenerationRef.current) setAllDepartments([]);
            return;
        }
        if (orphan?.item_type === 'process' || orphan?.item_type === 'asset') {
            const requestId = ++departmentRequestRef.current;
            const params = {
                limit: 50,
                q: query?.trim() || undefined,
            };
            const departments = orphan.item_type === 'asset'
                ? await lookupApi.getAssetDepartments(params)
                : await lookupApi.getProcessDepartments(params);
            if (generation === modalGenerationRef.current && requestId === departmentRequestRef.current) {
                setAllDepartments(departments);
            }
            return;
        }
        const departments = await departmentApi.getDepartments();
        if (generation === modalGenerationRef.current) setAllDepartments(departments);
    }, [orphan?.item_type]);

    const loadRisks = useCallback(async () => {
        const response = await riskApi.getRisks({ limit: 100 });
        setAllRisks(response.items);
    }, []);

    const loadUsers = useCallback(async (query?: string, generation = modalGenerationRef.current) => {
        if (orphan?.item_type === 'process' || orphan?.item_type === 'asset' || orphan?.item_type === 'vendor') {
            const requestId = ++ownerRequestRef.current;
            const params = { limit: 50, q: query?.trim() || undefined };
            const owners = orphan.item_type === 'asset'
                ? await lookupApi.getAssetOwners(params)
                : orphan.item_type === 'vendor'
                    ? await lookupApi.getVendorOwners(params)
                    : await lookupApi.getProcessOwners(params);
            if (generation === modalGenerationRef.current && requestId === ownerRequestRef.current) {
                setUsers(owners.map((user) => ({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    department_id: user.department_id ?? null,
                    department_name: user.department_name ?? undefined,
                    role_name: user.role_name ?? undefined,
                })));
            }
            return;
        }
        const activeUsers = (await userApi.listUsers(0, 100)) as OrphanUserRead[];
        const eligibleUsers = orphan?.item_type === 'threat'
            ? activeUsers.filter((user) => user.role_name === 'ciso')
            : activeUsers;
        if (generation === modalGenerationRef.current) setUsers(toActiveUserOptions(eligibleUsers));
    }, [orphan?.item_type]);

    useEffect(() => {
        if (!isOpen || !isInitialized || !['process', 'asset', 'vendor'].includes(orphan?.item_type ?? '')) return;
        const generation = modalGenerationRef.current;
        if (ownerSearchTimerRef.current) clearTimeout(ownerSearchTimerRef.current);
        ownerSearchTimerRef.current = setTimeout(() => {
            void loadUsers(searchQuery, generation).catch((err) => {
                if (generation !== modalGenerationRef.current) return;
                logError(ownerLookupFailureMessage(orphan?.item_type), err);
                setErrorKey(apiClient.toUiMessageKey(err));
            });
        }, 200);
        return () => {
            if (ownerSearchTimerRef.current) clearTimeout(ownerSearchTimerRef.current);
        };
    }, [isInitialized, isOpen, loadUsers, orphan?.item_type, searchQuery]);

    useEffect(() => {
        if (!isOpen || !isInitialized || (orphan?.item_type !== 'process' && orphan?.item_type !== 'asset')) return;
        const generation = modalGenerationRef.current;
        if (departmentSearchTimerRef.current) clearTimeout(departmentSearchTimerRef.current);
        departmentSearchTimerRef.current = setTimeout(() => {
            void loadDepartments(departmentSearchQuery, generation).catch((err) => {
                if (generation !== modalGenerationRef.current) return;
                logError('Failed to search Process departments:', err);
                setErrorKey(apiClient.toUiMessageKey(err));
            });
        }, 200);
        return () => {
            if (departmentSearchTimerRef.current) clearTimeout(departmentSearchTimerRef.current);
        };
    }, [departmentSearchQuery, isInitialized, isOpen, loadDepartments, orphan?.item_type]);

    const initializeData = useCallback(async (generation: number) => {
        try {
            const promises: Promise<unknown>[] = [
                loadUsers(undefined, generation),
                loadDepartments(undefined, generation),
            ];

            if (orphan?.item_type === 'control' || orphan?.item_type === 'kri') {
                promises.push(loadRisks());
            }

            if (orphan?.item_type === 'control') {
                promises.push(fetchControlStatus());
            }

            await Promise.all(promises);
            if (generation !== modalGenerationRef.current) return;
            clearInitTimer();
            initTimerRef.current = setTimeout(() => {
                if (generation === modalGenerationRef.current) setIsInitialized(true);
            }, 150);
        } catch (err) {
            if (generation !== modalGenerationRef.current) return;
            logError('Failed to initialize resolution data:', err);
            setErrorKey(apiClient.toUiMessageKey(err));
        }
    }, [clearInitTimer, fetchControlStatus, loadDepartments, loadRisks, loadUsers, orphan?.item_type]);

    useEffect(() => {
        const generation = ++modalGenerationRef.current;
        if (!isOpen) {
            clearInitTimer();
            return () => {
                if (modalGenerationRef.current === generation) modalGenerationRef.current += 1;
            };
        }

        setIsInitialized(false);
        setLinkedRisks([]);
        setSelectedUserId(null);
        setSelectedDepartmentId(null);
        setSelectedRiskId(null);
        setErrorKey(null);
        setSearchQuery('');
        setDepartmentSearchQuery('');
        setRiskSearchQuery('');
        setSelectedDeptFilter(null);
        setSelectedRiskDept('');

        if (orphan) {
            void initializeData(generation);
        }

        return () => {
            if (modalGenerationRef.current === generation) modalGenerationRef.current += 1;
            clearInitTimer();
        };
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

    const staleTarget = resolveOrphanStaleTarget({ stale: errorKey === 'orphaned_items.errors.stale_target' });
    const safeOrphanLabel = buildOrphanResolutionLabel(orphan?.item_name, orphan?.item_type ?? 'item');
    const canSubmit = orphan && requirements
        ? canSubmitOrphanResolution({
            isInitialized,
            isSubmitting,
            orphan,
            requirements,
            selectedDepartmentId,
            selectedRiskId,
            selectedUserId,
        }) && staleTarget.canSubmit
        : false;

    function handleSelectUser(user: OrphanUserOption) {
        setSelectedUserId(user.id);
        if (orphan?.item_type !== 'vendor') {
            setSelectedDepartmentId((current) => (
                orphan?.item_type === 'process' || orphan?.item_type === 'asset' ? current ?? user.department_id : user.department_id
            ));
        }
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
                department_id: orphan.item_type === 'threat' || orphan.item_type === 'vendor'
                    ? undefined
                    : selectedDepartmentId || undefined,
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
        departmentSearchQuery,
        errorKey,
        filteredRisks,
        handleSelectUser,
        handleSubmit,
        isInitialized,
        isSubmitting,
        requirements,
        riskSearchQuery,
        safeOrphanLabel,
        searchQuery,
        selectedDepartmentId,
        selectedDeptFilter,
        selectedRiskDept,
        selectedRiskId,
        selectedUserId,
        setRiskSearchQuery,
        setSearchQuery,
        setDepartmentSearchQuery,
        setSelectedDepartmentId,
        setSelectedDeptFilter,
        setSelectedRiskDept,
        setSelectedRiskId,
        sortedUsers,
        uniqueDepartments,
    };
}

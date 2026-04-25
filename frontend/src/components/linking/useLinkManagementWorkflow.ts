import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { lookupApi } from '@/services/lookupApi';
import { logError } from '@/services/logger';
import type { ControlEffectiveness } from '@/types/risk';

import { getLinkedTargetId } from './linkModes';
import { restoreLinkTarget, searchLinkTargets } from './linkSearchAdapters';
import type { DepartmentLookup, ExistingLinkItem, LinkMode, SearchResultItem } from './linkTypes';

interface UseLinkManagementWorkflowArgs {
    mode: LinkMode;
    existingLinks: ExistingLinkItem[];
    isOpen: boolean;
    onClose: () => void;
    onLink: (targetId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlink: (targetId: number) => Promise<void>;
    showSearch: boolean;
}

export function useLinkManagementWorkflow({
    mode,
    existingLinks,
    isOpen,
    onClose,
    onLink,
    onUnlink,
    showSearch,
}: UseLinkManagementWorkflowArgs) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isUnlinking, setIsUnlinking] = useState<number | null>(null);
    const [unlinkTargetId, setUnlinkTargetId] = useState<number | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [processes, setProcesses] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(false);

    const latestSearchRequestIdRef = useRef(0);
    const wasOpenRef = useRef(false);

    const linkedTargetIdSet = useMemo(
        () => new Set(existingLinks.map((link) => getLinkedTargetId(link, mode))),
        [existingLinks, mode],
    );

    useEffect(() => {
        if (!isOpen || !showSearch) return;

        let cancelled = false;
        const loadLookups = async () => {
            try {
                setIsLoadingLookups(true);
                const [deptData, filterData] = await Promise.all([
                    lookupApi.getDepartments(),
                    lookupApi.getRiskFilters(),
                ]);
                if (cancelled) return;
                setDepartments(deptData);
                setProcesses(filterData.processes);
                setCategories(filterData.categories);
            } catch (err) {
                if (!cancelled) {
                    logError('Failed to load search lookups.', err);
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingLookups(false);
                }
            }
        };

        void loadLookups();
        return () => {
            cancelled = true;
        };
    }, [isOpen, showSearch]);

    const handleSearch = useCallback(async () => {
        if (!isOpen || !showSearch) return;
        const requestId = ++latestSearchRequestIdRef.current;

        try {
            setIsSearching(true);
            const results = await searchLinkTargets({
                mode,
                searchQuery,
                selectedDeptId,
                selectedProcess,
                selectedCategory,
                includeArchived,
                departments,
                linkedTargetIdSet,
            });
            if (requestId === latestSearchRequestIdRef.current) {
                setSearchResults(results);
            }
        } catch (err) {
            logError('Search failed.', err);
        } finally {
            if (requestId === latestSearchRequestIdRef.current) {
                setIsSearching(false);
            }
        }
    }, [
        departments,
        includeArchived,
        isOpen,
        linkedTargetIdSet,
        mode,
        searchQuery,
        selectedCategory,
        selectedDeptId,
        selectedProcess,
        showSearch,
    ]);

    useEffect(() => {
        if (isOpen) {
            wasOpenRef.current = true;
            return;
        }

        if (!wasOpenRef.current) return;
        wasOpenRef.current = false;

        setSearchQuery((prev) => (prev === '' ? prev : ''));
        setSearchResults((prev) => (prev.length === 0 ? prev : []));
        setSelectedTargetId((prev) => (prev === null ? prev : null));
        setSelectedDeptId((prev) => (prev === null ? prev : null));
        setSelectedProcess((prev) => (prev === '' ? prev : ''));
        setSelectedCategory((prev) => (prev === '' ? prev : ''));
        setIncludeArchived((prev) => (prev ? false : prev));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !showSearch) return;

        const delayDebounceFn = setTimeout(() => {
            void handleSearch();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [handleSearch, isOpen, showSearch]);

    const handleLink = async () => {
        if (selectedTargetId === null) return;
        try {
            setIsLinking(true);
            await onLink(selectedTargetId, 'medium', '');
            onClose();
        } catch (err) {
            logError('Linking failed.', err);
        } finally {
            setIsLinking(false);
        }
    };

    const handleUnlink = (targetId: number) => {
        setUnlinkTargetId(targetId);
    };

    const handleConfirmUnlink = async () => {
        if (unlinkTargetId === null) return;
        try {
            setIsUnlinking(unlinkTargetId);
            await onUnlink(unlinkTargetId);
        } catch (err) {
            logError('Unlinking failed.', err);
        } finally {
            setIsUnlinking(null);
            setUnlinkTargetId(null);
        }
    };

    const handleUnarchiveSearchResult = async (targetId: number) => {
        try {
            await restoreLinkTarget(mode, targetId);
            await handleSearch();
        } catch (err) {
            logError('Unarchive failed.', err);
        }
    };

    return {
        categories,
        departments,
        handleConfirmUnlink,
        handleLink,
        handleSearch,
        handleUnarchiveSearchResult,
        handleUnlink,
        includeArchived,
        isLinking,
        isLoadingLookups,
        isSearching,
        isUnlinking,
        processes,
        searchQuery,
        searchResults,
        selectedCategory,
        selectedDeptId,
        selectedProcess,
        selectedTargetId,
        setIncludeArchived,
        setSearchQuery,
        setSelectedCategory,
        setSelectedDeptId,
        setSelectedProcess,
        setSelectedTargetId,
        setUnlinkTargetId,
        unlinkTargetId,
    };
}

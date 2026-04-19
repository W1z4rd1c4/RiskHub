/**
 * LinkManagementDialog
 * 
 * Modal dialog for managing risk/control links.
 * Orchestrates search, filter, link, and unlink operations.
 * 
 * Subcomponents:
 * - LinkSearchPanel: Search, filter, and link new items
 * - ExistingLinksPanel: Display and unlink existing items
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link as LinkIcon } from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { kriApi } from '@/services/kriApi';
import { riskApi } from '@/services/riskApi';
import { lookupApi } from '@/services/lookupApi';
import type { ControlEffectiveness } from '@/types/risk';
import { LinkSearchPanel, type DepartmentLookup, type SearchResultItem } from './linking/LinkSearchPanel';
import { ExistingLinksPanel, type ExistingLinkItem } from './linking/ExistingLinksPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkManagementDialogProps {
    mode: 'control-to-risk' | 'risk-to-control' | 'vendor-to-kri';
    title?: string;
    existingLinks: ExistingLinkItem[];
    onLink: (targetId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlink: (targetId: number) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
    showSearch?: boolean;
    showLinks?: boolean;
    showLinkMetadataBadge?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkManagementDialog({
    mode,
    title,
    existingLinks,
    onLink,
    onUnlink,
    isOpen,
    onClose,
    showSearch = true,
    showLinks = true,
    showLinkMetadataBadge = true,
}: LinkManagementDialogProps) {
    const { t } = useTranslation(['common', 'controls', 'kris', 'risks']);
    // -----------------------------------------------------------------------
    // Search state
    // -----------------------------------------------------------------------
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // -----------------------------------------------------------------------
    // Selection state
    // -----------------------------------------------------------------------
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [isLinking, setIsLinking] = useState(false);
    const [isUnlinking, setIsUnlinking] = useState<number | null>(null);
    const [unlinkTargetId, setUnlinkTargetId] = useState<number | null>(null);

    // -----------------------------------------------------------------------
    // Filter state
    // -----------------------------------------------------------------------
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedProcess, setSelectedProcess] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [includeArchived, setIncludeArchived] = useState(false);

    // -----------------------------------------------------------------------
    // Lookups state
    // -----------------------------------------------------------------------
    const [departments, setDepartments] = useState<DepartmentLookup[]>([]);
    const [processes, setProcesses] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoadingLookups, setIsLoadingLookups] = useState(false);
    const { hasPermission } = useAuth();
    const latestSearchRequestIdRef = useRef(0);

    // -----------------------------------------------------------------------
    // Derived values
    // -----------------------------------------------------------------------
    const linkedTargetIdSet = useMemo(() => {
        const ids = existingLinks.map((link) =>
            mode === 'control-to-risk' ? link.risk_id : mode === 'risk-to-control' ? link.control_id : link.kri_id
        );
        return new Set(ids);
    }, [existingLinks, mode]);

    // -----------------------------------------------------------------------
    // Effects
    // -----------------------------------------------------------------------

    // Load lookups when dialog opens
    useEffect(() => {
        if (!isOpen || !showSearch) return;

        let cancelled = false;
        const loadLookups = async () => {
            try {
                setIsLoadingLookups(true);
                const [deptData, filterData] = await Promise.all([
                    lookupApi.getDepartments(),
                    lookupApi.getRiskFilters()
                ]);
                if (cancelled) return;
                setDepartments(deptData);
                setProcesses(filterData.processes);
                setCategories(filterData.categories);
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load search lookups:', err);
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

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleSearch = useCallback(async () => {
        if (!isOpen || !showSearch) return;
        const requestId = ++latestSearchRequestIdRef.current;

        try {
            setIsSearching(true);
            const params: Record<string, string | number | boolean> = {
                limit: 20
            };
            if (searchQuery) params.search = searchQuery;
            if (selectedDeptId) params.department_id = selectedDeptId;
            if (selectedProcess) params.process = selectedProcess;
            if (selectedCategory) params.category = selectedCategory;
            if (includeArchived) params.include_archived = true;

            if (mode === 'control-to-risk') {
                const results = await riskApi.getRisks(params);
                if (requestId === latestSearchRequestIdRef.current) {
                    setSearchResults(results.items.filter(r => !linkedTargetIdSet.has(r.id)));
                }
            } else if (mode === 'risk-to-control') {
                const results = await controlApi.getControls(params);
                if (requestId === latestSearchRequestIdRef.current) {
                    setSearchResults(results.items.filter(c => !linkedTargetIdSet.has(c.id)));
                }
            } else {
                const results = await kriApi.getKRIs({
                    page: 1,
                    size: 100,
                    include_archived: includeArchived,
                    search: searchQuery || undefined,
                });
                const filtered = results.items.filter((kri) => {
                    if (linkedTargetIdSet.has(kri.id)) return false;
                    if (selectedDeptId && !departments.some((department) => department.id === selectedDeptId && department.name === kri.risk_department_name)) {
                        return false;
                    }
                    if (selectedProcess && kri.risk_process !== selectedProcess) return false;
                    if (selectedCategory && kri.risk_category !== selectedCategory) return false;
                    return true;
                });
                if (requestId === latestSearchRequestIdRef.current) {
                    setSearchResults(
                        filtered.map((kri) => ({
                            id: kri.id,
                            name: kri.metric_name,
                            description: kri.description,
                            status: kri.is_archived ? 'archived' : String(kri.monitoring_status ?? ''),
                            department_name: kri.risk_department_name,
                            process: kri.risk_process,
                            category: kri.risk_category,
                        }))
                    );
                }
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            if (requestId === latestSearchRequestIdRef.current) {
                setIsSearching(false);
            }
        }
    }, [departments, includeArchived, isOpen, linkedTargetIdSet, mode, searchQuery, selectedCategory, selectedDeptId, selectedProcess, showSearch]);

    const wasOpenRef = useRef(false);

    // Reset local dialog state only when transitioning from open to closed.
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

    // Search with debounce while open.
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
            console.error('Linking failed:', err);
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
            console.error('Unlinking failed:', err);
        } finally {
            setIsUnlinking(null);
            setUnlinkTargetId(null);
        }
    };

    const handleUnarchiveSearchResult = async (targetId: number) => {
        try {
            if (mode === 'control-to-risk') {
                await riskApi.restoreRisk(targetId);
            } else if (mode === 'risk-to-control') {
                await controlApi.restoreControl(targetId);
            } else {
                await kriApi.restoreKRI(targetId);
            }
            await handleSearch();
        } catch (err) {
            console.error('Unarchive failed:', err);
        }
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (typeof document === 'undefined') return null;

    const mainModal = createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        role="dialog"
                        aria-modal="true"
                        data-testid="link-management-dialog"
                        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900/95 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="bg-accent/20 p-2 rounded-lg">
                                    <LinkIcon className="h-5 w-5 text-accent" />
                                </div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                    {title
                                        ?? (!showSearch
                                            ? t('common:empty.no_connections')
                                            : mode === 'control-to-risk'
                                                ? t('controls:actions.link_risk')
                                                : mode === 'risk-to-control'
                                                    ? t('risks:actions.link_control')
                                                    : t('vendors:links.actions.link_existing'))}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                title={t('common:actions.close')}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Search Panel */}
                            {showSearch && (
                                <LinkSearchPanel
                                    mode={mode}
                                    searchQuery={searchQuery}
                                    onSearchQueryChange={setSearchQuery}
                                    searchResults={searchResults}
                                    isSearching={isSearching}
                                    selectedDeptId={selectedDeptId}
                                    onDeptIdChange={setSelectedDeptId}
                                    selectedProcess={selectedProcess}
                                    onProcessChange={setSelectedProcess}
                                    selectedCategory={selectedCategory}
                                    onCategoryChange={setSelectedCategory}
                                    includeArchived={includeArchived}
                                    onIncludeArchivedChange={setIncludeArchived}
                                    departments={departments}
                                    processes={processes}
                                    categories={categories}
                                    isLoadingLookups={isLoadingLookups}
                                    selectedTargetId={selectedTargetId}
                                    onSelectTarget={setSelectedTargetId}
                                    onLink={handleLink}
                                    isLinking={isLinking}
                                    canUnarchive={
                                        mode === 'control-to-risk'
                                            ? hasPermission('risks', 'delete')
                                            : mode === 'risk-to-control'
                                                ? hasPermission('controls', 'delete')
                                                : hasPermission('risks', 'delete')
                                    }
                                    onUnarchive={handleUnarchiveSearchResult}
                                />
                            )}

                            {/* Existing Links Panel */}
                            {showLinks && (
                                <ExistingLinksPanel
                                    mode={mode}
                                    existingLinks={existingLinks}
                                    onUnlink={handleUnlink}
                                    isUnlinking={isUnlinking}
                                    showMetadataBadge={showLinkMetadataBadge}
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                            <button
                                onClick={onClose}
                                className="w-full text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors py-2"
                            >
                                {t('common:actions.close')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );

    return (
        <>
            {mainModal}
            <ConfirmDialog
                isOpen={unlinkTargetId !== null}
                onClose={() => setUnlinkTargetId(null)}
                onConfirm={handleConfirmUnlink}
                title={t('common:confirmation.delete_title')}
                message={t('common:confirmation.remove_link')}
                confirmLabel={t('common:actions.delete')}
                variant="danger"
                isLoading={isUnlinking !== null}
            />
        </>
    );
}

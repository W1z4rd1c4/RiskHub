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

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link as LinkIcon } from 'lucide-react';
import { controlApi } from '@/services/controlApi';
import { riskApi } from '@/services/riskApi';
import { lookupApi } from '@/services/lookupApi';
import { ControlEffectiveness } from '@/types/risk';
import { LinkSearchPanel, type DepartmentLookup, type SearchResultItem } from './linking/LinkSearchPanel';
import { ExistingLinksPanel, type ExistingLinkItem } from './linking/ExistingLinksPanel';
import { useAuth } from '@/contexts/AuthContext';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkManagementDialogProps {
    mode: 'control-to-risk' | 'risk-to-control';
    title?: string;
    existingLinks: ExistingLinkItem[];
    onLink: (targetId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlink: (targetId: number) => Promise<void>;
    isOpen: boolean;
    onClose: () => void;
    showSearch?: boolean;
    showLinks?: boolean;
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
    showLinks = true
}: LinkManagementDialogProps) {
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

    // -----------------------------------------------------------------------
    // Derived values
    // -----------------------------------------------------------------------
    const linkedTargetIds = existingLinks.map(link =>
        mode === 'control-to-risk' ? link.risk_id : link.control_id
    );

    // -----------------------------------------------------------------------
    // Effects
    // -----------------------------------------------------------------------

    // Load lookups when dialog opens
    useEffect(() => {
        if (isOpen && showSearch) {
            const loadLookups = async () => {
                try {
                    setIsLoadingLookups(true);
                    const [deptData, filterData] = await Promise.all([
                        lookupApi.getDepartments(),
                        lookupApi.getRiskFilters()
                    ]);
                    setDepartments(deptData);
                    setProcesses(filterData.processes);
                    setCategories(filterData.categories);
                } catch (err) {
                    console.error('Failed to load search lookups:', err);
                } finally {
                    setIsLoadingLookups(false);
                }
            };
            loadLookups();
        }
    }, [isOpen, showSearch]);

    // Search with debounce
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            setSearchResults([]);
            setSelectedTargetId(null);
            setSelectedDeptId(null);
            setSelectedProcess('');
            setSelectedCategory('');
            setIncludeArchived(false);
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            handleSearch();
        }, 300);

        return () => clearTimeout(delayDebounceFn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, selectedDeptId, selectedProcess, selectedCategory, includeArchived, isOpen]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    const handleSearch = async () => {
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
                setSearchResults(results.items.filter(r => !linkedTargetIds.includes(r.id)));
            } else {
                const results = await controlApi.getControls(params);
                setSearchResults(results.items.filter(c => !linkedTargetIds.includes(c.id)));
            }
        } catch (err) {
            console.error('Search failed:', err);
        } finally {
            setIsSearching(false);
        }
    };

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

    const handleUnlink = async (targetId: number) => {
        if (!confirm('Are you sure you want to remove this link?')) return;
        try {
            setIsUnlinking(targetId);
            await onUnlink(targetId);
        } catch (err) {
            console.error('Unlinking failed:', err);
        } finally {
            setIsUnlinking(null);
        }
    };

    const handleUnarchiveSearchResult = async (targetId: number) => {
        try {
            if (mode === 'control-to-risk') {
                await riskApi.restoreRisk(targetId);
            } else {
                await controlApi.restoreControl(targetId);
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

    return createPortal(
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
                        className="relative w-full max-w-2xl max-h-[90vh] bg-slate-900/95 backdrop-blur-xl rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-white/10"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="bg-accent/20 p-2 rounded-lg">
                                    <LinkIcon className="h-5 w-5 text-accent" />
                                </div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">
                                    {title ?? (!showSearch ? 'Manage existing connections' : (mode === 'control-to-risk' ? 'Link Risks to Control' : 'Link Controls to Risk'))}
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
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
                                    canUnarchive={mode === 'control-to-risk' ? hasPermission('risks', 'delete') : hasPermission('controls', 'delete')}
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
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-white/5 bg-white/[0.02]">
                            <button
                                onClick={onClose}
                                className="w-full text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors py-2"
                            >
                                Close Manager
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

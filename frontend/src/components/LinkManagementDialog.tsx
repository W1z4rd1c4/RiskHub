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

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link as LinkIcon } from 'lucide-react';
import type { ControlEffectiveness } from '@/types/risk';
import { LinkSearchPanel } from './linking/LinkSearchPanel';
import { ExistingLinksPanel, type ExistingLinkItem } from './linking/ExistingLinksPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { canUnarchiveLinkTarget, getLinkDialogTitle } from './linking/linkModes';
import type { LinkMode } from './linking/linkTypes';
import { useLinkManagementWorkflow } from './linking/useLinkManagementWorkflow';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LinkManagementDialogProps {
    mode: LinkMode;
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
    const { hasPermission } = useAuth();
    const workflow = useLinkManagementWorkflow({
        mode,
        existingLinks,
        isOpen,
        onClose,
        onLink,
        onUnlink,
        showSearch,
    });

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
                                    {getLinkDialogTitle(mode, t, { title, showSearch })}
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
                                    searchQuery={workflow.searchQuery}
                                    onSearchQueryChange={workflow.setSearchQuery}
                                    searchResults={workflow.searchResults}
                                    isSearching={workflow.isSearching}
                                    selectedDeptId={workflow.selectedDeptId}
                                    onDeptIdChange={workflow.setSelectedDeptId}
                                    selectedProcess={workflow.selectedProcess}
                                    onProcessChange={workflow.setSelectedProcess}
                                    selectedCategory={workflow.selectedCategory}
                                    onCategoryChange={workflow.setSelectedCategory}
                                    includeArchived={workflow.includeArchived}
                                    onIncludeArchivedChange={workflow.setIncludeArchived}
                                    departments={workflow.departments}
                                    processes={workflow.processes}
                                    categories={workflow.categories}
                                    isLoadingLookups={workflow.isLoadingLookups}
                                    selectedTargetId={workflow.selectedTargetId}
                                    onSelectTarget={workflow.setSelectedTargetId}
                                    onLink={workflow.handleLink}
                                    isLinking={workflow.isLinking}
                                    canUnarchive={canUnarchiveLinkTarget(mode, hasPermission)}
                                    onUnarchive={workflow.handleUnarchiveSearchResult}
                                />
                            )}

                            {/* Existing Links Panel */}
                            {showLinks && (
                                <ExistingLinksPanel
                                    mode={mode}
                                    existingLinks={existingLinks}
                                    onUnlink={workflow.handleUnlink}
                                    isUnlinking={workflow.isUnlinking}
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
                isOpen={workflow.unlinkTargetId !== null}
                onClose={() => workflow.setUnlinkTargetId(null)}
                onConfirm={workflow.handleConfirmUnlink}
                title={t('common:confirmation.delete_title')}
                message={t('common:confirmation.remove_link')}
                confirmLabel={t('common:actions.delete')}
                variant="danger"
                isLoading={workflow.isUnlinking !== null}
            />
        </>
    );
}

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

import { useId } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import type { ControlEffectiveness } from '@/types/risk';
import { LinkSearchPanel } from './linking/LinkSearchPanel';
import { ExistingLinksPanel, type ExistingLinkItem } from './linking/ExistingLinksPanel';
import { useTranslation } from '@/i18n/hooks';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DialogBody, DialogFooter, DialogHeader, DialogShell } from '@/components/ui/dialog';
import { buildExistingLinkPresentation } from './linking/linkManagementPresentation';
import { getLinkDialogTitle } from './linking/linkModes';
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
    const titleId = useId();
    const workflow = useLinkManagementWorkflow({
        mode,
        existingLinks,
        isOpen,
        onClose,
        onLink,
        onUnlink,
        showSearch,
    });
    const unlinkTargetName = workflow.unlinkTargetId === null
        ? undefined
        : existingLinks
            .map((link) => buildExistingLinkPresentation(link, mode, t))
            .find((presentation) => presentation.targetId === workflow.unlinkTargetId)
            ?.displayName;

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <>
            <DialogShell
                isOpen={isOpen}
                onClose={onClose}
                titleId={titleId}
                dataTestId="link-management-dialog"
                size="lg"
            >
                <DialogHeader title={getLinkDialogTitle(mode, t, { title, showSearch })} icon={LinkIcon} />

                <DialogBody className="space-y-8">
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
                </DialogBody>

                <DialogFooter cancelLabel={t('common:actions.close')} />
            </DialogShell>
            {/* D10 / PG-07: unlink, not delete — "Remove link" with the Unlink icon. */}
            <ConfirmDialog
                isOpen={workflow.unlinkTargetId !== null}
                onClose={() => workflow.setUnlinkTargetId(null)}
                onConfirm={workflow.handleConfirmUnlink}
                intent="unlink"
                entityName={unlinkTargetName}
                isLoading={workflow.isUnlinking !== null}
            />
        </>
    );
}

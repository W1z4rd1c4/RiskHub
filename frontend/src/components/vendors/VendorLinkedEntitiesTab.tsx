import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Link as LinkIcon, Loader2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { LinkMode } from '@/components/linking/linkTypes';
import { useTranslation } from '@/i18n/hooks';
import { navigateToApprovalRequest } from '@/pages/approvals/approvalNavigation';
import { logError } from '@/services/logger';

import {
    useVendorLinkedEntities,
    type VendorLinkedEntitiesAdapter,
} from './useVendorLinkedEntities';

type DialogMode = 'links-only' | 'search-only';

export type VendorLinkedRegionSummary =
    | { status: 'loading' }
    | { status: 'success'; activeCount: number }
    | { status: 'failed' }
    | { status: 'denied' };

export interface VendorLinkedEntitiesTabProps<T extends { id: number }> {
    vendorId: number;
    adapter: VendorLinkedEntitiesAdapter<T>;
    canCreate: boolean;
    canEdit: boolean;
    /**
     * Backend-declared `protected_change_requires_approval` capability from the
     * Vendor read payload (#100). It is the ONLY switch between the direct link
     * path and the governed reason-then-queue path — no local re-derivation.
     */
    protectedChangeRequiresApproval: boolean;
    onAdd: () => void;
    renderCard: (item: T, onClick: () => void) => ReactNode;
    onNavigate: (entityId: number) => void;
    icon: ReactNode;
    headerColorClass: string;
    i18nKeys: {
        tabTitle: string;
        subtitle: string;
        empty: string;
        archived: string;
        dialogTitle: string;
        addAction: string;
    };
    linkDialogMode: LinkMode;
    dataTestIdPrefix?: string;
    addButtonTestId?: string;
    motionDelay?: number;
    onCollectionStateChange?: (summary: VendorLinkedRegionSummary) => void;
}

export function VendorLinkedEntitiesTab<T extends { id: number }>({
    vendorId,
    adapter,
    canCreate,
    canEdit,
    protectedChangeRequiresApproval,
    onAdd,
    renderCard,
    onNavigate,
    icon,
    headerColorClass,
    i18nKeys,
    linkDialogMode,
    dataTestIdPrefix,
    addButtonTestId,
    motionDelay = 0,
    onCollectionStateChange,
}: VendorLinkedEntitiesTabProps<T>) {
    const { t } = useTranslation(['vendors', 'common']);
    const navigate = useNavigate();
    const entities = useVendorLinkedEntities(vendorId, adapter);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>('search-only');
    const [pendingGovernedAction, setPendingGovernedAction] = useState<
        { kind: 'link_add' | 'link_remove'; targetId: number } | null
    >(null);
    const [isGovernedSubmitting, setIsGovernedSubmitting] = useState(false);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const isDenied = entities.outcome.kind === 'denied';
    const testId = (suffix: string) => dataTestIdPrefix ? `${dataTestIdPrefix}-${suffix}` : undefined;

    useEffect(() => {
        if (!onCollectionStateChange) {
            return;
        }
        switch (entities.outcome.kind) {
            case 'content':
            case 'empty':
                onCollectionStateChange({ status: 'success', activeCount: entities.active.length });
                break;
            case 'denied':
                onCollectionStateChange({ status: 'denied' });
                break;
            case 'fatal-error':
            case 'stale-with-error':
                onCollectionStateChange({ status: 'failed' });
                break;
            case 'initial-loading':
                onCollectionStateChange({ status: 'loading' });
                break;
        }
    }, [entities.active.length, entities.outcome.kind, onCollectionStateChange]);

    const confirmGovernedAction = async (reason: string) => {
        if (pendingGovernedAction === null) {
            return;
        }
        try {
            setIsGovernedSubmitting(true);
            setMutationError(null);
            const queued = pendingGovernedAction.kind === 'link_add'
                ? await entities.link(pendingGovernedAction.targetId, reason)
                : await entities.unlink(pendingGovernedAction.targetId, reason);
            setPendingGovernedAction(null);
            if (queued !== null) {
                navigateToApprovalRequest(navigate, queued.approval_id);
            }
        } catch (mutationErr) {
            logError('Vendor link mutation failed:', mutationErr);
            setMutationError(t('register_links.errors.mutation_failed'));
        } finally {
            setIsGovernedSubmitting(false);
        }
    };

    function renderEntityLists(): ReactNode {
        return (
            <>
                {entities.active.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {entities.active.map((item) => renderCard(item, () => onNavigate(item.id)))}
                    </div>
                ) : null}
                {entities.archived.length > 0 ? (
                    <div className="mt-8">
                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-muted-foreground" />{t(i18nKeys.archived, { count: entities.archived.length })}</h4>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 opacity-50 hover:opacity-100 transition-opacity">
                            {entities.archived.map((item) => renderCard(item, () => onNavigate(item.id)))}
                        </div>
                    </div>
                ) : null}
            </>
        );
    }

    let collectionContent: ReactNode = null;
    switch (entities.outcome.kind) {
        case 'initial-loading':
            collectionContent = (
                <div role="status" className="flex items-center gap-3 text-muted-foreground font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('labels.loading')}
                </div>
            );
            break;
        case 'denied':
            collectionContent = (
                <div role="alert" className="mb-2 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive text-sm font-medium">
                    <AlertCircle className="h-5 w-5" />
                    {t('links.errors.access_denied')}
                </div>
            );
            break;
        case 'fatal-error':
            collectionContent = (
                <div role="alert" className="mb-2 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive text-sm font-medium">
                    <AlertCircle className="h-5 w-5" />
                    <span>{t('links.errors.load_failed')}</span>
                    <button
                        type="button"
                        onClick={() => void entities.retry()}
                        aria-busy={entities.outcome.isRetrying}
                        aria-disabled={entities.outcome.isRetrying}
                        className="ml-auto rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-black uppercase tracking-widest hover:bg-destructive/20"
                    >
                        {t('actions.retry', { ns: 'common' })}
                    </button>
                    {entities.outcome.isRetrying ? (
                        <span role="status" className="sr-only">{t('links.status.retrying')}</span>
                    ) : null}
                </div>
            );
            break;
        case 'empty':
            collectionContent = (
                <div className="py-10 text-center border-2 border-dashed border-border rounded-2xl">
                    <p className="text-xs text-muted-foreground font-medium">{t(i18nKeys.empty)}</p>
                </div>
            );
            break;
        case 'stale-with-error':
            collectionContent = (
                <>
                    <div role="alert" className="mb-4 p-4 bg-warning/10 border border-warning/20 rounded-xl flex items-center gap-3 text-warning-text text-sm font-medium">
                        <AlertCircle className="h-5 w-5" />
                        <span>{t('links.errors.stale')}</span>
                        <button
                            type="button"
                            onClick={() => void entities.retry()}
                            aria-busy={entities.outcome.isRetrying}
                            aria-disabled={entities.outcome.isRetrying}
                            className="ml-auto rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-black uppercase tracking-widest hover:bg-warning/20"
                        >
                            {t('actions.retry', { ns: 'common' })}
                        </button>
                        {entities.outcome.isRetrying ? (
                            <span role="status" className="sr-only">{t('links.status.retrying')}</span>
                        ) : null}
                    </div>
                    {renderEntityLists()}
                </>
            );
            break;
        case 'content':
            collectionContent = renderEntityLists();
            break;
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: motionDelay }}
            className="glass-card"
            data-testid={testId('section')}
        >
            <div className="flex items-center justify-between border-b border-border pb-4 mb-6 gap-4">
                <div className="flex items-center gap-3">
                    {icon}
                    <div>
                        <h3 className={`font-bold uppercase tracking-widest text-xs ${headerColorClass}`}>{t(i18nKeys.tabTitle)}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{t(i18nKeys.subtitle)}</p>
                    </div>
                </div>
                {canEdit && !isDenied ? (
                    <div className="flex items-stretch bg-accent/10 border border-accent/20 rounded-lg overflow-hidden">
                        <button type="button" onClick={() => { setDialogMode('search-only'); setIsDialogOpen(true); }} data-testid={testId('link-existing')} className="flex items-center gap-2 px-4 py-1.5 text-accent-text text-xs font-black uppercase tracking-widest hover:bg-accent/10 transition-colors border-r border-accent/20">
                            <LinkIcon className="h-3 w-3" />
                            {t('links.actions.link_existing')}
                        </button>
                        {canCreate ? (
                            <button type="button" onClick={onAdd} data-testid={addButtonTestId ?? testId('add')} className="flex items-center gap-2 px-3 py-1.5 text-accent-text text-xs font-black uppercase tracking-widest hover:bg-accent/10 transition-colors" title={t(i18nKeys.addAction)}>
                                <Plus className="h-3.5 w-3.5" />
                                <span>{t(i18nKeys.addAction)}</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* After-close visibility only: while the reason dialog is open the
                error is announced inside it (#100 P2 — the shell traps focus). */}
            {mutationError && pendingGovernedAction === null ? (
                <div
                    role="alert"
                    data-testid={testId('mutation-error')}
                    className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                >
                    {mutationError}
                </div>
            ) : null}

            {collectionContent}

            {canEdit && !isDenied ? (
                <button type="button" onClick={() => { setDialogMode('links-only'); setIsDialogOpen(true); }} data-testid={testId('manage-existing')} className="w-full mt-6 py-3 border border-dashed border-border rounded-2xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-accent/40 hover:bg-glass-hover transition-colors">
                    {t('links.actions.manage_existing')}
                </button>
            ) : null}
            {canEdit && !isDenied ? (
                <LinkManagementDialog
                    mode={linkDialogMode}
                    title={t(i18nKeys.dialogTitle)}
                    existingLinks={entities.existingLinks}
                    onLink={async (targetId) => {
                        if (protectedChangeRequiresApproval) {
                            setMutationError(null);
                            setPendingGovernedAction({ kind: 'link_add', targetId });
                            return;
                        }
                        await entities.link(targetId);
                    }}
                    onUnlink={async (targetId) => {
                        if (protectedChangeRequiresApproval) {
                            setMutationError(null);
                            setPendingGovernedAction({ kind: 'link_remove', targetId });
                            return;
                        }
                        await entities.unlink(targetId);
                    }}
                    isOpen={isDialogOpen}
                    onClose={() => setIsDialogOpen(false)}
                    showSearch={dialogMode !== 'links-only'}
                    showLinks={dialogMode !== 'search-only'}
                    showLinkMetadataBadge={false}
                />
            ) : null}
            {protectedChangeRequiresApproval && !isDenied ? (
                <GovernedMutationReasonDialog
                    isOpen={pendingGovernedAction !== null}
                    reasonRequired
                    namespace="vendors"
                    kind={pendingGovernedAction?.kind ?? 'link_add'}
                    isLoading={isGovernedSubmitting}
                    errorText={mutationError}
                    onClose={() => setPendingGovernedAction(null)}
                    onConfirm={(reason) => {
                        void confirmGovernedAction(reason);
                    }}
                />
            ) : null}
        </motion.div>
    );
}

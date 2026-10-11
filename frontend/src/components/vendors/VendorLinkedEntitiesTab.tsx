import { useMutationOwner } from '@/hooks/useMutationOwner';
import { governedReasonRequirementFromFlags } from '@/lib/governedReasonRequirement';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link as LinkIcon, Plus, type LucideIcon } from 'lucide-react';

import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import type { LinkMode } from '@/components/linking/linkTypes';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { InlineMessage } from '@/components/ui/inline-message';
import { AccessDeniedState, EmptyState, ErrorState, LoadingState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';
import { useApprovalQueued } from '@/hooks/useApprovalQueued';
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
    protectedChangeRequiresApproval: boolean | undefined;
    onAdd: () => void;
    /**
     * Renders one linked record. `archived` marks a card of the archived group:
     * it carries its own status badge instead of a dimmed group (GAP-D-14).
     */
    renderCard: (item: T, onClick: () => void, options: { archived: boolean }) => ReactNode;
    onNavigate: (entityId: number) => void;
    /** Decorative section icon shown before the `h2` title. */
    icon: LucideIcon;
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

function VendorLinkedEntitiesTabContent<T extends { id: number }>({
    vendorId,
    adapter,
    canCreate,
    canEdit,
    protectedChangeRequiresApproval,
    onAdd,
    renderCard,
    onNavigate,
    icon,
    i18nKeys,
    linkDialogMode,
    dataTestIdPrefix,
    addButtonTestId,
    motionDelay = 0,
    onCollectionStateChange,
}: VendorLinkedEntitiesTabProps<T>) {
    const { t } = useTranslation(['vendors', 'common']);
    // D12 / PM-2: approval-routed changes keep the user on this page with
    // the pending notice plus a success toast.
    const announceApprovalQueued = useApprovalQueued();
    const mutationOwner = useMutationOwner(vendorId);
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

    const mutateRelation = async (kind: 'link_add' | 'link_remove', targetId: number, reason?: string) => {
        const isCurrent = mutationOwner.capture();
        const outcome = kind === 'link_add'
            ? await entities.link(targetId, reason) : await entities.unlink(targetId, reason);
        if (!isCurrent() || outcome.kind === 'superseded') return { kind: 'superseded' } as const;
        if (outcome.kind === 'pending') announceApprovalQueued({ approvalId: outcome.approvalId });
        return outcome;
    };

    const confirmGovernedAction = async (reason: string) => {
        if (pendingGovernedAction === null) {
            return;
        }
        const isCurrent = mutationOwner.capture();
        try {
            setIsGovernedSubmitting(true);
            setMutationError(null);
            const outcome = await mutateRelation(pendingGovernedAction.kind, pendingGovernedAction.targetId, reason);
            if (!isCurrent() || outcome.kind === 'superseded') return;
            setPendingGovernedAction(null);
        } catch (mutationErr) {
            if (!isCurrent()) return;
            logError('Vendor link mutation failed:', mutationErr);
            setMutationError(t('register_links.errors.mutation_failed'));
        } finally {
            if (isCurrent()) setIsGovernedSubmitting(false);
        }
    };

    function renderEntityLists(): ReactNode {
        return (
            <>
                {entities.active.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {entities.active.map((item) => renderCard(item, () => onNavigate(item.id), { archived: false }))}
                    </div>
                ) : null}
                {entities.archived.length > 0 ? (
                    <div className="mt-8">
                        <h3 className="text-eyebrow mb-4 flex items-center gap-2">
                            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-muted-foreground" />
                            {t(i18nKeys.archived, { count: entities.archived.length })}
                        </h3>
                        {/* GAP-D-14: no whole-group opacity; the heading and each card state the status. */}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {entities.archived.map((item) => renderCard(item, () => onNavigate(item.id), { archived: true }))}
                        </div>
                    </div>
                ) : null}
            </>
        );
    }

    let collectionContent: ReactNode = null;
    switch (entities.outcome.kind) {
        case 'initial-loading':
            collectionContent = <LoadingState layout="inline" label={t('labels.loading')} />;
            break;
        case 'denied':
            collectionContent = (
                <AccessDeniedState layout="section" descriptionKey="links.errors.access_denied" ns="vendors" />
            );
            break;
        case 'fatal-error':
            collectionContent = (
                <>
                    <ErrorState
                        layout="inline"
                        message={t('links.errors.load_failed')}
                        onRetry={() => void entities.retry()}
                        isRetrying={entities.outcome.isRetrying}
                        className="mb-2"
                    />
                    {entities.outcome.isRetrying ? (
                        <span role="status" className="sr-only">{t('links.status.retrying')}</span>
                    ) : null}
                </>
            );
            break;
        case 'empty':
            collectionContent = (
                <EmptyState
                    layout="inline"
                    icon={null}
                    title={t(i18nKeys.empty)}
                    className="justify-center rounded-2xl border-2 border-dashed border-border py-10"
                />
            );
            break;
        case 'stale-with-error':
            collectionContent = (
                <>
                    <ErrorState
                        variant="banner"
                        message={t('links.errors.stale')}
                        onRetry={() => void entities.retry()}
                        isRetrying={entities.outcome.isRetrying}
                        className="mb-4"
                    />
                    {entities.outcome.isRetrying ? (
                        <span role="status" className="sr-only">{t('links.status.retrying')}</span>
                    ) : null}
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
            initial={{ opacity: 1, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: motionDelay }}
        >
            <Card as="section" data-testid={testId('section')}>
                <CardHeader
                    icon={icon}
                    title={t(i18nKeys.tabTitle)}
                    description={t(i18nKeys.subtitle)}
                    className="mb-6"
                    actions={canEdit && !isDenied ? (
                        <>
                            <Button
                                variant="outline"
                                size="compact"
                                onClick={() => { setDialogMode('search-only'); setIsDialogOpen(true); }}
                                data-testid={testId('link-existing')}
                            >
                                <LinkIcon aria-hidden="true" />
                                {t('links.actions.link_existing')}
                            </Button>
                            {canCreate ? (
                                <Button
                                    variant="accent"
                                    size="compact"
                                    onClick={onAdd}
                                    data-testid={addButtonTestId ?? testId('add')}
                                >
                                    <Plus aria-hidden="true" />
                                    {t(i18nKeys.addAction)}
                                </Button>
                            ) : null}
                        </>
                    ) : null}
                />

                {/* After-close visibility only: while the reason dialog is open the
                    error is announced inside it (#100 P2 — the shell traps focus). */}
                {mutationError && pendingGovernedAction === null ? (
                    <InlineMessage tone="danger" className="mb-4" data-testid={testId('mutation-error')}>
                        {mutationError}
                    </InlineMessage>
                ) : null}

                {protectedChangeRequiresApproval === undefined ? <InlineMessage tone="warning">{t('common:governed_mutation.capability_unavailable')}</InlineMessage> : null}
                {collectionContent}

                {canEdit && !isDenied ? (
                    <Button
                        variant="outline"
                        className="mt-6 w-full border-dashed"
                        onClick={() => { setDialogMode('links-only'); setIsDialogOpen(true); }}
                        disabled={protectedChangeRequiresApproval === undefined}
                        data-testid={testId('manage-existing')}
                    >
                        {t('links.actions.manage_existing')}
                    </Button>
                ) : null}
                {canEdit && !isDenied ? (
                    <LinkManagementDialog
                        mode={linkDialogMode}
                        title={t(i18nKeys.dialogTitle)}
                        existingLinks={entities.existingLinks}
                        onLink={async (targetId) => {
                            if (protectedChangeRequiresApproval === undefined) throw new Error(t('common:governed_mutation.capability_unavailable'));
                            if (protectedChangeRequiresApproval) {
                                setMutationError(null);
                                setPendingGovernedAction({ kind: 'link_add', targetId });
                                return;
                            }
                            return mutateRelation('link_add', targetId);
                        }}
                        onUnlink={async (targetId) => {
                            if (protectedChangeRequiresApproval === undefined) throw new Error(t('common:governed_mutation.capability_unavailable'));
                            if (protectedChangeRequiresApproval) {
                                setMutationError(null);
                                setPendingGovernedAction({ kind: 'link_remove', targetId });
                                return;
                            }
                            return mutateRelation('link_remove', targetId);
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
                        reasonRequirement={governedReasonRequirementFromFlags(protectedChangeRequiresApproval)}
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
            </Card>
        </motion.div>
    );
}

export function VendorLinkedEntitiesTab<T extends { id: number }>(props: VendorLinkedEntitiesTabProps<T>) {
    return <VendorLinkedEntitiesTabContent key={props.vendorId} {...props} />;
}

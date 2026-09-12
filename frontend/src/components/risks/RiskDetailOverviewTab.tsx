import type { ReactNode } from 'react';
import type { OverdueKRI } from '@/types/kri';
import type { ControlEffectiveness, Risk, RiskControlLink } from '@/types/risk';
import type { Vendor } from '@/types/vendor';

import { TableErrorState } from '@/components/tables/tableError/TableErrorState';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import type { CollectionOutcome } from '@/pages/shared/collectionPageState';

import { RiskAssessmentSection } from './detail-overview/RiskAssessmentSection';
import { RiskKriSection } from './detail-overview/RiskKriSection';
import { RiskLinkedControlsSection } from './detail-overview/RiskLinkedControlsSection';
import { RiskLinkedVendorsSection } from './detail-overview/RiskLinkedVendorsSection';
import { RiskRegisterLinksSection } from './detail-overview/RiskRegisterLinksSection';
import { RiskSummaryCards } from './detail-overview/RiskSummaryCards';
import { RiskTimestamps } from './detail-overview/RiskTimestamps';
import { groupLinkedControls } from './detail-overview/riskOverviewHelpers';

type DialogMode = 'both' | 'search-only' | 'links-only';

interface RiskDetailOverviewTabProps {
    risk: Risk;
    linkedControls: RiskControlLink[];
    linkedVendors: Vendor[];
    overdueKRIs: OverdueKRI[];
    linkedControlsOutcome: CollectionOutcome;
    linkedVendorsOutcome: CollectionOutcome;
    overdueKrisOutcome: CollectionOutcome;
    onRetryLinkedControls: () => void;
    onRetryLinkedVendors: () => void;
    onRetryOverdueKris: () => void;
    getColor: (type: string) => string;
    getDisplayName: (type: string) => string;
    onNavigateToNewKri: () => void;
    onNavigateToKri: (kriId: number) => void;
    onLinkControl: (controlId: number, effectiveness: ControlEffectiveness, notes?: string) => Promise<void>;
    onUnlinkControl: (controlId: number) => Promise<void>;
    onOpenCreateControl: () => void;
    onNavigateToControl: (controlId: number) => void;
    onNavigateToVendor: (vendorId: number) => void;
    onRefreshData: () => void;
    isLinkDialogOpen: boolean;
    setIsLinkDialogOpen: (open: boolean) => void;
    dialogMode: DialogMode;
    setDialogMode: (mode: DialogMode) => void;
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
}

function SidecarSection({
    children,
    className,
    label,
    onRetry,
    outcome,
    retainChildrenOnFailure = false,
    testId,
}: {
    children: ReactNode;
    className?: string;
    label: string;
    onRetry: () => void;
    outcome: CollectionOutcome;
    retainChildrenOnFailure?: boolean;
    testId: string;
}) {
    const { t } = useTranslation('common');
    const isError = outcome.kind === 'fatal-error' || outcome.kind === 'stale-with-error';
    const isRetrying = isError ? outcome.isRetrying : false;
    const errorMessage = outcome.kind === 'stale-with-error'
        ? `${label}: ${t('common:detail_load.stale_description')}`
        : `${label}: ${t('common:errors.load_failed')}`;

    return (
        <div
            className={className}
            aria-busy={outcome.kind === 'initial-loading' || outcome.kind === 'content' && outcome.isRefreshing}
        >
            {outcome.kind === 'fatal-error' || outcome.kind === 'denied' ? (
                retainChildrenOnFailure ? <>
                    <TableErrorState
                        variant="banner"
                        testId={testId}
                        message={errorMessage}
                        onRetry={outcome.kind === 'fatal-error' ? onRetry : undefined}
                        isRetrying={isRetrying}
                        className="mb-4"
                    />
                    {children}
                </> :
                <TableErrorState
                    testId={testId}
                    message={errorMessage}
                    onRetry={outcome.kind === 'fatal-error' ? onRetry : undefined}
                    isRetrying={isRetrying}
                />
            ) : outcome.kind === 'initial-loading' ? (
                <div className="glass-card py-12 text-center text-sm text-muted-foreground" role="status">
                    {t('common:loading.generic')}
                </div>
            ) : <>
            {outcome.kind === 'stale-with-error' ? (
                <TableErrorState
                    variant="banner"
                    testId={testId}
                    message={errorMessage}
                    onRetry={onRetry}
                    isRetrying={isRetrying}
                    className="mb-4"
                />
            ) : null}
            {children}
            </>}
        </div>
    );
}

export function RiskDetailOverviewTab({
    risk,
    linkedControls,
    linkedVendors,
    overdueKRIs,
    linkedControlsOutcome,
    linkedVendorsOutcome,
    overdueKrisOutcome,
    onRetryLinkedControls,
    onRetryLinkedVendors,
    onRetryOverdueKris,
    getColor,
    getDisplayName,
    onNavigateToNewKri,
    onNavigateToKri,
    onLinkControl,
    onUnlinkControl,
    onOpenCreateControl,
    onNavigateToControl,
    onNavigateToVendor,
    onRefreshData,
    isLinkDialogOpen,
    setIsLinkDialogOpen,
    dialogMode,
    setDialogMode,
    isCreateDialogOpen,
    setIsCreateDialogOpen,
}: RiskDetailOverviewTabProps) {
    const { t } = useTranslation(['risks', 'common']);
    const { activeControls, draftControls, archivedControls } = groupLinkedControls(linkedControls);
    const canCreateKri = resolveCapabilityFlag(risk.capabilities, 'can_create_kri');
    const canCreateLinkedControl = resolveCapabilityFlag(risk.capabilities, 'can_create_linked_control');
    const canLinkControls = resolveCapabilityFlag(risk.capabilities, 'can_link_controls');
    const canUnlinkControls = resolveCapabilityFlag(risk.capabilities, 'can_unlink_controls');

    return (
        <>
            <RiskAssessmentSection risk={risk} />
            <RiskSummaryCards
                risk={risk}
                activeControlCount={linkedControlsOutcome.kind === 'content'
                    || linkedControlsOutcome.kind === 'empty'
                    || linkedControlsOutcome.kind === 'stale-with-error'
                    ? activeControls.length
                    : null}
                linkedKriCount={risk.kris?.length ?? 0}
                linkedVendorCount={linkedVendorsOutcome.kind === 'content'
                    || linkedVendorsOutcome.kind === 'empty'
                    || linkedVendorsOutcome.kind === 'stale-with-error'
                    ? linkedVendors.length
                    : null}
                getColor={getColor}
                getDisplayName={getDisplayName}
            >
                <SidecarSection
                    className="md:col-span-2 lg:col-span-3"
                    label={t('overview.risk_appetite_indicators', { ns: 'risks' })}
                    outcome={overdueKrisOutcome}
                    onRetry={onRetryOverdueKris}
                    retainChildrenOnFailure
                    testId="risk-overdue-kris-load-state"
                >
                    <RiskKriSection
                        risk={risk}
                        overdueKRIs={overdueKrisOutcome.kind === 'content' || overdueKrisOutcome.kind === 'empty'
                            ? overdueKRIs
                            : []}
                        canCreateKri={canCreateKri}
                        onNavigateToNewKri={onNavigateToNewKri}
                        onNavigateToKri={onNavigateToKri}
                    />
                </SidecarSection>
            </RiskSummaryCards>
            <SidecarSection
                label={t('overview.mitigating_controls', { ns: 'risks' })}
                outcome={linkedControlsOutcome}
                onRetry={onRetryLinkedControls}
                testId="risk-linked-controls-load-state"
            >
                <RiskLinkedControlsSection
                    linkedControls={linkedControls}
                    activeControls={activeControls}
                    draftControls={draftControls}
                    archivedControls={archivedControls}
                    isLinkDialogOpen={isLinkDialogOpen}
                    setIsLinkDialogOpen={setIsLinkDialogOpen}
                    dialogMode={dialogMode}
                    setDialogMode={setDialogMode}
                    isCreateDialogOpen={isCreateDialogOpen}
                    setIsCreateDialogOpen={setIsCreateDialogOpen}
                    onLinkControl={onLinkControl}
                    onUnlinkControl={onUnlinkControl}
                    onOpenCreateControl={onOpenCreateControl}
                    onNavigateToControl={onNavigateToControl}
                    onRefreshData={onRefreshData}
                    canCreateLinkedControl={canCreateLinkedControl}
                    canLinkControls={canLinkControls}
                    canUnlinkControls={canUnlinkControls}
                />
            </SidecarSection>
            <SidecarSection
                label={t('overview.linked_vendors', { ns: 'risks' })}
                outcome={linkedVendorsOutcome}
                onRetry={onRetryLinkedVendors}
                testId="risk-linked-vendors-load-state"
            >
                <RiskLinkedVendorsSection
                    linkedVendors={linkedVendors}
                    onNavigateToVendor={onNavigateToVendor}
                />
            </SidecarSection>
            <RiskRegisterLinksSection
                risk={risk}
                canManageLinks={resolveCapabilityFlag(risk.capabilities, 'can_update')}
            />
            <RiskTimestamps createdAt={risk.created_at} updatedAt={risk.updated_at} />
        </>
    );
}

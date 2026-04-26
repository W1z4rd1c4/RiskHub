import type { OverdueKRI } from '@/types/kri';
import type { ControlEffectiveness, Risk, RiskControlLink } from '@/types/risk';
import type { Vendor } from '@/types/vendor';

import { resolveCapabilityFlag } from '@/lib/capabilities';

import { RiskAssessmentSection } from './detail-overview/RiskAssessmentSection';
import { RiskKriSection } from './detail-overview/RiskKriSection';
import { RiskLinkedControlsSection } from './detail-overview/RiskLinkedControlsSection';
import { RiskLinkedVendorsSection } from './detail-overview/RiskLinkedVendorsSection';
import { RiskSummaryCards } from './detail-overview/RiskSummaryCards';
import { RiskTimestamps } from './detail-overview/RiskTimestamps';
import { groupLinkedControls } from './detail-overview/riskOverviewHelpers';

type DialogMode = 'both' | 'search-only' | 'links-only';

interface RiskDetailOverviewTabProps {
    risk: Risk;
    linkedControls: RiskControlLink[];
    linkedVendors: Vendor[];
    overdueKRIs: OverdueKRI[];
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

export function RiskDetailOverviewTab({
    risk,
    linkedControls,
    linkedVendors,
    overdueKRIs,
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
                activeControlCount={activeControls.length}
                linkedKriCount={risk.kris?.length ?? 0}
                linkedVendorCount={linkedVendors.length}
                getColor={getColor}
                getDisplayName={getDisplayName}
            >
                <RiskKriSection
                    risk={risk}
                    overdueKRIs={overdueKRIs}
                    canCreateKri={canCreateKri}
                    onNavigateToNewKri={onNavigateToNewKri}
                    onNavigateToKri={onNavigateToKri}
                />
            </RiskSummaryCards>
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
            <RiskLinkedVendorsSection
                linkedVendors={linkedVendors}
                onNavigateToVendor={onNavigateToVendor}
            />
            <RiskTimestamps createdAt={risk.created_at} updatedAt={risk.updated_at} />
        </>
    );
}

import { CheckCircle2 } from 'lucide-react';

import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl } from '@/types/vendorLink';

import { VendorLinkedControlCard } from './VendorLinkedControlCard';
import {
    VendorLinkedEntitiesTab,
    type VendorLinkedRegionSummary,
} from './VendorLinkedEntitiesTab';

const controlsAdapter = {
    errorLogPrefix: 'Failed to load linked controls:',
    fetch: (vendorId: number) => vendorLinkApi.getLinkedControls(vendorId),
    isArchived: (control: LinkedControl) => Boolean(control.is_archived),
    link: (vendorId: number, controlId: number, requestReason?: string) =>
        vendorLinkApi.linkControl(vendorId, controlId, requestReason),
    toExistingLink: (control: LinkedControl) => ({
        control_id: control.id,
        display_name: control.name,
        effectiveness: 'linked' as const,
        id: control.id,
    }),
    unlink: (vendorId: number, controlId: number, requestReason?: string) =>
        vendorLinkApi.unlinkControl(vendorId, controlId, requestReason),
};

interface VendorLinkedControlsTabProps {
    vendorId: number;
    canCreateControl: boolean;
    canEdit: boolean;
    protectedChangeRequiresApproval: boolean;
    onAddControl: () => void;
    onNavigateToControl: (controlId: number) => void;
    onCollectionStateChange?: (summary: VendorLinkedRegionSummary) => void;
}

export function VendorLinkedControlsTab({ vendorId, canCreateControl, canEdit, protectedChangeRequiresApproval, onAddControl, onNavigateToControl, onCollectionStateChange }: VendorLinkedControlsTabProps) {
    return (
        <VendorLinkedEntitiesTab
            adapter={controlsAdapter}
            canCreate={canCreateControl}
            canEdit={canEdit}
            protectedChangeRequiresApproval={protectedChangeRequiresApproval}
            headerColorClass="text-foreground"
            i18nKeys={{ addAction: 'links.actions.add_control', archived: 'links.archived_controls', dialogTitle: 'links.dialogs.link_controls_title', empty: 'links.controls.empty', subtitle: 'links.controls.subtitle', tabTitle: 'tabs.linked_controls' }}
            icon={<CheckCircle2 className="h-5 w-5 text-success-text" />}
            linkDialogMode="risk-to-control"
            motionDelay={0.05}
            onAdd={onAddControl}
            onCollectionStateChange={onCollectionStateChange}
            onNavigate={onNavigateToControl}
            renderCard={(control, onClick) => <VendorLinkedControlCard key={control.id} control={control} onClick={onClick} />}
            vendorId={vendorId}
        />
    );
}

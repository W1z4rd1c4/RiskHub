import { CheckCircle2 } from 'lucide-react';

import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedControl } from '@/types/vendorLink';

import { VendorLinkedControlCard } from './VendorLinkedControlCard';
import { VendorLinkedEntitiesTab } from './VendorLinkedEntitiesTab';

const controlsAdapter = {
    errorLogPrefix: 'Failed to load linked controls:',
    fetch: (vendorId: number) => vendorLinkApi.getLinkedControls(vendorId),
    isArchived: (control: LinkedControl) => Boolean(control.is_archived),
    link: (vendorId: number, controlId: number) => vendorLinkApi.linkControl(vendorId, controlId),
    toExistingLink: (control: LinkedControl) => ({
        control_id: control.id,
        display_name: control.name,
        effectiveness: 'linked' as const,
        id: control.id,
    }),
    unlink: (vendorId: number, controlId: number) => vendorLinkApi.unlinkControl(vendorId, controlId),
};

interface VendorLinkedControlsTabProps {
    vendorId: number;
    canCreateControl: boolean;
    canEdit: boolean;
    onAddControl: () => void;
    onNavigateToControl: (controlId: number) => void;
}

export function VendorLinkedControlsTab({ vendorId, canCreateControl, canEdit, onAddControl, onNavigateToControl }: VendorLinkedControlsTabProps) {
    return (
        <VendorLinkedEntitiesTab
            adapter={controlsAdapter}
            canCreate={canCreateControl}
            canEdit={canEdit}
            headerColorClass="text-white"
            i18nKeys={{ addAction: 'links.actions.add_control', archived: 'links.archived_controls', dialogTitle: 'links.dialogs.link_controls_title', empty: 'links.controls.empty', subtitle: 'links.controls.subtitle', tabTitle: 'tabs.linked_controls' }}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            linkDialogMode="risk-to-control"
            motionDelay={0.05}
            onAdd={onAddControl}
            onNavigate={onNavigateToControl}
            renderCard={(control, onClick) => <VendorLinkedControlCard key={control.id} control={control} onClick={onClick} />}
            vendorId={vendorId}
        />
    );
}

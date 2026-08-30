import { Target } from 'lucide-react';

import { KRIGaugeCard } from '@/components/kri/KRIGaugeCard';
import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedKRI } from '@/types/vendorLink';

import {
    VendorLinkedEntitiesTab,
    type VendorLinkedRegionSummary,
} from './VendorLinkedEntitiesTab';

const krisAdapter = {
    errorLogPrefix: 'Failed to load linked KRIs:',
    fetch: (vendorId: number) => vendorLinkApi.getLinkedKRIs(vendorId),
    isArchived: (kri: LinkedKRI) => Boolean(kri.is_archived),
    link: (vendorId: number, kriId: number, requestReason?: string) =>
        vendorLinkApi.linkKRI(vendorId, kriId, requestReason),
    toExistingLink: (kri: LinkedKRI) => ({
        display_name: kri.metric_name,
        effectiveness: 'linked' as const,
        id: kri.id,
        kri_id: kri.id,
    }),
    unlink: (vendorId: number, kriId: number, requestReason?: string) =>
        vendorLinkApi.unlinkKRI(vendorId, kriId, requestReason),
};

interface VendorLinkedKRIsTabProps {
    vendorId: number;
    canCreateKri: boolean;
    canEdit: boolean;
    protectedChangeRequiresApproval: boolean;
    onAddKri: () => void;
    onNavigateToKri: (kriId: number) => void;
    onCollectionStateChange?: (summary: VendorLinkedRegionSummary) => void;
}

export function VendorLinkedKRIsTab({ vendorId, canCreateKri, canEdit, protectedChangeRequiresApproval, onAddKri, onNavigateToKri, onCollectionStateChange }: VendorLinkedKRIsTabProps) {
    return (
        <VendorLinkedEntitiesTab
            adapter={krisAdapter}
            addButtonTestId="vendor-linked-kris-add-kri"
            canCreate={canCreateKri}
            canEdit={canEdit}
            protectedChangeRequiresApproval={protectedChangeRequiresApproval}
            dataTestIdPrefix="vendor-linked-kris"
            headerColorClass="text-foreground"
            i18nKeys={{ addAction: 'links.actions.add_kri', archived: 'links.archived_kris', dialogTitle: 'links.dialogs.link_kris_title', empty: 'links.kris.empty', subtitle: 'links.kris.subtitle', tabTitle: 'tabs.linked_kris' }}
            icon={<Target className="h-5 w-5 text-warning-text" />}
            linkDialogMode="vendor-to-kri"
            motionDelay={0.1}
            onAdd={onAddKri}
            onCollectionStateChange={onCollectionStateChange}
            onNavigate={onNavigateToKri}
            renderCard={(kri, onClick) => <KRIGaugeCard key={kri.id} kri={kri} onClick={onClick} />}
            vendorId={vendorId}
        />
    );
}

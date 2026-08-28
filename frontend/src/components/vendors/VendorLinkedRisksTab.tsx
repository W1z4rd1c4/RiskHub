import { Link as LinkIcon } from 'lucide-react';

import { vendorLinkApi } from '@/services/vendorLinkApi';
import type { LinkedRisk } from '@/types/vendorLink';

import { VendorLinkedEntitiesTab } from './VendorLinkedEntitiesTab';
import { VendorLinkedRiskCard } from './VendorLinkedRiskCard';

const risksAdapter = {
    errorLogPrefix: 'Failed to load linked risks:',
    fetch: (vendorId: number) => vendorLinkApi.getLinkedRisks(vendorId),
    isArchived: (risk: LinkedRisk) => Boolean(risk.is_archived),
    link: (vendorId: number, riskId: number, requestReason?: string) =>
        vendorLinkApi.linkRisk(vendorId, riskId, requestReason),
    toExistingLink: (risk: LinkedRisk) => ({
        control_id: undefined,
        display_name: `${risk.risk_id_code}: ${risk.name}`,
        effectiveness: 'linked' as const,
        id: risk.id,
        risk_id: risk.id,
    }),
    unlink: (vendorId: number, riskId: number, requestReason?: string) =>
        vendorLinkApi.unlinkRisk(vendorId, riskId, requestReason),
};

interface VendorLinkedRisksTabProps {
    vendorId: number;
    canCreateRisk: boolean;
    canEdit: boolean;
    protectedChangeRequiresApproval: boolean;
    onAddRisk: () => void;
    onNavigateToRisk: (riskId: number) => void;
}

export function VendorLinkedRisksTab({ vendorId, canCreateRisk, canEdit, protectedChangeRequiresApproval, onAddRisk, onNavigateToRisk }: VendorLinkedRisksTabProps) {
    return (
        <VendorLinkedEntitiesTab
            adapter={risksAdapter}
            canCreate={canCreateRisk}
            canEdit={canEdit}
            protectedChangeRequiresApproval={protectedChangeRequiresApproval}
            headerColorClass="text-foreground"
            i18nKeys={{ addAction: 'links.actions.add_risk', archived: 'links.archived_risks', dialogTitle: 'links.dialogs.link_risks_title', empty: 'links.risks.empty', subtitle: 'links.risks.subtitle', tabTitle: 'tabs.linked_risks' }}
            icon={<LinkIcon className="h-5 w-5 text-accent-text" />}
            linkDialogMode="control-to-risk"
            onAdd={onAddRisk}
            onNavigate={onNavigateToRisk}
            renderCard={(risk, onClick) => <VendorLinkedRiskCard key={risk.id} risk={risk} onClick={onClick} />}
            vendorId={vendorId}
        />
    );
}

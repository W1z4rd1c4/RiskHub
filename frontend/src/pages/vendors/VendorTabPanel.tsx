import { useNavigate } from 'react-router-dom';

import { VendorAssessmentsTab } from '@/components/vendors/VendorAssessmentsTab';
import { VendorContractControlsTab } from '@/components/vendors/VendorContractControlsTab';
import { VendorDependenciesTab } from '@/components/vendors/VendorDependenciesTab';
import { VendorIncidentsTab } from '@/components/vendors/VendorIncidentsTab';
import { VendorLinkedControlsTab } from '@/components/vendors/VendorLinkedControlsTab';
import { VendorLinkedRisksTab } from '@/components/vendors/VendorLinkedRisksTab';
import { VendorRemediationTab } from '@/components/vendors/VendorRemediationTab';
import { VendorResilienceTab } from '@/components/vendors/VendorResilienceTab';
import { VendorRiskFactorsTab } from '@/components/vendors/VendorRiskFactorsTab';
import { VendorScheduleTab } from '@/components/vendors/VendorScheduleTab';
import { VendorSignalsTab } from '@/components/vendors/VendorSignalsTab';
import { VendorSLATab } from '@/components/vendors/VendorSLATab';
import type { Vendor } from '@/types/vendor';

import type { VendorTabView } from './vendorDetailPresentation';

interface VendorTabPanelProps {
    activeTab: VendorTabView;
    canEdit: boolean;
    canEditContractControls: boolean;
    vendor: Vendor;
}

export function VendorTabPanel({
    activeTab,
    canEdit,
    canEditContractControls,
    vendor,
}: VendorTabPanelProps) {
    const navigate = useNavigate();

    if (activeTab === 'risk_factors') {
        return <VendorRiskFactorsTab vendorId={vendor.id} canEdit={canEdit} />;
    }

    if (activeTab === 'linked_risks') {
        return (
            <VendorLinkedRisksTab
                vendorId={vendor.id}
                canEdit={canEdit}
                onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
            />
        );
    }

    if (activeTab === 'linked_controls') {
        return (
            <VendorLinkedControlsTab
                vendorId={vendor.id}
                canEdit={canEdit}
                onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
            />
        );
    }

    if (activeTab === 'assessments') {
        return <VendorAssessmentsTab vendor={vendor} canEdit={canEdit} />;
    }

    if (activeTab === 'schedule') {
        return <VendorScheduleTab vendorId={vendor.id} canEdit={canEdit} />;
    }

    if (activeTab === 'contract_controls') {
        return (
            <VendorContractControlsTab
                vendorId={vendor.id}
                canEdit={canEditContractControls}
            />
        );
    }

    if (activeTab === 'resilience') {
        return <VendorResilienceTab vendorId={vendor.id} canEdit={canEdit} />;
    }

    if (activeTab === 'dependencies') {
        return <VendorDependenciesTab vendor={vendor} canEdit={canEdit} />;
    }

    if (activeTab === 'incidents') {
        return <VendorIncidentsTab vendorId={vendor.id} canEdit={canEdit} />;
    }

    if (activeTab === 'remediation') {
        return <VendorRemediationTab vendorId={vendor.id} canEdit={canEdit} />;
    }

    if (activeTab === 'sla') {
        return <VendorSLATab vendorId={vendor.id} canEditVendor={canEdit} />;
    }

    return <VendorSignalsTab vendorId={vendor.id} canRefresh={canEdit} />;
}

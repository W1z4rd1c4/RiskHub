import { useNavigate } from 'react-router-dom';

import { VendorAssessmentsTab } from '@/components/vendors/VendorAssessmentsTab';
import { VendorContractControlsTab } from '@/components/vendors/VendorContractControlsTab';
import { VendorDependenciesTab } from '@/components/vendors/VendorDependenciesTab';
import { VendorIncidentsTab } from '@/components/vendors/VendorIncidentsTab';
import { VendorRemediationTab } from '@/components/vendors/VendorRemediationTab';
import { VendorResilienceTab } from '@/components/vendors/VendorResilienceTab';
import { VendorScheduleTab } from '@/components/vendors/VendorScheduleTab';
import { VendorSignalsTab } from '@/components/vendors/VendorSignalsTab';
import { VendorSLATab } from '@/components/vendors/VendorSLATab';
import type { Vendor } from '@/types/vendor';

import { VendorOverviewTab } from './VendorOverviewTab';
import { VendorSectionStack } from './VendorSectionStack';
import type { VendorSectionView, VendorTabView } from './vendorDetailPresentation';

interface VendorTabPanelProps {
    activeSection: VendorSectionView;
    activeTab: VendorTabView;
    canEdit: boolean;
    canEditContractControls: boolean;
    onSelectSection: (section: VendorSectionView) => void;
    vendor: Vendor;
}

export function VendorTabPanel({
    activeSection,
    activeTab,
    canEdit,
    canEditContractControls,
    onSelectSection,
    vendor,
}: VendorTabPanelProps) {
    const navigate = useNavigate();

    if (activeTab === 'overview') {
        return (
            <VendorOverviewTab
                activeSection={activeSection}
                canEdit={canEdit}
                onNavigateToControl={(controlId) => navigate(`/controls/${controlId}`)}
                onNavigateToRisk={(riskId) => navigate(`/risks/${riskId}`)}
                onSelectSection={onSelectSection}
                vendor={vendor}
            />
        );
    }

    if (activeTab === 'assessments') {
        return (
            <VendorSectionStack
                activeSection={activeSection}
                onSelectSection={onSelectSection}
                sections={[
                    {
                        id: 'assessments',
                        labelKey: 'tabs.assessments',
                        content: <VendorAssessmentsTab vendor={vendor} canEdit={canEdit} />,
                    },
                    {
                        id: 'schedule',
                        labelKey: 'tabs.schedule',
                        content: <VendorScheduleTab vendorId={vendor.id} canEdit={canEdit} />,
                    },
                ]}
            />
        );
    }

    if (activeTab === 'assurance') {
        return (
            <VendorSectionStack
                activeSection={activeSection}
                onSelectSection={onSelectSection}
                sections={[
                    {
                        id: 'contract_controls',
                        labelKey: 'tabs.contract_controls',
                        content: (
                            <VendorContractControlsTab
                                vendorId={vendor.id}
                                canEdit={canEditContractControls}
                            />
                        ),
                    },
                    {
                        id: 'resilience',
                        labelKey: 'tabs.resilience',
                        content: <VendorResilienceTab vendorId={vendor.id} canEdit={canEdit} />,
                    },
                ]}
            />
        );
    }

    if (activeTab === 'operations') {
        return (
            <VendorSectionStack
                activeSection={activeSection}
                onSelectSection={onSelectSection}
                sections={[
                    {
                        id: 'sla',
                        labelKey: 'tabs.sla',
                        content: <VendorSLATab vendorId={vendor.id} canEditVendor={canEdit} />,
                    },
                    {
                        id: 'incidents',
                        labelKey: 'tabs.incidents',
                        content: <VendorIncidentsTab vendorId={vendor.id} canEdit={canEdit} />,
                    },
                    {
                        id: 'remediation',
                        labelKey: 'tabs.remediation',
                        content: <VendorRemediationTab vendorId={vendor.id} canEdit={canEdit} />,
                    },
                ]}
            />
        );
    }

    return (
        <VendorSectionStack
            activeSection={activeSection}
            onSelectSection={onSelectSection}
            sections={[
                {
                    id: 'dependencies',
                    labelKey: 'tabs.dependencies',
                    content: <VendorDependenciesTab vendor={vendor} canEdit={canEdit} />,
                },
                {
                    id: 'signals',
                    labelKey: 'tabs.signals',
                    content: <VendorSignalsTab vendorId={vendor.id} canRefresh={canEdit} />,
                },
            ]}
        />
    );
}

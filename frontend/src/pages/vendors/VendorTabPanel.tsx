import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import type { Vendor } from '@/types/vendor';

const VendorAssessmentsTab = React.lazy(() => import('@/components/vendors/VendorAssessmentsTab').then(m => ({ default: m.VendorAssessmentsTab })));
const VendorContractControlsTab = React.lazy(() => import('@/components/vendors/VendorContractControlsTab').then(m => ({ default: m.VendorContractControlsTab })));
const VendorDependenciesTab = React.lazy(() => import('@/components/vendors/VendorDependenciesTab').then(m => ({ default: m.VendorDependenciesTab })));
const VendorIncidentsTab = React.lazy(() => import('@/components/vendors/VendorIncidentsTab').then(m => ({ default: m.VendorIncidentsTab })));
const VendorRemediationTab = React.lazy(() => import('@/components/vendors/VendorRemediationTab').then(m => ({ default: m.VendorRemediationTab })));
const VendorResilienceTab = React.lazy(() => import('@/components/vendors/VendorResilienceTab').then(m => ({ default: m.VendorResilienceTab })));
const VendorScheduleTab = React.lazy(() => import('@/components/vendors/VendorScheduleTab').then(m => ({ default: m.VendorScheduleTab })));
const VendorSignalsTab = React.lazy(() => import('@/components/vendors/VendorSignalsTab').then(m => ({ default: m.VendorSignalsTab })));
const VendorSLATab = React.lazy(() => import('@/components/vendors/VendorSLATab').then(m => ({ default: m.VendorSLATab })));

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

    const renderContent = () => {
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
    };

    return (
        <Suspense fallback={
            <div className="flex justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
        }>
            {renderContent()}
        </Suspense>
    );
}

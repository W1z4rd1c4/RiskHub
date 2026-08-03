import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@/index.css';
import '@/i18n';

import { ExecutionHistory } from '@/components/executions/ExecutionHistory';
import { GovernedMutationReasonDialog } from '@/components/approvals/GovernedMutationReasonDialog';
import { KRIFormContainer } from '@/components/kri-form/KRIFormContainer';
import { KRIModal } from '@/components/kri/KRIModal';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';
import { DepartmentsPanel } from '@/components/riskhub/DepartmentsPanel';
import { RolesPanel } from '@/components/riskhub/RolesPanel';
import { RiskTypesPanel } from '@/components/riskhub/RiskTypesPanel';
import { RiskDetailQuestionnairesTab } from '@/components/risks/RiskDetailQuestionnairesTab';
import { RiskLinkedControlsSection } from '@/components/risks/detail-overview/RiskLinkedControlsSection';
import { VendorLinkedEntitiesTab } from '@/components/vendors/VendorLinkedEntitiesTab';
import type { VendorLinkedEntitiesAdapter } from '@/components/vendors/useVendorLinkedEntities';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AssetLinkSections } from '@/pages/assets/AssetLinkSections';
import { ControlDetailOverviewTab } from '@/pages/controls/ControlDetailOverviewTab';
import { VendorContractsSection } from '@/pages/vendors/VendorContractsSection';
import { DashboardRiskSections } from '@/pages/dashboard/DashboardRiskSections';
import { ContextualIssueAction } from '@/pages/detail/ContextualIssueAction';
import type { Asset } from '@/types/asset';
import type { Control, ControlRiskLink } from '@/types/control';
import type { KeyRiskIndicator } from '@/types/kri';
import type { Risk, RiskControlLink } from '@/types/risk';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const riskFixture = {
  id: 1,
  name: 'Authentication Drift',
  category: 'IT',
  process: 'User Authentication',
  description: 'Risk of access control drift.',
  gross_score: 12,
  gross_probability: 3,
  gross_impact: 4,
  net_score: 6,
  net_probability: 2,
  net_impact: 3,
  risk_type: 'operational',
  updated_at: '2026-02-01T00:00:00Z',
  owner: { id: 9, name: 'Ada Owner', email: 'ada@example.test' },
  department: { id: 1, name: 'IT' },
  capabilities: {
    can_send_questionnaire: true,
  },
} as unknown as Risk;

const kriFixture = {
  id: 1,
  risk_id: 1,
  metric_name: 'System uptime',
  description: 'Uptime KRI',
  current_value: 99,
  lower_limit: 90,
  upper_limit: 100,
  unit: '%',
  last_period_end: null,
  capabilities: null,
} as unknown as KeyRiskIndicator;

const controlFixture = {
  id: 1,
  name: 'Access Control Review',
  description: 'Quarterly access review.',
  control_form: 'preventive',
  frequency: 'quarterly',
  risk_level: 3,
  status: 'active',
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  capabilities: { can_link_risk: true, can_unlink_risk: true },
} as unknown as Control;

const linkedRiskFixture = {
  id: 11,
  control_id: 1,
  risk_id: 1,
  effectiveness: 'high',
  risk: riskFixture,
} as unknown as ControlRiskLink;

const linkedControlFixture = {
  id: 12,
  control_id: 1,
  risk_id: 1,
  effectiveness: 'high',
  created_at: '2026-01-01T00:00:00Z',
  control: controlFixture,
} as unknown as RiskControlLink;

const assetFixture = {
  id: 1,
  name: 'Claims Platform',
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Asset;

function LinkManagementOwner() {
  return (
    <LinkManagementDialog
      isOpen
      onClose={() => {}}
      mode="risk-to-control"
      existingLinks={[{ id: 1, control_id: 1, control: controlFixture, effectiveness: 'high', notes: 'Existing mitigation' }]}
      onLink={async () => {}}
      onUnlink={async () => {}}
      showSearch={false}
    />
  );
}

function KriModalOwner() {
  return (
    <KRIModal
      risk_id={1}
      kri={kriFixture}
      isOpen
      onClose={() => {}}
      onDelete={async () => {}}
      onSave={async () => ({ kind: 'updated' })}
    />
  );
}

function RiskLinkedControlsOwner() {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'both' | 'search-only' | 'links-only'>('both');
  return (
    <RiskLinkedControlsSection
      linkedControls={[linkedControlFixture]}
      activeControls={[linkedControlFixture]}
      draftControls={[]}
      archivedControls={[]}
      isLinkDialogOpen={isLinkOpen}
      setIsLinkDialogOpen={setIsLinkOpen}
      dialogMode={dialogMode}
      setDialogMode={setDialogMode}
      isCreateDialogOpen={isCreateOpen}
      setIsCreateDialogOpen={setIsCreateOpen}
      onLinkControl={async () => {}}
      onUnlinkControl={async () => {}}
      onOpenCreateControl={() => setIsCreateOpen(true)}
      onNavigateToControl={() => {}}
      onRefreshData={() => {}}
      canCreateLinkedControl
      canLinkControls
      canUnlinkControls
    />
  );
}

type VendorEntity = { id: number; name: string; is_archived: boolean };

function VendorLinkedOwner() {
  const adapter = useMemo<VendorLinkedEntitiesAdapter<VendorEntity>>(() => ({
    fetch: async () => [{ id: 1, name: 'Uptime KRI', is_archived: false }],
    link: async () => {},
    unlink: async () => {},
    isArchived: (item) => item.is_archived,
    toExistingLink: (item) => ({ id: item.id, kri_id: item.id, kri: { id: item.id, metric_name: item.name }, effectiveness: 'high' }),
    errorLogPrefix: 'dialog contract vendor fixture',
  }), []);
  return (
    <VendorLinkedEntitiesTab
      vendorId={1}
      adapter={adapter}
      canCreate
      canEdit
      onAdd={() => {}}
      renderCard={(item) => <button key={item.id} type="button">{item.name}</button>}
      onNavigate={() => {}}
      icon={<span aria-hidden="true">K</span>}
      headerColorClass="text-accent"
      i18nKeys={{
        tabTitle: 'links.kris.title',
        subtitle: 'links.kris.subtitle',
        empty: 'links.kris.empty',
        archived: 'links.kris.archived',
        dialogTitle: 'links.kris.dialog_title',
        addAction: 'links.kris.add',
      }}
      linkDialogMode="vendor-to-kri"
      dataTestIdPrefix="vendor-linked-kris"
    />
  );
}

function ControlOverviewOwner() {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);
  return (
    <ControlDetailOverviewTab
      control={controlFixture}
      t={(key) => key}
      linkedRisks={[linkedRiskFixture]}
      activeLinkedRisks={[linkedRiskFixture]}
      archivedLinkedRisks={[]}
      canLinkRisk
      canUnlinkRisk
      linkErrorKey={null}
      linkedRisksErrorKey={null}
      isLinkDialogOpen={isLinkOpen}
      selectedRisk={selectedRisk}
      isRiskModalOpen={selectedRisk !== null}
      onOpenLinkDialog={() => setIsLinkOpen(true)}
      onCloseLinkDialog={() => setIsLinkOpen(false)}
      onLinkRisk={async () => {}}
      onUnlinkRisk={async () => {}}
      onRiskClick={() => setSelectedRisk(riskFixture)}
      onCloseRiskModal={() => setSelectedRisk(null)}
    />
  );
}

function DashboardOwner() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <DashboardRiskSections
      breachHistoryTitle="Breach history"
      breachTrends={[]}
      canUseDepartmentFilter={false}
      controlExecutionTitle="Execution"
      departmentMetrics={[]}
      departmentVisibilityTitle="Departments"
      grossDistribution={{ distribution: [{ probability: 4, impact: 4, count: 1 }] }}
      grossMatrixTitle="Gross risk"
      historicalTitle="History"
      netDistribution={null}
      netMatrixTitle="Net risk"
      noExecutionHistoryLabel="No history"
      onGrossCellClick={() => setIsOpen(true)}
      onNetCellClick={() => setIsOpen(true)}
      onRiskModalClose={() => setIsOpen(false)}
      riskCreationTitle="Risk creation"
      riskModal={{ impact: 4, isOpen, probability: 4, riskType: 'gross' }}
      riskTrends={[]}
      trends={[]}
    />
  );
}

function ContextualIssueOwner() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ContextualIssueAction
      buttonLabel="New issue"
      canCreateIssue
      contextEntityId={1}
      contextEntityLabel="Authentication Drift"
      contextEntityType="risk"
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onCreated={() => {}}
      onOpen={() => setIsOpen(true)}
    />
  );
}

function GovernedMutationReasonOwner() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open governed mutation reason</button>
      <GovernedMutationReasonDialog
        isOpen={isOpen}
        kind="link_remove"
        onClose={() => setIsOpen(false)}
        onConfirm={() => setIsOpen(false)}
      />
    </>
  );
}

function OwnerSurface({ siteId }: { siteId: string }) {
  switch (siteId) {
    case 'confirm.link-management': return <LinkManagementOwner />;
    case 'issue.execution-history': return <ExecutionHistory controlId={1} controlName="Access Control Review" canCreateIssue />;
    case 'mismatch.kri-form': return <KRIFormContainer initialData={{ risk_id: 1, metric_name: 'Uptime', description: 'Availability', current_value: 99, lower_limit: 90, upper_limit: 100, unit: '%', frequency: 'monthly' }} vendorContext={{ vendorId: 1, vendorName: 'Cloud Vendor', returnTo: '/vendors/1' }} />;
    case 'confirm.kri-modal': return <KriModalOwner />;
    case 'role-modal.roles-panel':
    case 'role-delete.roles-panel': return <RolesPanel />;
    case 'questionnaire.risk-detail-tab': return <RiskDetailQuestionnairesTab risk={riskFixture} />;
    case 'link.risk-linked-controls':
    case 'control-create.risk-linked-controls': return <RiskLinkedControlsOwner />;
    case 'link.vendor-linked-entities': return <VendorLinkedOwner />;
    case 'confirm.asset-links': return <AssetLinkSections asset={assetFixture} canManageLinks />;
    case 'confirm.vendor-contracts': return (
      <VendorContractsSection vendorId={1} canManageContracts protectedChangeRequiresApproval />
    );
    case 'link.control-overview':
    case 'risk-view.control-overview': return <ControlOverviewOwner />;
    case 'risk-drilldown.dashboard': return <DashboardOwner />;
    case 'issue.contextual-action': return <ContextualIssueOwner />;
    case 'confirm.governed-mutation-reason': return <GovernedMutationReasonOwner />;
    case 'inline.departments-delete':
    case 'frame.departments': return <DepartmentsPanel />;
    case 'inline.risk-types-delete':
    case 'frame.risk-types': return <RiskTypesPanel />;
    case 'frame.approval-scenarios': return <ApprovalScenariosPanel />;
    default: throw new Error(`No owning component harness for ${siteId}`);
  }
}

function Harness() {
  const params = new URLSearchParams(window.location.search);
  const siteId = params.get('site') ?? '';
  return (
    <main className="min-h-screen p-8" data-testid="dialog-owner-ready" data-render-site={siteId}>
      <OwnerSurface siteId={siteId} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <DashboardFilterProvider>
              <Harness />
            </DashboardFilterProvider>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

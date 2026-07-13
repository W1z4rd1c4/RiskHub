import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@/index.css';
import '@/i18n';

import { AccessEditModal } from '@/components/access/AccessEditModal';
import { ArchiveConfirmDialog } from '@/components/ArchiveConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ControlCreateDialog } from '@/components/ControlCreateDialog';
import { RiskDrilldownModal } from '@/components/dashboard/RiskDrilldownModal';
import { ExecutionLogModal } from '@/components/executions/ExecutionLogModal';
import { OrphanQuickViewModal } from '@/components/governance/OrphanQuickViewModal';
import { ResolveOrphanModal } from '@/components/governance/ResolveOrphanModal';
import { IssueQuickCreateModal } from '@/components/issues/IssueQuickCreateModal';
import { KriMismatchDialog } from '@/components/kri-form/KriMismatchDialog';
import { KRIHistoryEditModal } from '@/components/kri/KRIHistoryEditModal';
import { KRIModal } from '@/components/kri/KRIModal';
import { KRIValueModal } from '@/components/kri/KRIValueModal';
import { LinkManagementDialog } from '@/components/LinkManagementDialog';
import { ExportDialog } from '@/components/reports/ExportDialog';
import { ApprovalScenariosPanel } from '@/components/riskhub/ApprovalScenariosPanel';
import { DepartmentsPanel } from '@/components/riskhub/DepartmentsPanel';
import { RiskTypesPanel } from '@/components/riskhub/RiskTypesPanel';
import { RoleDeleteDialog } from '@/components/riskhub/roles/RoleDeleteDialog';
import { RoleModal } from '@/components/riskhub/roles/RoleModal';
import { RiskQuestionnaireDetail } from '@/components/risks/risk-questionnaire-detail/RiskQuestionnaireDetailContainer';
import { RiskQuickViewModal } from '@/components/RiskQuickViewModal';
import { ADUserPicker } from '@/components/users/ADUserPicker';
import { AuthProvider } from '@/contexts/AuthContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { useTranslation } from '@/i18n/hooks';
import { AuditDetailsModal } from '@/pages/admin-console/sections/audit/AuditDetailsModal';
import { ApprovalResolutionDialog } from '@/pages/approvals/ApprovalResolutionDialog';
import { BreakGlassEnableDialog } from '@/pages/users/BreakGlassEnableDialog';
import type { ApprovalRequest } from '@/types/approval';
import type { AccessUserRead } from '@/types/access';
import type { KeyRiskIndicator, KRIHistoryEntry } from '@/types/kri';
import type { OrphanedItem } from '@/types/orphanedItem';
import type { Risk } from '@/types/risk';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const roleFixture = {
  id: 1,
  name: 'auditor',
  display_name: 'Auditor',
  description: 'Read-only auditor role',
  is_system: false,
  is_active: true,
  user_count: 0,
  permissions: [],
};

const accessUserFixture = {
  id: 1,
  email: 'ada@example.test',
  name: 'Ada Lovelace',
  is_active: true,
  role_id: 1,
  role: { id: 1, name: 'auditor', display_name: 'Auditor', description: null },
  department_id: 1,
  department_name: 'IT',
  manager_id: null,
  manager_name: null,
  access_scope: 'department',
  scope_label: 'Department',
  effective_permissions: [],
  capabilities: {
    can_edit_identity: false,
    can_edit_business_access: true,
    can_edit_role: false,
    can_deactivate: false,
    can_change_active_status: false,
    can_break_glass_enable: true,
    can_revoke_sessions: false,
  },
} as unknown as AccessUserRead;

const approvalFixture = {
  id: 1,
  resource_type: 'risk',
  resource_id: 1,
  resource_name: 'Authentication Drift',
  action_type: 'update',
  pending_changes: null,
  status: 'pending',
  reason: 'needs review',
  requested_by_id: 2,
  requested_by_name: 'Jo Requester',
  requested_by_email: 'jo@example.test',
  resolved_by_id: null,
  resolved_by_name: null,
  resolved_at: null,
  resolution_notes: null,
  created_at: '2026-02-01T00:00:00Z',
  can_approve: true,
  can_reject: true,
} as unknown as ApprovalRequest;

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

const kriHistoryFixture = {
  id: 1,
  kri_id: 1,
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  recorded_at: '2026-02-01T00:00:00Z',
  value: 95,
  lower_limit: 90,
  upper_limit: 100,
  unit: '%',
  breach_status: 'within',
} as KRIHistoryEntry;

const orphanFixture: OrphanedItem = {
  id: 1,
  item_type: 'risk',
  item_id: 1,
  item_name: 'Authentication Drift',
  item_description: null,
  item_identifier: null,
  department_name: 'IT',
  previous_owner_name: 'Jo Owner',
  previous_owner_email: 'jo@example.test',
  orphaned_at: '2026-02-01T00:00:00Z',
  status: 'pending',
  capabilities: {
    can_resolve: true,
    can_view_detail: true,
    requires_department: false,
    requires_owner: true,
    requires_risk: false,
  },
};

const questionnaireFixtureRisk = riskFixture;

function ApprovalSurface({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['approvals', 'common']);
  return (
    <ApprovalResolutionDialog
      selectedApproval={approvalFixture}
      dialogMode="approve"
      resolutionNotes="Ready for approval"
      isSubmitting={false}
      onClose={onClose}
      onResolve={() => {}}
      onResolutionNotesChange={() => {}}
      t={t}
    />
  );
}

function linkModeForSite(siteId: string) {
  if (siteId.includes('vendor')) return 'vendor-to-kri' as const;
  if (siteId.includes('control-overview')) return 'control-to-risk' as const;
  return 'risk-to-control' as const;
}

function DirectSurface({ component, siteId, onClose }: { component: string; siteId: string; onClose: () => void }) {
  switch (component) {
    case 'ConfirmDialog':
      return <ConfirmDialog isOpen onClose={onClose} onConfirm={() => {}} title={siteId} message="This action requires confirmation." />;
    case 'ArchiveConfirmDialog':
      return <ArchiveConfirmDialog isOpen onClose={onClose} onConfirm={async () => {}} resourceType="control" resourceName="Access Control Review" />;
    case 'KriMismatchDialog':
      return <KriMismatchDialog isSubmitting={false} onCancel={onClose} onContinueWithoutLinking={() => {}} onLinkRiskAndContinue={() => {}} />;
    case 'RoleDeleteDialog':
      return <RoleDeleteDialog role={roleFixture} onCancel={onClose} onConfirm={() => {}} />;
    case 'RoleModal':
      return <RoleModal isOpen role={null} allPermissions={[]} permissionsLoading={false} onClose={onClose} onSave={async () => {}} />;
    case 'AuditDetailsModal':
      return <AuditDetailsModal extra={{ action: siteId, field: 'name' }} onClose={onClose} />;
    case 'BreakGlassEnableDialog':
      return <BreakGlassEnableDialog breakGlassHours={4} breakGlassReason="" breakGlassUser={accessUserFixture} isBreakGlassSubmitting={false} onClose={onClose} onReasonChange={() => {}} onSubmit={() => {}} onHoursChange={() => {}} />;
    case 'IssueQuickCreateModal':
      return <IssueQuickCreateModal isOpen onClose={onClose} contextEntityType="risk" contextEntityId={1} contextEntityLabel={siteId} onCreated={() => {}} />;
    case 'ApprovalResolutionDialog':
      return <ApprovalSurface onClose={onClose} />;
    case 'ExportDialog':
      return <ExportDialog isOpen onClose={onClose} onSubmit={async () => {}} title={siteId} />;
    case 'RiskQuickViewModal':
      return <RiskQuickViewModal isOpen onClose={onClose} risk={riskFixture} />;
    case 'ExecutionLogModal':
      return <ExecutionLogModal isOpen onClose={onClose} controlId={1} controlName="Access Control Review" />;
    case 'KRIValueModal':
      return <KRIValueModal isOpen onClose={onClose} onSuccess={() => {}} kri={kriFixture} />;
    case 'KRIHistoryEditModal':
      return <KRIHistoryEditModal isOpen onClose={onClose} onSuccess={() => {}} kriId={1} entry={kriHistoryFixture} />;
    case 'RiskDrilldownModal':
      return <RiskDrilldownModal isOpen onClose={onClose} probability={4} impact={4} />;
    case 'OrphanQuickViewModal':
      return <OrphanQuickViewModal isOpen onClose={onClose} orphan={orphanFixture} />;
    case 'ResolveOrphanModal':
      return <ResolveOrphanModal isOpen onClose={onClose} orphan={orphanFixture} onResolved={() => {}} />;
    case 'KRIModal':
      return <KRIModal risk_id={1} kri={null} isOpen onClose={onClose} onSave={async () => ({ kind: 'updated' })} />;
    case 'AccessEditModal':
      return <AccessEditModal isOpen onClose={onClose} user={accessUserFixture} onSaved={() => {}} />;
    case 'RiskQuestionnaireDetail':
      return <RiskQuestionnaireDetail isOpen onClose={onClose} questionnaireId={1} risk={questionnaireFixtureRisk} />;
    case 'LinkManagementDialog':
      return <LinkManagementDialog isOpen onClose={onClose} mode={linkModeForSite(siteId)} existingLinks={[]} onLink={async () => {}} onUnlink={async () => {}} />;
    case 'ADUserPicker':
      return <ADUserPicker isOpen onClose={onClose} onImported={() => {}} />;
    case 'ControlCreateDialog':
      return <ControlCreateDialog isOpen onClose={onClose} onSuccess={() => {}} />;
    default:
      throw new Error(`No direct dialog harness for ${component} (${siteId})`);
  }
}

function PanelSurface({ siteId }: { siteId: string }) {
  if (siteId.includes('approval-scenarios')) return <ApprovalScenariosPanel />;
  if (siteId.includes('risk-types')) return <RiskTypesPanel />;
  return <DepartmentsPanel />;
}

function Harness() {
  const params = new URLSearchParams(window.location.search);
  const siteId = params.get('site') ?? '';
  const component = params.get('component') ?? '';
  const panel = component === 'DepartmentsPanel' || component === 'RiskTypesPanel' || component === 'RiskHubModalFrame';
  const [open, setOpen] = useState(false);
  let content: ReactNode;

  if (panel) {
    content = <PanelSurface siteId={siteId} />;
  } else {
    content = (
      <>
        <button type="button" data-testid="dialog-contract-opener" onClick={() => setOpen(true)}>
          Open surface
        </button>
        {open ? <DirectSurface component={component} siteId={siteId} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }

  return <main className="min-h-screen p-8">{content}</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <DashboardFilterProvider>
            <Harness />
          </DashboardFilterProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

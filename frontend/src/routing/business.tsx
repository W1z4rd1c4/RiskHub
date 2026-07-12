import { lazy } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Command,
  Handshake,
  Landmark,
  Scale,
  Server,
  ShieldAlert,
  ShieldCheck,
  Target,
  Workflow,
} from 'lucide-react';

import {
  ActivityLogRouteGuard,
  AuditTrailRouteGuard,
  GovernanceRouteGuard,
} from '@/authz/BusinessRouteGuards';
import type { AppRouteDef } from './types';

const ApprovalsPage = lazy(() => import('@/pages/ApprovalsPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const ControlsPage = lazy(() => import('@/pages/ControlsPage'));
const ControlDetailPage = lazy(() => import('@/pages/ControlDetailPage'));
const ControlNewPage = lazy(() => import('@/pages/ControlNewPage'));
const ControlEditPage = lazy(() => import('@/pages/ControlEditPage'));
const RisksPage = lazy(() => import('@/pages/RisksPage'));
const RiskDetailPage = lazy(() => import('@/pages/RiskDetailPage'));
const RiskNewPage = lazy(() => import('@/pages/RiskNewPage'));
const RiskEditPage = lazy(() => import('@/pages/RiskEditPage'));
const IssuesPage = lazy(() => import('@/pages/IssuesPage'));
const IssueNewPage = lazy(() => import('@/pages/IssueNewPage'));
const IssueDetailPage = lazy(() => import('@/pages/IssueDetailPage'));
const KRIsPage = lazy(() => import('@/pages/KRIsPage'));
const KRINewPage = lazy(() => import('@/pages/KRINewPage'));
const KRIDetailPage = lazy(() => import('@/pages/KRIDetailPage'));
const DepartmentsPage = lazy(() => import('@/pages/DepartmentsPage'));
const DepartmentDetailPage = lazy(() => import('@/pages/DepartmentDetailPage'));
const VendorsPage = lazy(() => import('@/pages/VendorsPage'));
const VendorDetailPage = lazy(() => import('@/pages/VendorDetailPage'));
const ProcessesPage = lazy(() => import('@/pages/ProcessesPage'));
const ProcessDetailPage = lazy(() => import('@/pages/ProcessDetailPage'));
const AssetsPage = lazy(() => import('@/pages/AssetsPage'));
const AssetDetailPage = lazy(() => import('@/pages/AssetDetailPage'));
const ThreatsPage = lazy(() => import('@/pages/ThreatsPage'));
const ThreatDetailPage = lazy(() => import('@/pages/ThreatDetailPage'));
const IctRegisterDqPage = lazy(() => import('@/pages/IctRegisterDqPage'));
const IctRegisterCommitteePage = lazy(() => import('@/pages/IctRegisterCommitteePage'));
const VendorReportsPage = lazy(() => import('@/pages/VendorReportsPage'));
const AuditTrailPage = lazy(() => import('@/pages/AuditTrailPage'));
const ActivityLogPage = lazy(() => import('@/pages/ActivityLogPage'));
const GovernancePage = lazy(() => import('@/pages/GovernancePage'));
const RiskHubPage = lazy(() => import('@/pages/RiskHubPage'));

export const businessRoutes: AppRouteDef[] = [
  {
    key: 'approvals',
    path: 'approvals',
    element: <ApprovalsPage />,
    nav: {
      href: '/approvals',
      labelKey: 'approvals',
      icon: ClipboardCheck,
      group: 'overview',
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
      order: 20,
      badgeKey: 'workflow',
    },
  },
  {
    key: 'notifications',
    path: 'notifications',
    element: <NotificationsPage />,
  },
  {
    key: 'controls',
    path: 'controls',
    element: <ControlsPage />,
    nav: {
      href: '/controls',
      labelKey: 'controls',
      icon: ClipboardList,
      group: 'registers',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'controls'),
      order: 30,
    },
  },
  { key: 'controls-new', path: 'controls/new', element: <ControlNewPage /> },
  { key: 'controls-detail', path: 'controls/:id', element: <ControlDetailPage /> },
  { key: 'controls-edit', path: 'controls/:id/edit', element: <ControlEditPage /> },
  {
    key: 'risks',
    path: 'risks',
    element: <RisksPage />,
    nav: {
      href: '/risks',
      labelKey: 'risks',
      icon: ShieldAlert,
      group: 'registers',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'risks'),
      order: 40,
    },
  },
  {
    key: 'risks-new',
    path: 'risks/new',
    element: <RiskNewPage />,
  },
  { key: 'risks-detail', path: 'risks/:id', element: <RiskDetailPage /> },
  {
    key: 'risks-edit',
    path: 'risks/:id/edit',
    element: <RiskEditPage />,
  },
  {
    key: 'issues',
    path: 'issues',
    element: <IssuesPage />,
    nav: {
      href: '/issues',
      labelKey: 'issues',
      icon: AlertOctagon,
      group: 'registers',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'issues'),
      order: 50,
    },
  },
  { key: 'issues-new', path: 'issues/new', element: <IssueNewPage /> },
  { key: 'issues-detail', path: 'issues/:id', element: <IssueDetailPage /> },
  {
    key: 'kris',
    path: 'kris',
    element: <KRIsPage />,
    nav: {
      href: '/kris',
      labelKey: 'kris',
      icon: Target,
      group: 'registers',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'risks'),
      order: 60,
    },
  },
  { key: 'kris-new', path: 'kris/new', element: <KRINewPage /> },
  { key: 'kris-detail', path: 'kris/:id', element: <KRIDetailPage /> },
  {
    key: 'vendors',
    path: 'vendors',
    element: <VendorsPage />,
    nav: {
      href: '/vendors',
      labelKey: 'vendors',
      icon: Handshake,
      group: 'registers',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'vendors'),
      order: 70,
    },
  },
  { key: 'vendors-new', path: 'vendors/new', element: <VendorDetailPage mode="new" /> },
  { key: 'vendors-detail', path: 'vendors/:id', element: <VendorDetailPage /> },
  { key: 'vendors-edit', path: 'vendors/:id/edit', element: <VendorDetailPage mode="edit" /> },
  {
    key: 'processes',
    path: 'processes',
    element: <ProcessesPage />,
    nav: {
      href: '/processes',
      labelKey: 'processes',
      icon: Workflow,
      group: 'ict_register',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'processes'),
      order: 75,
    },
  },
  { key: 'processes-new', path: 'processes/new', element: <ProcessDetailPage mode="new" /> },
  { key: 'processes-detail', path: 'processes/:id', element: <ProcessDetailPage /> },
  { key: 'processes-edit', path: 'processes/:id/edit', element: <ProcessDetailPage mode="edit" /> },
  {
    key: 'assets',
    path: 'assets',
    element: <AssetsPage />,
    nav: {
      href: '/assets',
      labelKey: 'assets',
      icon: Server,
      group: 'ict_register',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'assets'),
      order: 76,
    },
  },
  { key: 'assets-new', path: 'assets/new', element: <AssetDetailPage mode="new" /> },
  { key: 'assets-detail', path: 'assets/:id', element: <AssetDetailPage /> },
  { key: 'assets-edit', path: 'assets/:id/edit', element: <AssetDetailPage mode="edit" /> },
  {
    key: 'threats',
    path: 'threats',
    element: <ThreatsPage />,
    nav: {
      href: '/threats',
      labelKey: 'threats',
      icon: AlertTriangle,
      group: 'ict_register',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'threats'),
      order: 77,
    },
  },
  { key: 'threats-new', path: 'threats/new', element: <ThreatDetailPage mode="new" /> },
  { key: 'threats-detail', path: 'threats/:id', element: <ThreatDetailPage /> },
  { key: 'threats-edit', path: 'threats/:id/edit', element: <ThreatDetailPage mode="edit" /> },
  {
    // ICT Register data quality (#50): a read model over the register graph,
    // gated like the reference data it aggregates (the vendors:read pattern
    // of the /ict-register API surface).
    key: 'ict-register-dq',
    path: 'ict-register/data-quality',
    element: <IctRegisterDqPage />,
    nav: {
      href: '/ict-register/data-quality',
      labelKey: 'ict_register_dq',
      icon: ShieldCheck,
      group: 'ict_register',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'vendors'),
      order: 78,
    },
  },
  {
    // ICT Risk Committee page (#51): the register's executive read model,
    // gated by its OWN resource permission (executive/oversight roles only).
    key: 'ict-register-committee',
    path: 'ict-register/committee',
    element: <IctRegisterCommitteePage />,
    nav: {
      href: '/ict-register/committee',
      labelKey: 'ict_register_committee',
      icon: Landmark,
      // Transitional (#63): the final IA map has no ICT Committee sidebar entry —
      // #64 removes it together with the route migration + redirect. Until then it
      // is retained here, grouped under the ICT Register section, so the committee
      // is never unreachable mid-flight.
      group: 'ict_register',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'ict_committee'),
      order: 79,
    },
  },
  {
    key: 'departments',
    path: 'departments',
    element: <DepartmentsPage />,
    nav: {
      href: '/departments',
      labelKey: 'departments',
      icon: Building2,
      group: 'overview',
      isVisible: ({ authz }) => !authz.isPlatformAdmin && authz.can('read', 'departments'),
      order: 80,
    },
  },
  { key: 'departments-detail', path: 'departments/:id', element: <DepartmentDetailPage /> },
  {
    key: 'governance',
    path: 'governance',
    element: (
      <GovernanceRouteGuard>
        <GovernancePage />
      </GovernanceRouteGuard>
    ),
    nav: {
      href: '/governance',
      labelKey: 'governance',
      icon: Scale,
      group: 'administration',
      isVisible: ({ authz }) => authz.canViewGovernance,
      order: 90,
      badgeKey: 'orphanCount',
    },
  },
  {
    key: 'activity-log',
    path: 'activity-log',
    element: (
      <ActivityLogRouteGuard>
        <ActivityLogPage />
      </ActivityLogRouteGuard>
    ),
    nav: {
      href: '/activity-log',
      labelKey: 'activity_log',
      icon: Activity,
      group: 'administration',
      isVisible: ({ authz }) => authz.canViewActivityLog,
      order: 100,
    },
  },
  {
    key: 'vendor-reports',
    path: 'vendor-reports',
    element: <VendorReportsPage />,
  },
  {
    key: 'audit-trail',
    path: 'audit-trail',
    element: (
      <AuditTrailRouteGuard>
        <AuditTrailPage />
      </AuditTrailRouteGuard>
    ),
  },
  {
    key: 'risk-hub',
    path: 'risk-hub',
    element: <RiskHubPage />,
    nav: {
      href: '/risk-hub',
      labelKey: 'risk_hub',
      icon: Command,
      group: 'administration',
      isVisible: ({ authz }) => authz.canViewRiskHub,
      order: 130,
    },
  },
];

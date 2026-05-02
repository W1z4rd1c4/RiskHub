import { lazy } from 'react';
import {
  Activity,
  AlertOctagon,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Command,
  Handshake,
  Scale,
  ShieldAlert,
  Target,
} from 'lucide-react';

import {
  ActivityLogRouteGuard,
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
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
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
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
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
      isVisible: ({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('issues', 'read'),
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
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
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
      isVisible: ({ authz, hasPermission }) => !authz.isPlatformAdmin && hasPermission('vendors', 'read'),
      order: 70,
    },
  },
  { key: 'vendors-new', path: 'vendors/new', element: <VendorDetailPage mode="new" /> },
  { key: 'vendors-detail', path: 'vendors/:id', element: <VendorDetailPage /> },
  { key: 'vendors-edit', path: 'vendors/:id/edit', element: <VendorDetailPage mode="edit" /> },
  {
    key: 'departments',
    path: 'departments',
    element: <DepartmentsPage />,
    nav: {
      href: '/departments',
      labelKey: 'departments',
      icon: Building2,
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
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
    element: <AuditTrailPage />,
  },
  {
    key: 'risk-hub',
    path: 'risk-hub',
    element: <RiskHubPage />,
    nav: {
      href: '/risk-hub',
      labelKey: 'risk_hub',
      icon: Command,
      isVisible: ({ authz }) => authz.canViewRiskHub,
      order: 130,
    },
  },
];

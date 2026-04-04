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

import { ActivityLogRouteGuard, GovernanceRouteGuard } from '@/authz/BusinessRouteGuards';
import type { AppRouteDef } from './types';

const ApprovalsPage = lazy(async () => ({ default: (await import('@/pages/ApprovalsPage')).default }));
const NotificationsPage = lazy(async () => ({ default: (await import('@/pages/NotificationsPage')).NotificationsPage }));
const ControlsPage = lazy(async () => ({ default: (await import('@/pages/ControlsPage')).ControlsPage }));
const ControlDetailPage = lazy(async () => ({ default: (await import('@/pages/ControlDetailPage')).ControlDetailPage }));
const ControlNewPage = lazy(async () => ({ default: (await import('@/pages/ControlForms')).ControlNewPage }));
const ControlEditPage = lazy(async () => ({ default: (await import('@/pages/ControlForms')).ControlEditPage }));
const RisksPage = lazy(async () => ({ default: (await import('@/pages/RisksPage')).RisksPage }));
const RiskDetailPage = lazy(async () => ({ default: (await import('@/pages/RiskDetailPage')).RiskDetailPage }));
const RiskNewPage = lazy(async () => ({ default: (await import('@/pages/RiskForms')).RiskNewPage }));
const RiskEditPage = lazy(async () => ({ default: (await import('@/pages/RiskForms')).RiskEditPage }));
const IssuesPage = lazy(async () => ({ default: (await import('@/pages/IssuesPage')).IssuesPage }));
const IssueNewPage = lazy(async () => ({ default: (await import('@/pages/IssueNewPage')).IssueNewPage }));
const IssueDetailPage = lazy(async () => ({ default: (await import('@/pages/IssueDetailPage')).IssueDetailPage }));
const KRIsPage = lazy(async () => ({ default: (await import('@/pages/KRIsPage')).KRIsPage }));
const KRINewPage = lazy(async () => ({ default: (await import('@/pages/KRIForms')).KRINewPage }));
const KRIDetailPage = lazy(async () => ({ default: (await import('@/pages/KRIDetailPage')).KRIDetailPage }));
const DepartmentsPage = lazy(async () => ({ default: (await import('@/pages/DepartmentsPage')).DepartmentsPage }));
const DepartmentDetailPage = lazy(async () => ({ default: (await import('@/pages/DepartmentDetailPage')).DepartmentDetailPage }));
const VendorsPage = lazy(async () => ({ default: (await import('@/pages/VendorsPage')).VendorsPage }));
const VendorDetailPage = lazy(async () => ({ default: (await import('@/pages/VendorDetailPage')).VendorDetailPage }));
const VendorReportsPage = lazy(async () => ({ default: (await import('@/pages/VendorReportsPage')).VendorReportsPage }));
const AuditTrailPage = lazy(async () => ({ default: (await import('@/pages/AuditTrailPage')).AuditTrailPage }));
const ActivityLogPage = lazy(async () => ({ default: (await import('@/pages/ActivityLogPage')).ActivityLogPage }));
const GovernancePage = lazy(async () => ({ default: (await import('@/pages/GovernancePage')).default }));
const RiskHubPage = lazy(async () => ({ default: (await import('@/pages/RiskHubPage')).RiskHubPage }));

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
  { key: 'risks-new', path: 'risks/new', element: <RiskNewPage /> },
  { key: 'risks-detail', path: 'risks/:id', element: <RiskDetailPage /> },
  { key: 'risks-edit', path: 'risks/:id/edit', element: <RiskEditPage /> },
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

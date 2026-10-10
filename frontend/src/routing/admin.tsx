import { lazy } from 'react';
import { BookOpen, ServerCog } from 'lucide-react';

import { AdminConsoleRouteGuard } from '@/authz/BusinessRouteGuards';
import type { AppRouteDef } from './types';

const AdminConsolePage = lazy(() => import('@/pages/AdminConsolePage'));
const DocumentationPage = lazy(() => import('@/pages/DocumentationPage'));

export const adminRoutes: AppRouteDef[] = [
  {
    key: 'admin',
    path: 'admin',
    element: (
      <AdminConsoleRouteGuard>
        <AdminConsolePage />
      </AdminConsoleRouteGuard>
    ),
    nav: {
      href: '/admin',
      labelKey: 'admin',
      // Not `ENTITY_ICONS.asset` (Server): the console is not the Asset register (NAV-03).
      icon: ServerCog,
      group: 'administration',
      isVisible: ({ authz }) => authz.canViewAdminConsole,
      order: 140,
      adminOrder: 30,
    },
  },
  {
    key: 'admin-docs',
    path: 'admin/docs',
    element: (
      <AdminConsoleRouteGuard>
        <DocumentationPage />
      </AdminConsoleRouteGuard>
    ),
    nav: {
      href: '/admin/docs',
      labelKey: 'documentation',
      icon: BookOpen,
      group: 'administration',
      isVisible: ({ authz }) => authz.canViewAdminConsole,
      order: 150,
      adminOrder: 40,
    },
  },
];

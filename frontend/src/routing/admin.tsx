import { lazy } from 'react';
import { BookOpen, Server } from 'lucide-react';

import type { AppRouteDef } from './types';

const AdminConsolePage = lazy(() => import('@/pages/AdminConsolePage'));
const DocumentationPage = lazy(() => import('@/pages/DocumentationPage'));

export const adminRoutes: AppRouteDef[] = [
  {
    key: 'admin',
    path: 'admin',
    element: <AdminConsolePage />,
    nav: {
      href: '/admin',
      labelKey: 'admin',
      icon: Server,
      isVisible: ({ authz }) => authz.canViewAdminConsole,
      order: 140,
      adminOrder: 30,
    },
  },
  {
    key: 'admin-docs',
    path: 'admin/docs',
    element: <DocumentationPage />,
    nav: {
      href: '/admin/docs',
      labelKey: 'documentation',
      icon: BookOpen,
      isVisible: ({ authz }) => authz.canViewAdminConsole,
      order: 150,
      adminOrder: 40,
    },
  },
];

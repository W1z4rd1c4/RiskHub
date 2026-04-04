import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Users as UsersIcon } from 'lucide-react';

import { UsersRouteGuard, UserLifecycleRouteGuard } from '@/authz/BusinessRouteGuards';
import { useAuthz } from '@/authz/useAuthz';
import type { AppRouteDef } from './types';

const DashboardPage = lazy(async () => ({ default: (await import('@/pages/DashboardPage')).DashboardPage }));
const SettingsPage = lazy(async () => ({ default: (await import('@/pages/SettingsPage')).SettingsPage }));
const UsersPage = lazy(async () => ({ default: (await import('@/pages/UsersPage')).UsersPage }));
const UserNewPage = lazy(async () => ({ default: (await import('@/pages/UserNewPage')).UserNewPage }));
const HeroPage = lazy(async () => ({ default: (await import('@/pages/HeroPage')).HeroPage }));
const LoginPage = lazy(async () => ({ default: (await import('@/pages/LoginPage')).default }));
const SsoCallbackPage = lazy(async () => ({ default: (await import('@/pages/SsoCallbackPage')).default }));

function RoleBasedIndex() {
  const authz = useAuthz();

  if (authz.canViewAdminConsole) {
    return <Navigate to="/admin" replace />;
  }

  return <DashboardPage />;
}

export const publicRoutes: AppRouteDef[] = [
  {
    key: 'login',
    path: '/login',
    element: <LoginPage />,
  },
  {
    key: 'sso-callback',
    path: '/auth/sso/callback',
    element: <SsoCallbackPage />,
  },
  {
    key: 'landing',
    path: '/landing',
    element: <HeroPage />,
  },
];

export const coreProtectedRoutes: AppRouteDef[] = [
  {
    key: 'index',
    index: true,
    element: <RoleBasedIndex />,
    nav: {
      href: '/',
      labelKey: 'dashboard',
      icon: LayoutDashboard,
      isVisible: ({ authz }) => !authz.isPlatformAdmin,
      order: 10,
    },
  },
  {
    key: 'settings',
    path: 'settings',
    element: <SettingsPage />,
    nav: {
      href: '/settings',
      labelKey: 'settings',
      icon: Settings,
      isVisible: () => true,
      order: 110,
      adminOrder: 10,
    },
  },
  {
    key: 'users',
    path: 'users',
    element: (
      <UsersRouteGuard>
        <UsersPage />
      </UsersRouteGuard>
    ),
    nav: {
      href: '/users',
      labelKey: 'users',
      icon: UsersIcon,
      isVisible: ({ authz }) => authz.canViewUsersRoute,
      order: 120,
      adminOrder: 20,
    },
  },
  {
    key: 'users-new',
    path: 'users/new',
    element: (
      <UserLifecycleRouteGuard>
        <UserNewPage />
      </UserLifecycleRouteGuard>
    ),
  },
];

import { lazy } from 'react';

import type { AppRouteDef } from './types';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SsoCallbackPage = lazy(() => import('@/pages/SsoCallbackPage'));
const HeroPage = lazy(() => import('@/pages/HeroPage'));

export const publicRoutes: AppRouteDef[] = [
    { key: 'login', path: '/login', element: <LoginPage /> },
    { key: 'sso-callback', path: '/auth/sso/callback', element: <SsoCallbackPage /> },
    { key: 'landing', path: '/landing', element: <HeroPage /> },
];

import { lazy } from 'react';
import { matchRoutes } from 'react-router-dom';

import type { AppRouteDef } from './types';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SsoCallbackPage = lazy(() => import('@/pages/SsoCallbackPage'));
const NativePublicPage = lazy(() => import('@/pages/native/NativePublicPage'));
const NativeSecurityPage = lazy(() => import('@/pages/native/NativeSecurityPage'));
const HeroPage = lazy(() => import('@/pages/HeroPage'));

export const nativePublicRoutes: AppRouteDef[] = [
    ...['enroll', 'reset-password', 'recover', 'recover-email'].map((flow) => ({
        key: `native-${flow}`, path: `/auth/local/${flow}`, element: <NativePublicPage key={flow} />,
    })),
    { key: 'native-security', path: '/auth/local/security', element: <NativeSecurityPage key="security" /> },
    { key: 'native-verify-email', path: '/auth/local/verify-email', element: <NativeSecurityPage key="verify-email" /> },
];

export function resolveNativeRoute(pathname: string): AppRouteDef | undefined {
    const matched = matchRoutes(nativePublicRoutes.map(({ path, key }) => ({ path, key })), pathname)?.at(-1);
    return nativePublicRoutes.find((route) => route.key === matched?.route.key);
}

export const publicRoutes: AppRouteDef[] = [
    ...nativePublicRoutes,
    { key: 'login', path: '/login', element: <LoginPage /> },
    { key: 'sso-callback', path: '/auth/sso/callback', element: <SsoCallbackPage /> },
    { key: 'landing', path: '/landing', element: <HeroPage /> },
];

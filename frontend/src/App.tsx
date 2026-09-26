import { lazy, Suspense, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  RouterProvider,
  Routes,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useTranslation } from '@/i18n/hooks';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PrincipalQueryBoundary } from '@/contexts/PrincipalQueryBoundary';
import { resolvePublicRoute, publicRoutes } from '@/routing/public';
import type { AppRouteDef } from '@/routing/types';

const ProtectedApplication = lazy(() => import('@/ProtectedApplication'));

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, bootstrapStatus } = useAuth();
  const { t } = useTranslation('common');
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>;
  }
  if (!isAuthenticated && bootstrapStatus === 'error') {
    const qs = new URLSearchParams({ returnTo, authError: 'service_unavailable' }).toString();
    return <Navigate to={`/login?${qs}`} replace />;
  }
  if (!isAuthenticated) {
    const qs = new URLSearchParams({ returnTo }).toString();
    return <Navigate to={`/login?${qs}`} replace />;
  }

  return <>{children}</>;
}

function RouteLoadingFallback() {
  const { t } = useTranslation('common');
  return <div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>;
}

function renderRoute(route: AppRouteDef) {
  return (
    <Route
      key={route.key}
      {...(route.index ? { index: true } : { path: route.path })}
      element={route.element}
    />
  );
}

function AppRoutes() {
  const location = useLocation();
  const resetKey = `${location.pathname}${location.search}${location.hash}`;

  return (
    <ErrorBoundary resetKey={resetKey}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          {publicRoutes.map(renderRoute)}

          <Route path="*" element={
            <ProtectedRoute>
              <ProtectedApplication />
            </ProtectedRoute>
          } />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

const router = createBrowserRouter([
  {
    path: '*',
    element: <RouteScope><AppRoutes /></RouteScope>,
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

/** Public authentication screens survive their own principal transition so login
 * redirects and display-once results complete. Protected data stays inside the
 * principal boundary and is disposed when leaving that scope. */
export function RouteScope({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const presentation = (
    <LanguageProvider>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ThemeProvider>
    </LanguageProvider>
  );
  if (resolvePublicRoute(location.pathname)) return presentation;
  return <PrincipalQueryBoundary principalId={user?.id ?? null}>{presentation}</PrincipalQueryBoundary>;
}

export default App;

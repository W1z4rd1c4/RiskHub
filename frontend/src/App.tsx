import { lazy, Suspense } from 'react';
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
import { publicRoutes } from '@/routing/public';
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
    element: <AppRoutes />,
  },
]);

function App() {
  return (
    <AuthProvider>
      <PrincipalOwnedApplication />
    </AuthProvider>
  );
}

function PrincipalOwnedApplication() {
  const { user } = useAuth();

  return (
    <PrincipalQueryBoundary principalId={user?.id ?? null}>
      <LanguageProvider>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </ThemeProvider>
      </LanguageProvider>
    </PrincipalQueryBoundary>
  );
}

export default App;

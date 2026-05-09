import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { MainLayout } from '@/components/layout';
import { createAppQueryClient } from '@/lib/queryClient';
import { protectedAppRoutes, publicRoutes, type AppRouteDef } from '@/routing';

const queryClient = createAppQueryClient();

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isPreferencesHydrated, bootstrapStatus } = useAuth();
  const { t } = useTranslation('common');
  const location = useLocation();
  const preferencesReady = isPreferencesHydrated ?? true;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (isLoading || (isAuthenticated && !preferencesReady)) {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {publicRoutes.map(renderRoute)}

                <Route path="/" element={
                  <ProtectedRoute>
                    <DashboardFilterProvider>
                      <MainLayout />
                    </DashboardFilterProvider>
                  </ProtectedRoute>
                }>
                  {protectedAppRoutes.map(renderRoute)}
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { MainLayout } from '@/components/layout';

const DashboardPage = lazy(async () => ({ default: (await import('@/pages/DashboardPage')).DashboardPage }));
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
const SettingsPage = lazy(async () => ({ default: (await import('@/pages/SettingsPage')).SettingsPage }));
const HeroPage = lazy(async () => ({ default: (await import('@/pages/HeroPage')).HeroPage }));
const AuditTrailPage = lazy(async () => ({ default: (await import('@/pages/AuditTrailPage')).AuditTrailPage }));
const UsersPage = lazy(async () => ({ default: (await import('@/pages/UsersPage')).UsersPage }));
const UserNewPage = lazy(async () => ({ default: (await import('@/pages/UserNewPage')).UserNewPage }));
const UserDetailPage = lazy(async () => ({ default: (await import('@/pages/UserDetailPage')).UserDetailPage }));
const ApprovalsPage = lazy(async () => ({ default: (await import('@/pages/ApprovalsPage')).default }));
const NotificationsPage = lazy(async () => ({ default: (await import('@/pages/NotificationsPage')).NotificationsPage }));
const GovernancePage = lazy(async () => ({ default: (await import('@/pages/GovernancePage')).default }));
const ActivityLogPage = lazy(async () => ({ default: (await import('@/pages/ActivityLogPage')).ActivityLogPage }));
const RiskHubPage = lazy(async () => ({ default: (await import('@/pages/RiskHubPage')).RiskHubPage }));
const AdminConsolePage = lazy(async () => ({ default: (await import('@/pages/AdminConsolePage')).AdminConsolePage }));
const DocumentationPage = lazy(async () => ({ default: (await import('@/pages/DocumentationPage')).DocumentationPage }));
const LoginPage = lazy(async () => ({ default: (await import('@/pages/LoginPage')).default }));
const SsoCallbackPage = lazy(async () => ({ default: (await import('@/pages/SsoCallbackPage')).default }));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isPreferencesHydrated } = useAuth();
  const { t } = useTranslation('common');
  const location = useLocation();
  const preferencesReady = isPreferencesHydrated ?? true;

  if (isLoading || (isAuthenticated && !preferencesReady)) {
    return <div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>;
  }
  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    const qs = new URLSearchParams({ returnTo }).toString();
    return <Navigate to={`/login?${qs}`} replace />;
  }

  return <>{children}</>;
}

/**
 * Role-based default landing page:
 * - System Admin → Admin Console
 * - All others → Dashboard
 */
function RoleBasedIndex() {
  const authz = useAuthz();

  // System Admin should see Admin Console, not the Dashboard
  if (authz.canViewAdminConsole) {
    return <Navigate to="/admin" replace />;
  }

  return <DashboardPage />;
}

function GovernanceGuard() {
  const authz = useAuthz();
  if (!authz.canViewGovernance) {
    return <Navigate to="/" replace />;
  }
  return <GovernancePage />;
}

function RouteLoadingFallback() {
  const { t } = useTranslation('common');
  return <div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/sso/callback" element={<SsoCallbackPage />} />
                <Route path="/landing" element={<HeroPage />} />

                <Route path="/" element={
                  <ProtectedRoute>
                    <DashboardFilterProvider>
                      <MainLayout />
                    </DashboardFilterProvider>
                  </ProtectedRoute>
                }>
                  <Route index element={<RoleBasedIndex />} />
                  <Route path="approvals" element={<ApprovalsPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="controls" element={<ControlsPage />} />
                  <Route path="controls/new" element={<ControlNewPage />} />
                  <Route path="controls/:id" element={<ControlDetailPage />} />
                  <Route path="controls/:id/edit" element={<ControlEditPage />} />
                  <Route path="risks" element={<RisksPage />} />
                  <Route path="risks/new" element={<RiskNewPage />} />
                  <Route path="risks/:id" element={<RiskDetailPage />} />
                  <Route path="risks/:id/edit" element={<RiskEditPage />} />
                  <Route path="issues" element={<IssuesPage />} />
                  <Route path="issues/new" element={<IssueNewPage />} />
                  <Route path="issues/:id" element={<IssueDetailPage />} />
                  <Route path="kris" element={<KRIsPage />} />
                  <Route path="kris/new" element={<KRINewPage />} />
                  <Route path="kris/:id" element={<KRIDetailPage />} />
                  <Route path="departments" element={<DepartmentsPage />} />
                  <Route path="departments/:id" element={<DepartmentDetailPage />} />
                  <Route path="vendors" element={<VendorsPage />} />
                  <Route path="vendors/new" element={<VendorDetailPage mode="new" />} />
                  <Route path="vendors/:id" element={<VendorDetailPage />} />
                  <Route path="vendors/:id/edit" element={<VendorDetailPage mode="edit" />} />
                  <Route path="vendor-reports" element={<VendorReportsPage />} />
                  <Route path="audit-trail" element={<AuditTrailPage />} />
                  <Route path="activity-log" element={<ActivityLogPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="users/new" element={<UserNewPage />} />
                  <Route path="users/:id" element={<UserDetailPage />} />
                  <Route path="governance" element={<GovernanceGuard />} />
                  <Route path="settings" element={<SettingsPage />} />
                  {/* Risk Hub (CRO only) */}
                  <Route path="risk-hub" element={<RiskHubPage />} />
                  {/* Admin Console (Admin only) */}
                  <Route path="admin" element={<AdminConsolePage />} />
                  <Route path="admin/docs" element={<DocumentationPage />} />
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

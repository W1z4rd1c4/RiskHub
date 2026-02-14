import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from '@/i18n/hooks';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useAuthz } from '@/authz/useAuthz';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { MainLayout } from '@/components/layout';
import {
  DashboardPage,
  ControlsPage,
  ControlDetailPage,
  ControlNewPage,
  ControlEditPage,
  RisksPage,
  RiskDetailPage,
  RiskNewPage,
  RiskEditPage,
  IssuesPage,
  IssueNewPage,
  IssueDetailPage,
  KRIsPage,
  KRIDetailPage,
  DepartmentsPage,
  DepartmentDetailPage,
  VendorsPage,
  VendorDetailPage,
  VendorReportsPage,
  SettingsPage,
  HeroPage,
  AuditTrailPage,
  UsersPage,
  UserNewPage,
  UserDetailPage,
  ApprovalsPage,
  GovernancePage,
  ActivityLogPage,
  RiskHubPage,
  AdminConsolePage,
  DocumentationPage,
} from '@/pages';
import { KRINewPage } from '@/pages/KRIForms';
import { NotificationsPage } from '@/pages/NotificationsPage';
import LoginPage from '@/pages/LoginPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation('common');

  if (isLoading) return <div className="flex items-center justify-center min-h-screen">{t('loading.generic')}</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
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
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

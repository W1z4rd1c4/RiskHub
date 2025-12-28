import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
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
  KRIsPage,
  KRIDetailPage,
  DepartmentsPage,
  DepartmentDetailPage,
  SettingsPage,
  HeroPage,
  AuditTrailPage,
  UsersPage,
  UserNewPage,
  UserDetailPage,
  ApprovalsPage,
} from '@/pages';
import { KRINewPage } from '@/pages/KRIForms';
import LoginPage from '@/pages/LoginPage';
import './index.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
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
            <Route index element={<DashboardPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="controls" element={<ControlsPage />} />
            <Route path="controls/new" element={<ControlNewPage />} />
            <Route path="controls/:id" element={<ControlDetailPage />} />
            <Route path="controls/:id/edit" element={<ControlEditPage />} />
            <Route path="risks" element={<RisksPage />} />
            <Route path="risks/new" element={<RiskNewPage />} />
            <Route path="risks/:id" element={<RiskDetailPage />} />
            <Route path="risks/:id/edit" element={<RiskEditPage />} />
            <Route path="kris" element={<KRIsPage />} />
            <Route path="kris/new" element={<KRINewPage />} />
            <Route path="kris/:id" element={<KRIDetailPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="departments/:id" element={<DepartmentDetailPage />} />
            <Route path="audit-trail" element={<AuditTrailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/new" element={<UserNewPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

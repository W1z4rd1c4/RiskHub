import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout';
import {
  DashboardPage,
  ControlsPage,
  ControlDetailPage,
  ControlNewPage,
  ControlEditPage,
  RisksPage,
  RiskDetailPage,
  DepartmentsPage,
  SettingsPage,
  HeroPage,
} from '@/pages';
import './index.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { mockUserId, isLoading } = useAuth();

  if (isLoading) return null;
  if (!mockUserId) return <Navigate to="/landing" replace />;

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<HeroPage />} />

          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="controls" element={<ControlsPage />} />
            <Route path="controls/new" element={<ControlNewPage />} />
            <Route path="controls/:id" element={<ControlDetailPage />} />
            <Route path="controls/:id/edit" element={<ControlEditPage />} />
            <Route path="risks" element={<RisksPage />} />
            <Route path="risks/:id" element={<RiskDetailPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

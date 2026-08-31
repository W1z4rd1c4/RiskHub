import { Route, Routes } from 'react-router-dom';

import { MainLayout } from '@/components/layout';
import { DashboardFilterProvider } from '@/contexts/DashboardFilterContext';
import { protectedAppRoutes, type AppRouteDef } from '@/routing';

function renderRoute(route: AppRouteDef) {
    return (
        <Route
            key={route.key}
            {...(route.index ? { index: true } : { path: route.path })}
            element={route.element}
        />
    );
}

export default function ProtectedApplication() {
    return (
        <Routes>
            <Route
                path="/"
                element={(
                    <DashboardFilterProvider>
                        <MainLayout />
                    </DashboardFilterProvider>
                )}
            >
                {protectedAppRoutes.map(renderRoute)}
            </Route>
        </Routes>
    );
}

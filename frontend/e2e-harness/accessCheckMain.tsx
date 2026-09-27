import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { RiskNewPage } from '@/pages/RiskNewPage';
import i18n from '@/i18n';
import '@/index.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') ?? 'en';
localStorage.setItem('riskhub-theme', params.get('theme') ?? 'light');
document.documentElement.lang = locale;
await i18n.changeLanguage(locale);
createRoot(document.getElementById('root')!).render(
    <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><ThemeProvider>
            <RouterProvider router={createMemoryRouter([{ path: '/risks/new', element: <RiskNewPage /> }], {
                initialEntries: ['/risks/new?vendor_id=7&return_to=%2Fvendors%2F7'],
            })} />
        </ThemeProvider></AuthProvider>
    </QueryClientProvider>,
);

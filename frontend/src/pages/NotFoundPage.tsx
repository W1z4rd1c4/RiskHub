import { ArrowLeft, LayoutDashboard, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { PAGE_TITLE_CLASS } from '@/components/layout/PageHeader';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslation } from '@/i18n/hooks';

export function NotFoundPage() {
    const navigate = useNavigate();
    const { t } = useTranslation('common');
    usePageTitle(t('not_found_page.title'));

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
            <div className="rounded-2xl bg-tint/5 p-4">
                <SearchX className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="space-y-2">
                <h1 tabIndex={-1} data-page-title="" className={PAGE_TITLE_CLASS}>{t('not_found_page.title')}</h1>
                <p className="max-w-md text-muted-foreground">{t('not_found_page.description')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground"
                >
                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                    {t('not_found_page.dashboard')}
                </Link>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2 font-bold text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {t('not_found_page.back')}
                </button>
            </div>
        </div>
    );
}

export default NotFoundPage;

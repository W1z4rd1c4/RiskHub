import { ArrowLeft, LayoutDashboard, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { PAGE_TITLE_CLASS } from '@/components/layout/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
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
                <Link to="/" className={buttonVariants({ variant: 'accent' })}>
                    <LayoutDashboard aria-hidden="true" />
                    {t('not_found_page.dashboard')}
                </Link>
                <Button variant="secondary" onClick={() => { void navigate(-1); }}>
                    <ArrowLeft aria-hidden="true" />
                    {t('not_found_page.back')}
                </Button>
            </div>
        </div>
    );
}

export default NotFoundPage;

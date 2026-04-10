import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Plus } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';
import { IssueCreateForm } from '@/components/issues/IssueCreateForm';
import { usePermissions } from '@/hooks/usePermissions';
import type { Issue } from '@/types/issue';

export function IssueNewPage() {
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const { t } = useTranslation('issues');
    const canWrite = hasPermission('issues', 'write');

    const handleCreated = (issue: Issue) => {
        void navigate(`/issues/${issue.id}`);
    };

    if (!canWrite) {
        return (
            <div className="glass-card p-8 flex items-center gap-3 text-amber-200">
                <AlertTriangle className="h-5 w-5" />
                <span>{t('permissions.create_denied')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <Plus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">{t('new_page.title')}</h2>
                    <p className="text-slate-500 font-medium tracking-tight uppercase text-[10px] tracking-widest mt-1">
                        {t('new_page.breadcrumb')}
                    </p>
                </div>
            </div>

            <section className="glass-card p-8 space-y-6">
                <IssueCreateForm onCreated={handleCreated} onCancel={() => navigate('/issues')} />
            </section>
        </div>
    );
}

export default IssueNewPage;

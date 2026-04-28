import { Download, Plus } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';

interface RisksPageHeaderProps {
    canCreateRisk: boolean;
    canExport: boolean;
    isExporting: boolean;
    onCreateRisk: () => void;
    onOpenExport: () => void;
}

export function RisksPageHeader({ canCreateRisk, canExport, isExporting, onCreateRisk, onOpenExport }: RisksPageHeaderProps) {
    const { t } = useTranslation('risks');

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
                {canExport && (
                    <button
                        type="button"
                        onClick={onOpenExport}
                        data-testid="risks-export-button"
                        disabled={isExporting}
                        className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                    >
                        <Download className="h-4 w-4" />
                        {t('actions.export')}
                    </button>
                )}
                {canCreateRisk && (
                    <button
                        type="button"
                        onClick={onCreateRisk}
                        data-testid="risks-create-button"
                        className="btn-primary"
                    >
                        <Plus className="h-5 w-5" />
                        {t('new_risk')}
                    </button>
                )}
            </div>
        </div>
    );
}

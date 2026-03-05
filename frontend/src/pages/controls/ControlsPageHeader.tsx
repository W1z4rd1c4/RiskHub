import { Download, Plus } from 'lucide-react';

import { PermissionGate } from '@/components/PermissionGate';
import { useTranslation } from '@/i18n/hooks';

interface ControlsPageHeaderProps {
    isExporting: boolean;
    onCreateControl: () => void;
    onOpenExport: () => void;
}

export function ControlsPageHeader({
    isExporting,
    onCreateControl,
    onOpenExport,
}: ControlsPageHeaderProps) {
    const { t } = useTranslation('controls');

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 className="text-3xl font-black text-white mb-2">{t('title')}</h2>
                <p className="text-slate-500 font-medium tracking-tight">{t('page_subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenExport}
                    data-testid="controls-export-button"
                    disabled={isExporting}
                    className="px-4 py-2.5 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                >
                    <Download className="h-4 w-4" />
                    {t('actions.export')}
                </button>
                <PermissionGate resource="controls" action="write">
                    <button
                        type="button"
                        onClick={onCreateControl}
                        data-testid="controls-create-button"
                        className="btn-primary"
                    >
                        <Plus className="h-5 w-5" />
                        {t('new_control')}
                    </button>
                </PermissionGate>
            </div>
        </div>
    );
}

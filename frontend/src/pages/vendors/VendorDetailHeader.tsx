import { ArrowLeft, Edit, FileText, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { PermissionGate } from '@/components/PermissionGate';
import type { Vendor } from '@/types/vendor';

interface VendorDetailHeaderProps {
    canEdit: boolean;
    canRestore: boolean;
    onBack: () => void;
    onEdit: () => void;
    onOpenIssueModal: () => void;
    onRestore: () => void;
    vendor: Vendor;
}

export function VendorDetailHeader({
    canEdit,
    canRestore,
    onBack,
    onEdit,
    onOpenIssueModal,
    onRestore,
    vendor,
}: VendorDetailHeaderProps) {
    const { t } = useTranslation('vendors');
    const { t: tIssues } = useTranslation('issues');

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4 text-slate-300" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white">{vendor.name}</h1>
                    <p className="text-slate-500 font-medium">
                        {t(`type.${vendor.vendor_type}`, vendor.vendor_type)}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <PermissionGate resource="issues" action="write">
                    <button
                        onClick={onOpenIssueModal}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <FileText className="h-4 w-4" />
                        {tIssues('actions.new_issue')}
                    </button>
                </PermissionGate>
                {canEdit && (
                    <PermissionGate resource="vendors" action="read">
                        <button
                            onClick={onEdit}
                            className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <Edit className="h-4 w-4" />
                            {t('actions.edit')}
                        </button>
                    </PermissionGate>
                )}
                {canRestore && (
                    <button
                        onClick={onRestore}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        {t('actions.unarchive')}
                    </button>
                )}
            </div>
        </div>
    );
}

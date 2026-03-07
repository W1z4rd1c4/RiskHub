import { ArrowLeft, Edit, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n/hooks';

import { PermissionGate } from '@/components/PermissionGate';
import type { Vendor } from '@/types/vendor';

interface VendorDetailHeaderProps {
    canArchive: boolean;
    canEdit: boolean;
    canRestore: boolean;
    onArchive: () => void;
    onBack: () => void;
    onEdit: () => void;
    onOpenIssueModal: () => void;
    onRestore: () => void;
    vendor: Vendor;
}

function badge(text: string, className: string) {
    return (
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${className}`}>
            {text}
        </span>
    );
}

export function VendorDetailHeader({
    canArchive,
    canEdit,
    canRestore,
    onArchive,
    onBack,
    onEdit,
    onOpenIssueModal,
    onRestore,
    vendor,
}: VendorDetailHeaderProps) {
    const { t } = useTranslation('vendors');
    const { t: tIssues } = useTranslation('issues');
    const { t: tCommon } = useTranslation('common');

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-accent"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {t('title')}
                </button>

                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-4xl font-black tracking-tight text-white">{vendor.name}</h1>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                            vendor.status === 'active'
                                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                                : 'border-slate-400/20 bg-slate-400/10 text-slate-300'
                        }`}>
                            {t(`status.${vendor.status}`, vendor.status)}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                        <span>{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-700" />
                        <span>
                            {vendor.process}
                            {vendor.subprocess ? ` / ${vendor.subprocess}` : ''}
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {badge(
                            `${t('columns.risk_score')}: ${vendor.risk_score_1_5}/5`,
                            'border-amber-400/20 bg-amber-400/10 text-amber-300'
                        )}
                        {vendor.supports_important_core_insurance_function &&
                            badge(t('flags.supports_core_function'), 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300')}
                        {vendor.dora_relevant &&
                            badge(t('flags.dora_relevant'), 'border-blue-400/20 bg-blue-400/10 text-blue-300')}
                        {vendor.is_significant_vendor &&
                            badge(t('flags.significant_vendor'), 'border-orange-400/20 bg-orange-400/10 text-orange-300')}
                    </div>

                    {vendor.description && (
                        <p className="max-w-3xl text-sm font-medium leading-relaxed text-slate-400">
                            {vendor.description}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                <PermissionGate resource="issues" action="write">
                    <button
                        type="button"
                        onClick={onOpenIssueModal}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-200 transition-colors hover:bg-white/10"
                    >
                        <FileText className="h-4 w-4" />
                        {tIssues('actions.new_issue')}
                    </button>
                </PermissionGate>
                {canEdit && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-200 transition-colors hover:bg-white/10"
                    >
                        <Edit className="h-4 w-4" />
                        {t('actions.edit')}
                    </button>
                )}
                {canArchive && (
                    <button
                        type="button"
                        onClick={onArchive}
                        className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-rose-300 transition-colors hover:bg-rose-500/20"
                    >
                        <Trash2 className="h-4 w-4" />
                        {tCommon('actions.archive')}
                    </button>
                )}
                {canRestore && (
                    <button
                        type="button"
                        onClick={onRestore}
                        className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-emerald-300 transition-colors hover:bg-emerald-500/20"
                    >
                        <RotateCcw className="h-4 w-4" />
                        {t('actions.unarchive')}
                    </button>
                )}
            </div>
        </div>
    );
}

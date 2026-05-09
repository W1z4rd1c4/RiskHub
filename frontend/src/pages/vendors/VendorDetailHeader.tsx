import { ArrowLeft, Edit, FileText, RotateCcw, Trash2 } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { Vendor } from '@/types/vendor';

import { getVendorDisplayStatus, type VendorDisplayStatus } from './vendorsPagePresentation';

interface VendorDetailHeaderProps {
    canArchive: boolean;
    canCreateIssue: boolean;
    canEdit: boolean;
    canRestore: boolean;
    onArchive: () => void;
    onBack: () => void;
    onEdit: () => void;
    onOpenIssueModal: () => void;
    onRestore: () => void;
    vendor: Vendor;
}

function statusClass(status: VendorDisplayStatus) {
    if (status === 'active') {
        return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
    }
    return 'text-slate-400 border-slate-400/20 bg-slate-400/5';
}

function flagBadge(label: string, tone: 'info' | 'success' | 'warn') {
    const toneClasses =
        tone === 'success'
            ? 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20'
            : tone === 'info'
                ? 'text-sky-300 bg-sky-400/10 border-sky-400/20'
                : 'text-amber-300 bg-amber-400/10 border-amber-400/20';

    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${toneClasses}`}>
            {label}
        </span>
    );
}

export function VendorDetailHeader({
    canArchive,
    canCreateIssue,
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
    const displayStatus = getVendorDisplayStatus(vendor);

    return (
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-accent"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {t('actions.back_to_register')}
                </button>

                <div className="flex flex-wrap items-center gap-4">
                    <h1 className="text-4xl font-black tracking-tighter text-white">{vendor.name}</h1>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusClass(displayStatus)}`}>
                        {t(`status.${displayStatus}`, displayStatus)}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                    <span>{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                    <span>{vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}</span>
                    {vendor.department_name ? <span>{vendor.department_name}</span> : null}
                    {vendor.outsourcing_owner_name ? <span>{vendor.outsourcing_owner_name}</span> : null}
                </div>

                {vendor.description ? (
                    <p className="max-w-3xl font-medium text-slate-500">{vendor.description}</p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border text-amber-300 bg-amber-400/10 border-amber-400/20">
                        {t('columns.risk_score')}: {vendor.risk_score_1_5}/5
                    </span>
                    {vendor.supports_important_core_insurance_function
                        ? flagBadge(t('flags.supports_core_function'), 'success')
                        : null}
                    {vendor.dora_relevant ? flagBadge(t('flags.dora_relevant'), 'info') : null}
                    {vendor.is_significant_vendor ? flagBadge(t('flags.significant_vendor'), 'warn') : null}
                </div>
            </div>

            <div className="flex items-center gap-3">
                {canCreateIssue ? (
                    <button
                        type="button"
                        onClick={onOpenIssueModal}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-slate-300 transition-all hover:border-accent/50 hover:text-white"
                    >
                        <FileText className="h-4 w-4" />
                        {tIssues('actions.new_issue')}
                    </button>
                ) : null}

                {canEdit ? (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-400 transition-all hover:border-accent/50 hover:text-white"
                        title={t('actions.edit')}
                    >
                        <Edit className="h-5 w-5" />
                    </button>
                ) : null}

                {canRestore ? (
                    <button
                        type="button"
                        onClick={onRestore}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-400 transition-all hover:border-emerald-400/50 hover:text-emerald-400"
                        title={t('actions.unarchive')}
                    >
                        <RotateCcw className="h-5 w-5" />
                    </button>
                ) : null}

                {canArchive ? (
                    <button
                        type="button"
                        onClick={onArchive}
                        className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-400 transition-all hover:border-rose-400/50 hover:text-rose-400"
                        title={tCommon('actions.archive')}
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                ) : null}
            </div>
        </div>
    );
}

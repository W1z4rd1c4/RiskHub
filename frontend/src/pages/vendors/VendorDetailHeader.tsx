import { ArrowLeft, Edit, FileText, RotateCcw, Trash2 } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { Vendor } from '@/types/vendor';
import { vendorOwnerDisplayName } from './vendorDetailPresentation';

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
        return 'text-success-text border-success/20 bg-success/10';
    }
    return 'text-muted-foreground border-border bg-muted';
}

function flagBadge(label: string, tone: 'info' | 'success' | 'warn') {
    let toneClasses = 'text-warning-text bg-warning/10 border-warning/20';
    if (tone === 'success') {
        toneClasses = 'text-success-text bg-success/10 border-success/20';
    } else if (tone === 'info') {
        toneClasses = 'text-accent-text bg-info/10 border-info/20';
    }

    return (
        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${toneClasses}`}>
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
                    className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent-text"
                >
                    <ArrowLeft className="h-3 w-3" />
                    {t('actions.back_to_register')}
                </button>

                <div className="flex flex-wrap items-center gap-4">
                    <h1 className="text-4xl font-black tracking-tighter text-foreground">{vendor.name}</h1>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${statusClass(displayStatus)}`}>
                        {t(`status.${displayStatus}`, displayStatus)}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground">
                    <span>{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                    <span>{vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}</span>
                    {vendor.department_name ? <span>{vendor.department_name}</span> : null}
                    <span>{vendorOwnerDisplayName(vendor.outsourcing_owner, vendor.ownership_status, t)}</span>
                </div>

                {vendor.description ? (
                    <p className="max-w-3xl font-medium text-muted-foreground">{vendor.description}</p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold border text-warning-text bg-warning/10 border-warning/20">
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
                        className="flex items-center gap-2 rounded-xl border border-border bg-nested px-4 py-2.5 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                        <FileText className="h-4 w-4" />
                        {tIssues('actions.new_issue')}
                    </button>
                ) : null}

                {canEdit ? (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="rounded-xl border border-border bg-nested p-3 text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                        title={t('actions.edit')}
                    >
                        <Edit className="h-5 w-5" />
                    </button>
                ) : null}

                {canRestore ? (
                    <button
                        type="button"
                        onClick={onRestore}
                        className="rounded-xl border border-border bg-nested p-3 text-muted-foreground transition-colors hover:border-success/50 hover:text-success-text"
                        title={t('actions.unarchive')}
                    >
                        <RotateCcw className="h-5 w-5" />
                    </button>
                ) : null}

                {canArchive ? (
                    <button
                        type="button"
                        onClick={onArchive}
                        className="rounded-xl border border-border bg-nested p-3 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                        title={tCommon('actions.archive')}
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                ) : null}
            </div>
        </div>
    );
}

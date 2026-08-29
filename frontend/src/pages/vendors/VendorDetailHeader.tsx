import { ArrowLeft, Edit, FileText, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
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
        <EntityDetailHeader
            backAction={(
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onBack}
                    className="text-xs font-black uppercase tracking-widest"
                >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    {t('actions.back_to_register')}
                </Button>
            )}
            identifier={vendor.registration_id}
            identifierSeparatorLabel={tCommon('detail_header.identifier_separator')}
            title={vendor.name}
            statuses={(
                <>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${statusClass(displayStatus)}`}>
                        {t(`status.${displayStatus}`, displayStatus)}
                    </span>
                </>
            )}
            metadata={(
                <>
                    <span>{t(`type.${vendor.vendor_type}`, vendor.vendor_type)}</span>
                    <span>{vendor.process}{vendor.subprocess ? ` / ${vendor.subprocess}` : ''}</span>
                    {vendor.department_name ? <span>{vendor.department_name}</span> : null}
                    <span>{vendorOwnerDisplayName(vendor.outsourcing_owner, vendor.ownership_status, t)}</span>
                </>
            )}
            description={vendor.description}
            supplementary={(
                <>
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold border text-warning-text bg-warning/10 border-warning/20">
                        {t('columns.risk_score')}: {vendor.risk_score_1_5}/5
                    </span>
                    {vendor.supports_important_core_insurance_function
                        ? flagBadge(t('flags.supports_core_function'), 'success')
                        : null}
                    {vendor.dora_relevant ? flagBadge(t('flags.dora_relevant'), 'info') : null}
                    {vendor.is_significant_vendor ? flagBadge(t('flags.significant_vendor'), 'warn') : null}
                </>
            )}
            actions={(
                <>
                {canCreateIssue ? (
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onOpenIssueModal}
                    >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {tIssues('actions.new_issue')}
                    </Button>
                ) : null}

                {canEdit ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={onEdit}
                        title={t('actions.edit')}
                        aria-label={t('actions.edit')}
                    >
                        <Edit className="h-5 w-5" aria-hidden="true" />
                    </Button>
                ) : null}

                {canRestore ? (
                    <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={onRestore}
                        title={t('actions.unarchive')}
                        aria-label={t('actions.unarchive')}
                    >
                        <RotateCcw className="h-5 w-5" aria-hidden="true" />
                    </Button>
                ) : null}

                {canArchive ? (
                    <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={onArchive}
                        title={tCommon('actions.archive')}
                        aria-label={tCommon('actions.archive')}
                    >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </Button>
                ) : null}
                </>
            )}
        />
    );
}

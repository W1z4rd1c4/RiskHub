import { Archive, Edit, FileText, RotateCcw } from 'lucide-react';

import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/hooks';
import { ordinalSeverityBand } from '@/lib/severity';
import { EntityDetailHeader } from '@/pages/detail/EntityDetailHeader';
import type { Vendor } from '@/types/vendor';
import { vendorOwnerDisplayName } from './vendorDetailPresentation';

import { getVendorDisplayStatus, getVendorStatusTone } from './vendorsPagePresentation';

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
    /** The register the user came from (honours `return_to`); first breadcrumb (NAV-02). */
    registerHref: string;
    vendor: Vendor;
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
    registerHref,
    vendor,
}: VendorDetailHeaderProps) {
    const { t } = useTranslation('vendors');
    const { t: tIssues } = useTranslation('issues');
    const { t: tCommon } = useTranslation('common');
    const displayStatus = getVendorDisplayStatus(vendor);

    return (
        <EntityDetailHeader
            back={{ label: t('actions.back_to_register'), onClick: onBack }}
            breadcrumbs={[{ label: t('title'), to: registerHref }, { label: vendor.name }]}
            identifier={vendor.registration_id}
            identifierSeparatorLabel={tCommon('detail_header.identifier_separator')}
            title={vendor.name}
            statuses={(
                <Badge tone={getVendorStatusTone(displayStatus)}>
                    {t(`status.${displayStatus}`, displayStatus)}
                </Badge>
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
                    {/* D1: the vendor risk score on the shared severity scale. */}
                    <SeverityBadge
                        band={ordinalSeverityBand(vendor.risk_score_1_5)}
                        label={`${t('columns.risk_score')}: ${vendor.risk_score_1_5}/5`}
                    />
                    {vendor.supports_important_core_insurance_function ? (
                        <Badge tone="success">{t('flags.supports_core_function')}</Badge>
                    ) : null}
                    {vendor.dora_relevant ? <Badge tone="info">{t('flags.dora_relevant')}</Badge> : null}
                    {vendor.is_significant_vendor ? (
                        <Badge tone="warning">{t('flags.significant_vendor')}</Badge>
                    ) : null}
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
                        <Archive className="h-5 w-5" aria-hidden="true" />
                    </Button>
                ) : null}
                </>
            )}
        />
    );
}

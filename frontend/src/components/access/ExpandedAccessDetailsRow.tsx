import { Crown, Server } from 'lucide-react';

import { TD, TR } from '@/components/ui/table';
import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';

import { PermissionMatrix } from './PermissionMatrix';
import { accessDetailsRowId } from './usersTablePresentation';

interface ExpandedAccessDetailsRowProps {
    user: AccessUserRead;
}

export function ExpandedAccessDetailsRow({ user }: ExpandedAccessDetailsRowProps) {
    const { t } = useTranslation('admin');
    const rowId = accessDetailsRowId(user.id);

    if (user.role.name === 'admin') {
        return (
            <TR id={rowId}>
                <TD colSpan={6} className="bg-tint/5 px-8 py-4">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                        {t('access.capabilities.platform_admin')}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-tint/5 p-3 rounded-lg">
                            <div className="text-muted-foreground text-xs mb-1">{t('access.capabilities.user_management')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.user_management_desc')}</div>
                        </div>
                        <div className="bg-tint/5 p-3 rounded-lg">
                            <div className="text-muted-foreground text-xs mb-1">{t('access.capabilities.system_health')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.system_health_desc')}</div>
                        </div>
                        <div className="bg-tint/5 p-3 rounded-lg">
                            <div className="text-muted-foreground text-xs mb-1">{t('access.capabilities.technical_logs')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.technical_logs_desc')}</div>
                        </div>
                        <div className="bg-tint/5 p-3 rounded-lg">
                            <div className="text-muted-foreground text-xs mb-1">{t('access.capabilities.session_management')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.session_management_desc')}</div>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-warning-text">
                        <Server aria-hidden="true" className="h-3 w-3 inline mr-1" />
                        {t('access.capabilities.platform_admin_note')}
                    </div>
                </TD>
            </TR>
        );
    }

    if (user.role.name === 'cro') {
        return (
            <TR id={rowId}>
                <TD colSpan={6} className="bg-tint/5 px-8 py-4">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                        {t('access.capabilities.riskhub')}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-warning/10 p-3 rounded-lg border border-warning/20">
                            <div className="text-warning-text text-xs mb-1">{t('access.capabilities.risk_types')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.risk_types_desc')}</div>
                        </div>
                        <div className="bg-warning/10 p-3 rounded-lg border border-warning/20">
                            <div className="text-warning-text text-xs mb-1">{t('access.capabilities.global_config')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.global_config_desc')}</div>
                        </div>
                        <div className="bg-warning/10 p-3 rounded-lg border border-warning/20">
                            <div className="text-warning-text text-xs mb-1">{t('access.capabilities.approval_rules')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.approval_rules_desc')}</div>
                        </div>
                        <div className="bg-chart-2/10 p-3 rounded-lg border border-chart-2/20">
                            <div className="text-accent-text text-xs mb-1">{t('access.capabilities.all_business_data')}</div>
                            <div className="text-foreground text-sm">{t('access.capabilities.all_business_data_desc')}</div>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-warning-text">
                        <Crown aria-hidden="true" className="h-3 w-3 inline mr-1" />
                        {t('access.capabilities.cro_note')}
                    </div>
                </TD>
            </TR>
        );
    }

    return (
        <TR id={rowId}>
            <TD colSpan={6} className="bg-tint/5 px-8 py-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    {t('access.capabilities.effective_permissions')}
                </div>
                <PermissionMatrix permissions={user.effective_permissions} />
            </TD>
        </TR>
    );
}

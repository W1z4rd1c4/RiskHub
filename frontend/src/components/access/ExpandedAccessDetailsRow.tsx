import { Crown, Server } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';

import { PermissionMatrix } from './PermissionMatrix';

interface ExpandedAccessDetailsRowProps {
    user: AccessUserRead;
}

export function ExpandedAccessDetailsRow({ user }: ExpandedAccessDetailsRowProps) {
    const { t } = useTranslation('admin');

    if (user.role.name === 'admin') {
        return (
            <tr>
                <td colSpan={6} className="bg-white/5 px-8 py-4">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {t('access.capabilities.platform_admin')}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/5 p-3 rounded-lg">
                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.user_management')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.user_management_desc')}</div>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.system_health')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.system_health_desc')}</div>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.technical_logs')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.technical_logs_desc')}</div>
                        </div>
                        <div className="bg-white/5 p-3 rounded-lg">
                            <div className="text-slate-400 text-xs mb-1">{t('access.capabilities.session_management')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.session_management_desc')}</div>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-amber-400/70">
                        <Server className="h-3 w-3 inline mr-1" />
                        {t('access.capabilities.platform_admin_note')}
                    </div>
                </td>
            </tr>
        );
    }

    if (user.role.name === 'cro') {
        return (
            <tr>
                <td colSpan={6} className="bg-white/5 px-8 py-4">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                        {t('access.capabilities.riskhub')}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.risk_types')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.risk_types_desc')}</div>
                        </div>
                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.global_config')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.global_config_desc')}</div>
                        </div>
                        <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                            <div className="text-amber-400 text-xs mb-1">{t('access.capabilities.approval_rules')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.approval_rules_desc')}</div>
                        </div>
                        <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/20">
                            <div className="text-purple-400 text-xs mb-1">{t('access.capabilities.all_business_data')}</div>
                            <div className="text-white text-sm">{t('access.capabilities.all_business_data_desc')}</div>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-amber-400/70">
                        <Crown className="h-3 w-3 inline mr-1" />
                        {t('access.capabilities.cro_note')}
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td colSpan={6} className="bg-white/5 px-8 py-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    {t('access.capabilities.effective_permissions')}
                </div>
                <PermissionMatrix permissions={user.effective_permissions} />
            </td>
        </tr>
    );
}

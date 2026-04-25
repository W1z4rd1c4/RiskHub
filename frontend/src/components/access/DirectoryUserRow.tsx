import { Building2, Mail, Shield } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { UserDirectoryEntry } from '@/types/user';

interface DirectoryUserRowProps {
    user: UserDirectoryEntry;
}

export function DirectoryUserRow({ user }: DirectoryUserRowProps) {
    const { t } = useTranslation('admin');

    return (
        <tr className="group hover:bg-white/5 transition-colors">
            <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                        {user.name.charAt(0)}
                    </div>
                    <div>
                        <p className="font-medium text-white group-hover:text-accent transition-colors">{user.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                        </p>
                    </div>
                </div>
            </td>
            <td className="py-4 px-4">
                <div className="space-y-1">
                    <p className="text-sm text-white flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-purple-400" />
                        {user.role_display_name || user.role_name || t('common:fallbacks.unknown')}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-500" />
                        {user.department_name || t('access.table.no_department')}
                    </p>
                </div>
            </td>
            <td className="py-4 px-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {t('access.status.active')}
                </span>
            </td>
            <td className="py-4 px-4 text-right">
                <span className="text-xs text-slate-500 italic">{t('access.table.view_only')}</span>
            </td>
        </tr>
    );
}

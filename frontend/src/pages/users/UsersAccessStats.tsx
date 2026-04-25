import { Crown, Server, UserCheck, Users } from 'lucide-react';

import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';

interface UsersAccessStatsProps {
    activeCount: number;
    isPlatformAdmin: boolean;
    privilegedCount: number;
    totalCount: number;
    users: AccessUserRead[];
}

export function UsersAccessStats({
    activeCount,
    isPlatformAdmin,
    privilegedCount,
    totalCount,
    users,
}: UsersAccessStatsProps) {
    const { t } = useTranslation('admin');
    const accessStatsGridClass = isPlatformAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3';

    return (
        <div className={`grid grid-cols-1 ${accessStatsGridClass} gap-4`}>
            <div className="glass-card p-4 flex items-center gap-4">
                <div className="bg-purple-500/20 p-3 rounded-xl">
                    <Users className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                    <p className="text-sm text-slate-400">{t('access.stats.total_users')}</p>
                    <p className="text-2xl font-bold text-white">{totalCount}</p>
                </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-4">
                <div className="bg-emerald-500/20 p-3 rounded-xl">
                    <UserCheck className="h-6 w-6 text-emerald-400" />
                </div>
                <div>
                    <p className="text-sm text-slate-400">{t('access.stats.active')}</p>
                    <p className="text-2xl font-bold text-white">{activeCount}</p>
                </div>
            </div>
            <div className="glass-card p-4 flex items-center gap-4">
                <div className="bg-amber-500/20 p-3 rounded-xl">
                    <Crown className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                    <p className="text-sm text-slate-400">{t('access.stats.privileged')}</p>
                    <p className="text-2xl font-bold text-white">{privilegedCount}</p>
                </div>
            </div>
            {isPlatformAdmin && (
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-slate-500/20 p-3 rounded-xl">
                        <Server className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">{t('access.stats.sys_admins')}</p>
                        <p className="text-2xl font-bold text-white">{users.filter((user) => user.role.name === 'admin').length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

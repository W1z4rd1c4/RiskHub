import type { AccessUserRead } from '@/types/access';

export const userScopeBadgeColors: Record<string, string> = {
    global: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    platform: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    department: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    manager: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function userScopeBadgeClassName(user: AccessUserRead): string {
    if (user.role.name === 'admin') {
        return userScopeBadgeColors.platform;
    }
    return userScopeBadgeColors[user.access_scope] || userScopeBadgeColors.manager;
}

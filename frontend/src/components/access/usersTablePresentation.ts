import type { AccessUserRead } from '@/types/access';

export const userScopeBadgeColors: Record<string, string> = {
    global: 'bg-warning/10 text-warning-text border-warning/30',
    platform: 'bg-muted text-muted-foreground border-border',
    department: 'bg-info/10 text-accent-text border-info/30',
    manager: 'bg-muted text-muted-foreground border-border',
};

export function userScopeBadgeClassName(user: AccessUserRead): string {
    if (user.role.name === 'admin') {
        return userScopeBadgeColors.platform;
    }
    return userScopeBadgeColors[user.access_scope] || userScopeBadgeColors.manager;
}

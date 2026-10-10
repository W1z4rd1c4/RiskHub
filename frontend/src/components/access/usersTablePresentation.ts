import type { Tone } from '@/lib/tones';
import type { AccessUserRead } from '@/types/access';

const userScopeTones: Record<string, Tone> = {
    global: 'warning',
    platform: 'neutral',
    department: 'info',
    manager: 'neutral',
};

/** Badge tone of a user's access scope (the platform admin role reads as `platform`). */
export function userScopeTone(user: AccessUserRead): Tone {
    if (user.role.name === 'admin') {
        return userScopeTones.platform;
    }
    return userScopeTones[user.access_scope] || userScopeTones.manager;
}

/** Id of a user's expanded details row, referenced by its expand toggle (`aria-controls`, AX-10). */
export function accessDetailsRowId(userId: number): string {
    return `access-user-details-${userId}`;
}

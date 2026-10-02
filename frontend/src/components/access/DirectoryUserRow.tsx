import { Building2, Mail, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { TD, TR } from '@/components/ui/table';
import { useTranslation } from '@/i18n/hooks';
import type { UserDirectoryEntry } from '@/types/user';

import { UserAvatar } from './UserAvatar';

interface DirectoryUserRowProps {
    user: UserDirectoryEntry;
}

export function DirectoryUserRow({ user }: DirectoryUserRowProps) {
    const { t } = useTranslation('admin');

    return (
        <TR className="group">
            <TD>
                <div className="flex items-center gap-3">
                    <UserAvatar name={user.name} />
                    <div>
                        <p className="font-medium text-foreground group-hover:text-accent-text transition-colors">{user.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail aria-hidden="true" className="h-3 w-3" />
                            {user.email}
                        </p>
                    </div>
                </div>
            </TD>
            <TD>
                <div className="space-y-1">
                    <p className="text-sm text-foreground flex items-center gap-1.5">
                        <Shield aria-hidden="true" className="h-3.5 w-3.5 text-chart-2" />
                        {user.role_display_name || user.role_name || t('common:fallbacks.unknown')}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Building2 aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        {user.department_name || t('access.table.no_department')}
                    </p>
                </div>
            </TD>
            <TD>
                {/* GAP-D-27: the directory endpoint lists active users only (`User.is_active`
                    filter in `users/directory.py`), so the status is a fact, rendered as a tone Badge. */}
                <Badge tone="success">{t('access.status.active')}</Badge>
            </TD>
            <TD align="right">
                <span className="text-xs text-muted-foreground italic">{t('access.table.view_only')}</span>
            </TD>
        </TR>
    );
}

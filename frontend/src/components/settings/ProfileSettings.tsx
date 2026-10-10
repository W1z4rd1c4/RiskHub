import { User, Mail, Building, Shield, Key, BriefcaseBusiness } from 'lucide-react';
import { getPermissionLabel } from '@/components/access/permissionPresentation';
import { UserAvatar } from '@/components/access/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { InlineMessage } from '@/components/ui/inline-message';
import { useTranslation } from '@/i18n/hooks';

interface ProfileSettingsProps {
    nativeAccount?: boolean;
    user: {
        id: number;
        email: string;
        name: string;
        role: string;
        role_display_name: string;
        entra_business_role?: string | null;
        department_name?: string | null;
        permissions: string[];
        effective_permissions: string[];
        access_scope: 'global' | 'department' | 'manager';
        scope_label: string;
    };
}

export function ProfileSettings({ user, nativeAccount = false }: ProfileSettingsProps) {
    const { t } = useTranslation('settings');

    const effectivePermissions = user.effective_permissions ?? user.permissions ?? [];
    const listedPermissions = effectivePermissions.filter((permission) => permission !== '*:*');

    const fieldLabelClass = 'flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground';

    return (
        <div className="space-y-8">
            {/* User Identity Section */}
            <section>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <User aria-hidden="true" className="h-5 w-5 text-accent-text" />
                    {t('profile.your_identity')}
                </h2>
                <div className="bg-tint/5 border border-border rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <UserAvatar name={user.name} size="lg" />
                        <div>
                            <h3 className="text-xl font-bold text-foreground">{user.name}</h3>
                            <p className="text-muted-foreground">{user.role_display_name}</p>
                        </div>
                    </div>

                    {/* Read-only values are a description list, not form labels (AX-04). */}
                    <dl className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <dt className={fieldLabelClass}>
                                <Mail aria-hidden="true" className="h-3 w-3" />
                                {t('profile.email')}
                            </dt>
                            <dd className="text-foreground font-medium">{user.email}</dd>
                        </div>

                        <div className="space-y-1">
                            <dt className={fieldLabelClass}>
                                <Building aria-hidden="true" className="h-3 w-3" />
                                {t('profile.department')}
                            </dt>
                            <dd className="text-foreground font-medium">{user.department_name || t('common:fallbacks.unassigned')}</dd>
                        </div>

                        <div className="space-y-1">
                            <dt className={fieldLabelClass}>
                                <Shield aria-hidden="true" className="h-3 w-3" />
                                {t('profile.role')}
                            </dt>
                            <dd>
                                <Badge tone="accent" className="px-3">
                                    {user.role_display_name}
                                </Badge>
                            </dd>
                        </div>

                        <div className="space-y-1">
                            <dt className={fieldLabelClass}>
                                <BriefcaseBusiness aria-hidden="true" className="h-3 w-3" />
                                {t('profile.organizational_role')}
                            </dt>
                            <dd className="text-foreground font-medium">
                                {user.entra_business_role || t('common:fallbacks.unassigned')}
                            </dd>
                        </div>

                        <div className="space-y-1">
                            <dt className={fieldLabelClass}>
                                <Key aria-hidden="true" className="h-3 w-3" />
                                {t('profile.access_scope')}
                            </dt>
                            <dd className="text-foreground font-medium">{user.scope_label}</dd>
                        </div>
                    </dl>
                </div>

                {/* AD Notice */}
                <p className="text-xs text-muted-foreground mt-3 italic">
                    {t(nativeAccount ? 'profile.local_notice' : 'profile.ad_notice')}
                </p>
            </section>

            {/* Permissions Section */}
            <section>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Key aria-hidden="true" className="h-5 w-5 text-accent-text" />
                    {t('profile.your_permissions')}
                </h2>
                <div className="bg-tint/5 border border-border rounded-xl p-6">
                    {effectivePermissions.includes('*:*') && (
                        <InlineMessage tone="warning" icon={null} className="mb-4 px-3 py-2 font-medium">
                            {getPermissionLabel('*:*', t)}
                        </InlineMessage>
                    )}
                    {effectivePermissions.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">{t('profile.no_permissions_assigned')}</p>
                    ) : listedPermissions.length > 0 && (
                        <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {listedPermissions.map((permission) => (
                                <li key={permission} className="text-sm text-foreground flex items-center gap-2">
                                    <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-success" />
                                    {getPermissionLabel(permission, t)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {effectivePermissions.length > 0 && (
                        <details className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                            <summary className="cursor-pointer font-medium text-foreground">
                                {t('permissions.technical_details')}
                            </summary>
                            <ul className="mt-2 space-y-1">
                                {effectivePermissions.map((permission) => (
                                    <li key={permission}><code>{permission}</code></li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            </section>
        </div>
    );
}

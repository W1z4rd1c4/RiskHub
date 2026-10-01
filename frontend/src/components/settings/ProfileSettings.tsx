import { User, Mail, Building, Shield, Key, BriefcaseBusiness } from 'lucide-react';
import { getPermissionLabel } from '@/components/access/permissionPresentation';
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

    return (
        <div className="space-y-8">
            {/* User Identity Section */}
            <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" />
                    {t('profile.your_identity')}
                </h3>
                <div className="bg-tint/5 border border-border rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center text-accent-foreground text-2xl font-bold">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-xl font-bold text-foreground">{user.name}</h4>
                            <p className="text-muted-foreground">{user.role_display_name}</p>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Email */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {t('profile.email')}
                            </label>
                            <p className="text-foreground font-medium">{user.email}</p>
                        </div>

                        {/* Department */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {t('profile.department')}
                            </label>
                            <p className="text-foreground font-medium">{user.department_name || t('common:fallbacks.unassigned')}</p>
                        </div>

                        {/* Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {t('profile.role')}
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-accent/10 text-accent-text rounded-full text-sm font-medium">
                                    {user.role_display_name}
                                </span>
                            </div>
                        </div>

                        {/* Organizational Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <BriefcaseBusiness className="h-3 w-3" />
                                {t('profile.organizational_role')}
                            </label>
                            <p className="text-foreground font-medium">
                                {user.entra_business_role || t('common:fallbacks.unassigned')}
                            </p>
                        </div>

                        {/* Access Scope */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                {t('profile.access_scope')}
                            </label>
                            <p className="text-foreground font-medium">{user.scope_label}</p>
                        </div>
                    </div>
                </div>

                {/* AD Notice */}
                <p className="text-xs text-muted-foreground mt-3 italic">
                    {t(nativeAccount ? 'profile.local_notice' : 'profile.ad_notice')}
                </p>
            </section>

            {/* Permissions Section */}
            <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Key className="h-5 w-5 text-accent" />
                    {t('profile.your_permissions')}
                </h3>
                <div className="bg-tint/5 border border-border rounded-xl p-6">
                    {effectivePermissions.includes('*:*') && (
                        <div className="mb-4 px-3 py-2 rounded-lg border border-warning/20 bg-warning/10 text-warning-text text-sm font-medium">
                            {getPermissionLabel('*:*', t)}
                        </div>
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

import { User, Mail, Building, Shield, Key, BriefcaseBusiness } from 'lucide-react';
import { getPermissionLabel } from '@/components/access/permissionPresentation';
import { useTranslation } from '@/i18n/hooks';

interface ProfileSettingsProps {
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

export function ProfileSettings({ user }: ProfileSettingsProps) {
    const { t } = useTranslation('settings');

    const effectivePermissions = user.effective_permissions ?? user.permissions ?? [];
    const listedPermissions = effectivePermissions.filter((permission) => permission !== '*:*');

    return (
        <div className="space-y-8">
            {/* User Identity Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" />
                    {t('profile.your_identity')}
                </h3>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center gap-4 mb-6">
                        {/* Avatar */}
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 className="text-xl font-bold text-white">{user.name}</h4>
                            <p className="text-slate-400">{user.role_display_name}</p>
                        </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Email */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {t('profile.email')}
                            </label>
                            <p className="text-white font-medium">{user.email}</p>
                        </div>

                        {/* Department */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {t('profile.department')}
                            </label>
                            <p className="text-white font-medium">{user.department_name || t('common:fallbacks.unassigned')}</p>
                        </div>

                        {/* Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Shield className="h-3 w-3" />
                                {t('profile.role')}
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 bg-accent/20 text-accent rounded-full text-sm font-medium">
                                    {user.role_display_name}
                                </span>
                            </div>
                        </div>

                        {/* Organizational Role */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <BriefcaseBusiness className="h-3 w-3" />
                                {t('profile.organizational_role')}
                            </label>
                            <p className="text-white font-medium">
                                {user.entra_business_role || t('common:fallbacks.unassigned')}
                            </p>
                        </div>

                        {/* Access Scope */}
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                {t('profile.access_scope')}
                            </label>
                            <p className="text-white font-medium">{user.scope_label}</p>
                        </div>
                    </div>
                </div>

                {/* AD Notice */}
                <p className="text-xs text-slate-500 mt-3 italic">
                    {t('profile.ad_notice')}
                </p>
            </section>

            {/* Permissions Section */}
            <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Key className="h-5 w-5 text-accent" />
                    {t('profile.your_permissions')}
                </h3>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    {effectivePermissions.includes('*:*') && (
                        <div className="mb-4 px-3 py-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 text-yellow-300 text-sm font-medium">
                            {getPermissionLabel('*:*', t)}
                        </div>
                    )}
                    {effectivePermissions.length === 0 ? (
                        <p className="text-slate-400 text-center py-4">{t('profile.no_permissions_assigned')}</p>
                    ) : listedPermissions.length > 0 && (
                        <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {listedPermissions.map((permission) => (
                                <li key={permission} className="text-sm text-slate-300 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {getPermissionLabel(permission, t)}
                                </li>
                            ))}
                        </ul>
                    )}
                    {effectivePermissions.length > 0 && (
                        <details className="mt-5 border-t border-white/10 pt-3 text-xs text-slate-400">
                            <summary className="cursor-pointer font-medium text-slate-300">
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

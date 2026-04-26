import { Building2 } from 'lucide-react';

import { DirectoryUserImportPanel } from '@/components/users/DirectoryUserImportPanel';
import { useTranslation } from '@/i18n/hooks';
import type { AuthConfigResponse } from '@/services/authApi';
import type { DirectoryImportResponse } from '@/types/directory';

interface UserNewDirectoryImportSectionProps {
    authConfig: AuthConfigResponse | null;
    isDirectoryProviderUnavailable: boolean;
    onImported: (result: DirectoryImportResponse) => void;
    onProviderUnavailableChange: (isUnavailable: boolean) => void;
}

export function UserNewDirectoryImportSection({
    authConfig,
    isDirectoryProviderUnavailable,
    onImported,
    onProviderUnavailableChange,
}: UserNewDirectoryImportSectionProps) {
    const { t } = useTranslation('admin');
    const showDirectorySetupHint = Boolean(authConfig?.sso_error) || isDirectoryProviderUnavailable;

    return (
        <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-accent" />
                {t('users.add_from_ad', { defaultValue: 'Add from AD' })}
            </h2>
            <p className="text-sm text-slate-400">
                {t('user_new.sso_import_help', {
                    defaultValue:
                        'Import a user from directory, then configure role, department, and active status before first login.',
                })}
            </p>
            {showDirectorySetupHint && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <p className="font-medium">
                        {t('user_new.directory_setup_hint_title', {
                            defaultValue: 'Directory provider setup required',
                        })}
                    </p>
                    <p className="mt-1 text-amber-100/90">
                        {t('user_new.directory_setup_hint_body', {
                            defaultValue:
                                'Configure Entra credentials (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, plus client secret or certificate credential) or AD emulator (AD_EMULATOR_BASE_URL), then reload.',
                        })}
                    </p>
                    {authConfig?.sso_error && (
                        <p className="mt-2 text-xs text-amber-100/80">{authConfig.sso_error}</p>
                    )}
                </div>
            )}
            <DirectoryUserImportPanel
                onImported={onImported}
                onProviderUnavailableChange={onProviderUnavailableChange}
            />
        </div>
    );
}

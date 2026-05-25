import { ArrowLeft, Shield, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import type { DirectoryImportResponse } from '@/types/directory';
import { useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';

import { UserNewDirectoryImportSection } from './users/UserNewDirectoryImportSection';
import { UserNewLocalForm } from './users/UserNewLocalForm';
import { useLocalUserCreateWorkflow } from './users/useLocalUserCreateWorkflow';
import { useUserNewPageAccess } from './users/useUserNewPageAccess';

export function UserNewPage() {
    const navigate = useNavigate();
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const {
        authConfig,
        authConfigError,
        directoryCapabilities,
        isAuthConfigLoading,
        isDirectoryProviderUnavailable,
        setIsDirectoryProviderUnavailable,
    } = useUserNewPageAccess(t);

    const handleDirectoryImported = (result: DirectoryImportResponse) => {
        void navigate('/users', {
            state: {
                importedUserId: result.user_id,
                importedUserName: result.name,
            },
        });
    };

    const isDirectoryFirstMode = authConfig?.auth_mode
        ? authConfig.auth_mode !== 'password'
        : false;
    const canCreateLocalUser = resolveCapabilityFlag(directoryCapabilities, 'can_create_local_user');
    const canImportDirectoryUser = resolveCapabilityFlag(directoryCapabilities, 'can_import_directory_user');
    const localUserWorkflow = useLocalUserCreateWorkflow({
        enabled: !isDirectoryFirstMode && canCreateLocalUser,
        onCreated: () => {
            void navigate('/users');
        },
    });

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => {
                        void navigate('/users');
                    }}
                    className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    {t('user_new.back_to_users', { ns: 'admin' })}
                </button>
            </div>

            <div className="flex items-center gap-4 mb-2">
                <div className="bg-accent/20 p-3 rounded-2xl">
                    <UserPlus className="h-6 w-6 text-accent" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('user_new.title', { ns: 'admin' })}</h1>
                    <p className="text-slate-400">{t('user_new.subtitle', { ns: 'admin' })}</p>
                </div>
            </div>

            {localUserWorkflow.errorKey && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>{t(localUserWorkflow.errorKey, { ns: 'errorKeys' })}</p>
                </div>
            )}

            {isAuthConfigLoading ? (
                <div className="glass-card p-6 text-slate-300">
                    {t('user_new.loading_auth_mode', { ns: 'admin' })}
                </div>
            ) : authConfigError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>
                        {t('user_new.auth_mode_load_failed', { ns: 'admin' })}
                    </p>
                </div>
            ) : isDirectoryFirstMode && canImportDirectoryUser ? (
                <UserNewDirectoryImportSection
                    authConfig={authConfig}
                    isDirectoryProviderUnavailable={isDirectoryProviderUnavailable}
                    onImported={handleDirectoryImported}
                    onProviderUnavailableChange={setIsDirectoryProviderUnavailable}
                />
            ) : !isDirectoryFirstMode && canCreateLocalUser ? (
                <UserNewLocalForm
                    departments={localUserWorkflow.departments}
                    formData={localUserWorkflow.formData}
                    isLoading={localUserWorkflow.isLoading}
                    onCancel={() => {
                        void navigate('/users');
                    }}
                    onSubmit={localUserWorkflow.handleSubmit}
                    roles={localUserWorkflow.roles}
                    setFormData={localUserWorkflow.setFormData}
                />
            ) : (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-3">
                    <Shield className="h-5 w-5 shrink-0" />
                    <p>{t('access.denied', { ns: 'common' })}</p>
                </div>
            )}
        </div>
    );
}

export default UserNewPage;

import { UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { InlineMessage } from '@/components/ui/inline-message';
import { AccessDeniedState, ErrorState, LoadingState } from '@/components/ui/state';
import type { DirectoryImportResponse } from '@/types/directory';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { useSessionSnapshot } from '@/services/session';
import { NativeInviteForm } from './users/NativeInviteForm';

import { UserNewDirectoryImportSection } from './users/UserNewDirectoryImportSection';
import { UserNewLocalForm } from './users/UserNewLocalForm';
import { useLocalUserCreateWorkflow } from './users/useLocalUserCreateWorkflow';
import { useUserNewPageAccess } from './users/useUserNewPageAccess';

export function UserNewPage() {
    const navigate = useNavigate();
    const session = useSessionSnapshot();
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const {
        authConfig,
        retryAccess,
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
    const isNative = authConfig?.identity?.mode === 'native';
    const canInvite = resolveCapabilityFlag(session.user?.me_capabilities?.identity, 'can_invite_users');
    const canCreateLocalUser = resolveCapabilityFlag(directoryCapabilities, 'can_create_local_user');
    const canImportDirectoryUser = resolveCapabilityFlag(directoryCapabilities, 'can_import_directory_user');
    const localUserWorkflow = useLocalUserCreateWorkflow({
        enabled: !isNative && !isDirectoryFirstMode && canCreateLocalUser,
        onCreated: () => {
            void navigate('/users');
        },
    });

    return (
        <PageContainer size="form">
            <PageHeader
                title={t('user_new.title', { ns: 'admin' })}
                description={t('user_new.subtitle', { ns: 'admin' })}
                icon={UserPlus}
                back={{ label: t('user_new.back_to_users', { ns: 'admin' }), onClick: () => void navigate('/users') }}
                breadcrumbs={[
                    { label: t('sidebar.users', { ns: 'navigation' }), to: '/users' },
                    { label: t('user_new.title', { ns: 'admin' }) },
                ]}
            />

            {localUserWorkflow.errorKey && (
                <InlineMessage tone="danger">{translateUiMessage(t, localUserWorkflow.errorKey)}</InlineMessage>
            )}

            {/* DS-17 / SM-07: one loading, error (with retry) and access-denied
                rendering, from the shared state primitives. */}
            {isAuthConfigLoading ? (
                <LoadingState layout="section" label={t('user_new.loading_auth_mode', { ns: 'admin' })} />
            ) : authConfigError ? (
                <ErrorState
                    message={t('user_new.auth_mode_load_failed', { ns: 'admin' })}
                    onRetry={retryAccess}
                    retryLabel={t('native_users.retry', { ns: 'admin' })}
                />
            ) : isNative ? (
                canInvite ? <NativeInviteForm /> : <AccessDeniedState layout="section" />
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
                <AccessDeniedState layout="section" />
            )}
        </PageContainer>
    );
}

export default UserNewPage;

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuthz } from '@/authz/useAuthz';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { UsersFilterBar } from '@/components/access/UsersFilterBar';
import { UsersTable } from '@/components/access/UsersTable';
import { useAccessUsersWorkflow } from '@/components/access/useAccessUsersWorkflow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/tables/Pagination';
import { ADUserPicker } from '@/components/users/ADUserPicker';
import { useAuth } from '@/contexts/AuthContext';
import { InlineMessage } from '@/components/ui/inline-message';
import { ErrorState } from '@/components/ui/state';
import { translateUiMessage, useTranslation } from '@/i18n/hooks';
import { resolveCapabilityFlag } from '@/lib/capabilities';
import { adminApi } from '@/services/adminApi';
import { logError } from '@/services/logger';
import type { AccessUserRead } from '@/types/access';
import type { DirectoryImportResponse } from '@/types/directory';
import { useDepartmentRegisterScope } from './departments/useDepartmentRegisterScope';
import { ReadAccessDeniedState } from './shared/ReadAccessDeniedState';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

import { BreakGlassEnableDialog } from './users/BreakGlassEnableDialog';
import { useUserLifecycleActions } from './users/useUserLifecycleActions';
import { useUsersAuthMode } from './users/useUsersAuthMode';
import { DIRECTORY_PAGE_SIZE, useUsersPageData } from './users/useUsersPageData';
import { UsersAccessStats } from './users/UsersAccessStats';
import { UsersPageHeader } from './users/UsersPageHeader';
import type { UsersPageLocationState, UsersPageMode } from './users/usersPageTypes';

type UsersPageOutcome = {
    kind: 'status' | 'alert';
    message: string;
};

function resolveUsersPageMode(authz: ReturnType<typeof useAuthz>): UsersPageMode {
    if (authz.canViewAccessUsers) return 'access';
    if (authz.canViewDepartmentAccessUsers) return 'department-access';
    if (authz.canViewUserDirectory) return 'directory';
    return 'forbidden';
}

export function UsersPage() {
    const departmentScope = useDepartmentRegisterScope();
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const { user: currentUser } = useAuth();
    const authz = useAuthz();
    const location = useLocation();
    const navigate = useNavigate();
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isADPickerOpen, setIsADPickerOpen] = useState(false);
    const [outcome, setOutcome] = useState<UsersPageOutcome | null>(null);
    const [isCheckingAllDirectory, setIsCheckingAllDirectory] = useState(false);
    const [checkingDirectoryUserId, setCheckingDirectoryUserId] = useState<number | null>(null);
    const checkingDirectoryUserIdRef = useRef<number | null>(null);

    const locationState = location.state as UsersPageLocationState;
    const pageMode = departmentScope
        ? (authz.canViewDepartmentAccess ? 'department-access' : 'forbidden')
        : resolveUsersPageMode(authz);
    const isAccessMode = pageMode === 'access' || pageMode === 'department-access';
    const isDirectoryMode = pageMode === 'directory';
    const {
        authMode,
        identity,
        retryAuthConfig,
        authModeError,
        authModeStatus,
        isAuthModeReady,
    } = useUsersAuthMode();
    const {
        directoryAvailableRoles,
        directoryCapabilities,
        directoryPage,
        directoryTotal,
        fetchUsers,
        applyCommittedUser,
        filters,
        isLoading,
        loadErrorKey,
        setDirectoryPage,
        users,
    } = useUsersPageData({
        currentUserLoaded: Boolean(currentUser),
        departmentId: departmentScope?.departmentId,
        loadDirectoryCapabilities: authz.canViewUserDirectory,
        pageMode,
    });
    const accessWorkflow = useAccessUsersWorkflow({
        importedUserId: locationState?.importedUserId,
        importedUserName: locationState?.importedUserName,
        isAccessMode,
        users,
    });

    const {
        breakGlassHours,
        breakGlassError,
        breakGlassReason,
        breakGlassUser,
        confirmDialogOpen,
        handleBreakGlassClose,
        handleBreakGlassOpen,
        handleBreakGlassSubmit,
        handleToggleClose,
        handleToggleClick,
        isBreakGlassSubmitting,
        isToggling,
        setBreakGlassHours,
        setBreakGlassReason,
        toggleUserStatus,
        userToToggle,
    } = useUserLifecycleActions({
        refreshUsers: fetchUsers,
        setOutcome,
        t,
    });

    useEffect(() => {
        if (!selectedUser) return;
        const current = users.find((candidate) => candidate.id === selectedUser.id);
        if (current && current !== selectedUser) setSelectedUser(current);
    }, [users, selectedUser]);

    const handleEditAccess = (user: AccessUserRead) => {
        setSelectedUser(user);
        setEditModalOpen(true);
    };

    const handleAccessSaved = (updated: AccessUserRead) => {
        applyCommittedUser(updated);
        setSelectedUser(updated);
        setOutcome({ kind: 'status', message: t('native_users.access_saved') });
        void fetchUsers();
    };

    const handleDirectoryImported = async (result: DirectoryImportResponse) => {
        setOutcome({
            kind: 'status',
            message: t('users.directory_import_success', {
                name: result.name,
            }),
        });
        setIsADPickerOpen(false);
        await fetchUsers();
    };

    const handleAddUser = () => {
        if (isDirectoryFirstMode) {
            setIsADPickerOpen(true);
            return;
        }
        void navigate('/users/new');
    };

    const handleCheckAllDirectory = async () => {
        if (isCheckingAllDirectory) return;
        try {
            setOutcome(null);
            setIsCheckingAllDirectory(true);
            const response = await adminApi.checkAllDirectoryUsers();
            setOutcome({
                kind: 'status',
                message: t('users.directory_check_all_success', {
                    checked: response.checked,
                    deprovisioned: response.deprovisioned,
                }),
            });
            await fetchUsers();
        } catch (error) {
            logError('Directory check-all failed.', error);
            setOutcome({
                kind: 'alert',
                message: `${t('users.directory_check_failed')} ${t('users.directory_retry_help')}`,
            });
        } finally {
            setIsCheckingAllDirectory(false);
        }
    };

    const handleCheckSingleDirectory = async (user: AccessUserRead) => {
        if (checkingDirectoryUserIdRef.current !== null) return;

        checkingDirectoryUserIdRef.current = user.id;
        try {
            setOutcome(null);
            setCheckingDirectoryUserId(user.id);
            const response = await adminApi.checkDirectoryUser(user.id);
            setOutcome({
                kind: 'status',
                message: t('users.directory_check_single_success', {
                    name: user.name,
                    status: response.status,
                }),
            });
            await fetchUsers();
        } catch (error) {
            logError('Directory single-user check failed.', error);
            setOutcome({
                kind: 'alert',
                message: `${t('users.directory_check_failed')} ${t('users.directory_retry_help')}`,
            });
        } finally {
            checkingDirectoryUserIdRef.current = null;
            setCheckingDirectoryUserId(null);
        }
    };

    useEffect(() => {
        const transition = accessWorkflow.importedUserTransition;
        if (!transition) return;

        setSelectedUser(transition.user);
        setEditModalOpen(true);
        setOutcome({
            kind: 'status',
            message: t('users.directory_import_success', {
                name: transition.messageName,
            }),
        });
        void navigate('/users', { replace: true, state: null });
    }, [accessWorkflow.importedUserTransition, navigate, t]);

    if (currentUser && pageMode === 'forbidden') {
        return (
            <PageContainer>
                <PageHeader title={t('users.title')} />
                <ReadAccessDeniedState />
            </PageContainer>
        );
    }

    const displayUsers = isAccessMode ? filters.filteredAccessUsers : [];
    const displayDirectoryUsers = !isAccessMode ? filters.filteredDirectoryUsers : [];
    const showAccessStats = isAccessMode && !loadErrorKey;
    const adminRoleFacet = directoryAvailableRoles.find((role) => role.name === 'admin');
    const accessRoleOptions = [
        ...(adminRoleFacet ? [{ value: adminRoleFacet.name, label: adminRoleFacet.display_name }] : []),
        { value: 'cro', label: t('access.roles.cros') },
        { value: 'risk_manager', label: t('access.roles.risk_managers') },
        { value: 'department_head', label: t('access.roles.dept_heads') },
        { value: 'employee', label: t('access.roles.control_owners') },
    ];
    const roleOptions = isAccessMode
        ? accessRoleOptions
        : (resolveCapabilityFlag(directoryCapabilities, 'can_use_role_facets') ? directoryAvailableRoles : []).map((role) => ({
            value: role.name,
            label: role.display_name,
        }));
    const totalCount = isAccessMode ? users.length : directoryTotal;
    const activeCount = isAccessMode
        ? users.filter((user) => user.is_active).length
        : directoryTotal;
    const privilegedCount = isAccessMode
        ? users.filter((user) => user.access_scope === 'global' && user.role.name !== 'admin').length
        : 0;
    const isDirectoryFirstMode = isAuthModeReady && authMode !== null && authMode !== 'password';
    const nativeLifecycle = identity?.mode === 'native' && resolveCapabilityFlag(currentUser?.me_capabilities?.identity, 'can_invite_users');
    const canCreateLocalUser = identity?.mode === 'native' ? nativeLifecycle : resolveCapabilityFlag(directoryCapabilities, 'can_create_local_user');
    const canCheckDirectory = resolveCapabilityFlag(currentUser?.me_capabilities?.identity, 'can_check_directory_users');
    const canImportDirectoryUser = resolveCapabilityFlag(directoryCapabilities, 'can_import_directory_user');
    const allowAuthModeActions = isAuthModeReady
        && (isDirectoryFirstMode ? canImportDirectoryUser : canCreateLocalUser);
    const directoryTotalPages = Math.max(1, Math.ceil(directoryTotal / DIRECTORY_PAGE_SIZE));

    return (
        <PageContainer className="animate-in fade-in duration-500">
            <UsersPageHeader
                allowAuthModeActions={allowAuthModeActions}
                canRunDirectoryCheck={canCheckDirectory}
                isAccessMode={isAccessMode}
                isCheckingAllDirectory={isCheckingAllDirectory}
                isDirectoryFirstMode={isDirectoryFirstMode}
                onAddUser={handleAddUser}
                onCheckAllDirectory={handleCheckAllDirectory}
            />

            {authModeStatus === 'error' && authModeError && (
                // SM-07: a region-scoped load failure is the shared error banner with retry.
                <ErrorState
                    variant="banner"
                    message={authModeError}
                    onRetry={retryAuthConfig}
                    retryLabel={t('native_users.retry')}
                />
            )}

            {outcome && (
                // SM-15: success and failure outcomes share the tone-driven banner
                // (role=status for success, role=alert for failure).
                <InlineMessage
                    tone={outcome.kind === 'alert' ? 'danger' : 'success'}
                    onDismiss={() => setOutcome(null)}
                >
                    {outcome.message}
                </InlineMessage>
            )}

            {showAccessStats && (
                <UsersAccessStats
                    activeCount={activeCount}
                    isPlatformAdmin={authz.isPlatformAdmin}
                    privilegedCount={privilegedCount}
                    totalCount={totalCount}
                    users={users}
                />
            )}

            <div className="glass-card p-6">
                <UsersFilterBar
                    isAccessMode={isAccessMode}
                    roleOptions={roleOptions}
                    searchTerm={filters.searchTerm}
                    setSearchTerm={filters.setSearchTerm}
                    roleFilter={filters.roleFilter}
                    setRoleFilter={filters.setRoleFilter}
                    scopeFilter={filters.scopeFilter}
                    setScopeFilter={filters.setScopeFilter}
                    permResourceFilter={filters.permResourceFilter}
                    setPermResourceFilter={filters.setPermResourceFilter}
                    permActionFilter={filters.permActionFilter}
                    setPermActionFilter={filters.setPermActionFilter}
                    hasPermFilters={filters.hasPermFilters}
                    resetPermissionFilters={filters.resetPermissionFilters}
                    filteredCount={filters.filteredAccessUsers.length}
                    totalCount={totalCount}
                />

                {loadErrorKey && !isLoading ? (
                    <ErrorState
                        title={translateUiMessage(t, loadErrorKey)}
                        message={t('users.load_failed_help', { ns: 'admin' })}
                        onRetry={() => void fetchUsers()}
                        retryLabel={t('actions.retry', { ns: 'common' })}
                    />
                ) : (
                    <UsersTable
                        actionModelsByUserId={accessWorkflow.actionModelsByUserId}
                        isAccessMode={isAccessMode}
                        isLoading={isLoading}
                        accessUsers={displayUsers}
                        directoryUsers={displayDirectoryUsers}
                        expandedUserId={expandedUserId}
                        onToggleExpand={(userId) => setExpandedUserId(expandedUserId === userId ? null : userId)}
                        onEditAccess={handleEditAccess}
                        onManageIdentity={nativeLifecycle ? handleEditAccess : undefined}
                        onToggleStatus={handleToggleClick}
                        onBreakGlassEnable={handleBreakGlassOpen}
                        canRunDirectoryChecks={canCheckDirectory}
                        checkingDirectoryUserId={checkingDirectoryUserId}
                        onCheckDirectory={handleCheckSingleDirectory}
                        presentationModelsByUserId={accessWorkflow.presentationModelsByUserId}
                    />
                )}

                {isDirectoryMode && directoryTotalPages > 1 && (
                    <Pagination
                        className="mt-6"
                        currentPage={directoryPage}
                        totalPages={directoryTotalPages}
                        totalItems={directoryTotal}
                        itemsPerPage={DIRECTORY_PAGE_SIZE}
                        onPageChange={setDirectoryPage}
                    />
                )}
            </div>

            <AccessEditModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                user={selectedUser}
                onSaved={handleAccessSaved}
                nativeLifecycle={nativeLifecycle}
                onRefresh={() => void fetchUsers()}
            />

            <ConfirmDialog
                isOpen={confirmDialogOpen}
                onClose={handleToggleClose}
                onConfirm={toggleUserStatus}
                intent={userToToggle?.is_active ? 'revoke' : 'generic'}
                title={userToToggle?.is_active ? t('access.confirmation.deactivate_user_title') : t('access.confirmation.reactivate_user_title')}
                message={t('access.confirmation.toggle_user_message', {
                    action: userToToggle?.is_active ? t('access.actions.deactivate') : t('access.actions.reactivate'),
                    name: userToToggle?.name ?? '',
                })}
                confirmLabel={userToToggle?.is_active ? t('access.actions.deactivate') : t('access.actions.reactivate')}
                isLoading={isToggling}
            />

            <ADUserPicker
                isOpen={isADPickerOpen}
                onClose={() => setIsADPickerOpen(false)}
                onImported={handleDirectoryImported}
            />

            <BreakGlassEnableDialog
                breakGlassHours={breakGlassHours}
                errorMessage={breakGlassError}
                breakGlassReason={breakGlassReason}
                breakGlassUser={breakGlassUser}
                isBreakGlassSubmitting={isBreakGlassSubmitting}
                onClose={handleBreakGlassClose}
                onHoursChange={setBreakGlassHours}
                onReasonChange={setBreakGlassReason}
                onSubmit={handleBreakGlassSubmit}
            />
        </PageContainer>
    );
}

export default UsersPage;

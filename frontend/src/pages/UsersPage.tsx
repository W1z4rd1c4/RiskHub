import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuthz } from '@/authz/useAuthz';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { UsersFilterBar } from '@/components/access/UsersFilterBar';
import { UsersTable } from '@/components/access/UsersTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pagination } from '@/components/tables/Pagination';
import { ADUserPicker } from '@/components/users/ADUserPicker';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/i18n/hooks';
import { adminApi } from '@/services/adminApi';
import { logError } from '@/services/logger';
import type { AccessUserRead } from '@/types/access';
import type { DirectoryImportResponse } from '@/types/directory';

import { BreakGlassEnableDialog } from './users/BreakGlassEnableDialog';
import { useUserLifecycleActions } from './users/useUserLifecycleActions';
import { useUsersAuthMode } from './users/useUsersAuthMode';
import { DIRECTORY_PAGE_SIZE, useUsersPageData } from './users/useUsersPageData';
import { UsersAccessStats } from './users/UsersAccessStats';
import { UsersPageHeader } from './users/UsersPageHeader';
import type { UsersPageLocationState, UsersPageMode } from './users/usersPageTypes';

function resolveUsersPageMode(authz: ReturnType<typeof useAuthz>): UsersPageMode {
    if (authz.canViewAccessUsers) return 'access';
    if (authz.canViewDepartmentAccessUsers) return 'department-access';
    if (authz.canViewUserDirectory) return 'directory';
    return 'forbidden';
}

export function UsersPage() {
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const { user: currentUser } = usePermissions();
    const authz = useAuthz();
    const location = useLocation();
    const navigate = useNavigate();
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isADPickerOpen, setIsADPickerOpen] = useState(false);
    const [directoryMessage, setDirectoryMessage] = useState<string | null>(null);
    const [isCheckingAllDirectory, setIsCheckingAllDirectory] = useState(false);
    const [checkingDirectoryUserId, setCheckingDirectoryUserId] = useState<number | null>(null);

    const locationState = location.state as UsersPageLocationState;
    const pageMode = resolveUsersPageMode(authz);
    const isAccessMode = pageMode === 'access' || pageMode === 'department-access';
    const isDirectoryMode = pageMode === 'directory';
    const {
        authMode,
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
        filters,
        isLoading,
        loadErrorKey,
        setDirectoryPage,
        users,
    } = useUsersPageData({
        currentUserLoaded: Boolean(currentUser),
        loadDirectoryCapabilities: authz.isPlatformAdmin,
        pageMode,
    });

    const {
        breakGlassHours,
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
        setDirectoryMessage,
        t,
    });

    const handleEditAccess = (user: AccessUserRead) => {
        setSelectedUser(user);
        setEditModalOpen(true);
    };

    const handleAccessSaved = () => {
        void fetchUsers();
    };

    const handleDirectoryImported = async (result: DirectoryImportResponse) => {
        setDirectoryMessage(
            t('users.directory_import_success', {
                defaultValue: `${result.name} imported from directory`,
                name: result.name,
            }),
        );
        setIsADPickerOpen(false);
        await fetchUsers();
    };

    const handleCheckAllDirectory = async () => {
        try {
            setIsCheckingAllDirectory(true);
            const response = await adminApi.checkAllDirectoryUsers();
            setDirectoryMessage(
                t('users.directory_check_all_success', {
                    defaultValue: `Checked ${response.checked} users (${response.deprovisioned} deprovisioned).`,
                    checked: response.checked,
                    deprovisioned: response.deprovisioned,
                }),
            );
            await fetchUsers();
        } catch (error) {
            logError('Directory check-all failed.', error);
            setDirectoryMessage(t('users.directory_check_failed', { defaultValue: 'Directory check failed.' }));
        } finally {
            setIsCheckingAllDirectory(false);
        }
    };

    const handleCheckSingleDirectory = async (user: AccessUserRead) => {
        try {
            setCheckingDirectoryUserId(user.id);
            const response = await adminApi.checkDirectoryUser(user.id);
            setDirectoryMessage(
                t('users.directory_check_single_success', {
                    defaultValue: `${user.name}: ${response.status}`,
                    name: user.name,
                    status: response.status,
                }),
            );
            await fetchUsers();
        } catch (error) {
            logError('Directory single-user check failed.', error);
            setDirectoryMessage(t('users.directory_check_failed', { defaultValue: 'Directory check failed.' }));
        } finally {
            setCheckingDirectoryUserId(null);
        }
    };

    useEffect(() => {
        if (!isAccessMode || !locationState?.importedUserId || users.length === 0) return;

        const importedUser = users.find((candidate) => candidate.id === locationState.importedUserId);
        if (!importedUser) return;

        setSelectedUser(importedUser);
        setEditModalOpen(true);
        setDirectoryMessage(
            t('users.directory_import_success', {
                defaultValue: `${locationState.importedUserName ?? importedUser.name} imported from directory`,
                name: locationState.importedUserName ?? importedUser.name,
            }),
        );
        void navigate('/users', { replace: true, state: null });
    }, [isAccessMode, locationState, navigate, t, users]);

    if (currentUser && pageMode === 'forbidden') {
        return <Navigate to="/" replace />;
    }

    const displayUsers = isAccessMode ? filters.filteredAccessUsers : [];
    const displayDirectoryUsers = !isAccessMode ? filters.filteredDirectoryUsers : [];
    const showAccessStats = isAccessMode && !loadErrorKey;
    const accessRoleOptions = [
        ...(authz.isPlatformAdmin ? [{ value: 'admin', label: t('access.roles.admins') }] : []),
        { value: 'cro', label: t('access.roles.cros') },
        { value: 'risk_manager', label: t('access.roles.risk_managers') },
        { value: 'department_head', label: t('access.roles.dept_heads') },
        { value: 'employee', label: t('access.roles.control_owners') },
    ];
    const roleOptions = isAccessMode
        ? accessRoleOptions
        : (directoryCapabilities?.can_use_role_facets === true ? directoryAvailableRoles : []).map((role) => ({
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
    const canCreateLocalUser = directoryCapabilities?.can_create_local_user === true;
    const canImportDirectoryUser = directoryCapabilities?.can_import_directory_user === true;
    const allowAuthModeActions = isAuthModeReady
        && (isDirectoryFirstMode ? canImportDirectoryUser : canCreateLocalUser);
    const directoryTotalPages = Math.max(1, Math.ceil(directoryTotal / DIRECTORY_PAGE_SIZE));

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <UsersPageHeader
                allowAuthModeActions={allowAuthModeActions}
                canRunDirectoryCheck={canImportDirectoryUser}
                isAccessMode={isAccessMode}
                isCheckingAllDirectory={isCheckingAllDirectory}
                isDirectoryFirstMode={isDirectoryFirstMode}
                onCheckAllDirectory={handleCheckAllDirectory}
            />

            {authModeStatus === 'error' && authModeError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {authModeError}
                </div>
            )}

            {directoryMessage && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    {directoryMessage}
                </div>
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
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-6 text-sm text-rose-100">
                        <p className="font-medium">
                            {t(loadErrorKey, {
                                ns: 'errorKeys',
                                defaultValue: t('users.load_failed', {
                                    ns: 'admin',
                                    defaultValue: 'Unable to load users right now.',
                                }),
                            })}
                        </p>
                        <p className="mt-2 text-rose-100/80">
                            {t('users.load_failed_help', {
                                ns: 'admin',
                                defaultValue: 'Refresh the page data before treating this as an empty result.',
                            })}
                        </p>
                        <button
                            type="button"
                            onClick={() => void fetchUsers()}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-50 transition hover:bg-rose-500/20"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t('actions.retry', { ns: 'common', defaultValue: 'Retry' })}
                        </button>
                    </div>
                ) : (
                    <UsersTable
                        isAccessMode={isAccessMode}
                        isLoading={isLoading}
                        accessUsers={displayUsers}
                        directoryUsers={displayDirectoryUsers}
                        expandedUserId={expandedUserId}
                        onToggleExpand={(userId) => setExpandedUserId(expandedUserId === userId ? null : userId)}
                        onEditAccess={handleEditAccess}
                        onToggleStatus={handleToggleClick}
                        onBreakGlassEnable={handleBreakGlassOpen}
                        canRunDirectoryChecks={directoryCapabilities?.can_import_directory_user === true}
                        checkingDirectoryUserId={checkingDirectoryUserId}
                        onCheckDirectory={handleCheckSingleDirectory}
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
            />

            <ConfirmDialog
                isOpen={confirmDialogOpen}
                onClose={handleToggleClose}
                onConfirm={toggleUserStatus}
                title={userToToggle?.is_active ? t('access.confirmation.deactivate_user_title') : t('access.confirmation.reactivate_user_title')}
                message={t('access.confirmation.toggle_user_message', {
                    action: userToToggle?.is_active ? t('access.actions.deactivate') : t('access.actions.reactivate'),
                    name: userToToggle?.name ?? '',
                })}
                confirmLabel={userToToggle?.is_active ? t('access.actions.deactivate') : t('access.actions.reactivate')}
                variant={userToToggle?.is_active ? 'danger' : 'info'}
                isLoading={isToggling}
            />

            <ADUserPicker
                isOpen={isADPickerOpen}
                onClose={() => setIsADPickerOpen(false)}
                onImported={handleDirectoryImported}
            />

            <BreakGlassEnableDialog
                breakGlassHours={breakGlassHours}
                breakGlassReason={breakGlassReason}
                breakGlassUser={breakGlassUser}
                isBreakGlassSubmitting={isBreakGlassSubmitting}
                onClose={handleBreakGlassClose}
                onHoursChange={setBreakGlassHours}
                onReasonChange={setBreakGlassReason}
                onSubmit={handleBreakGlassSubmit}
            />
        </div>
    );
}

export default UsersPage;

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '@/i18n/hooks';
import {
    Users,
    UserPlus,
    UserCheck,
    Crown,
    Server,
    RefreshCw,
    Building2,
} from 'lucide-react';
import { accessApi } from '@/services/accessApi';
import { adminApi } from '@/services/adminApi';
import { apiClient } from '@/services/apiClient';
import { userDirectoryApi } from '@/services/userDirectoryApi';
import { logError } from '@/services/logger';
import type { AuthMode } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import { isAuthUnavailableError } from '@/services/authRequest';
import type { AccessUserRead } from '@/types/access';
import type { DirectoryImportResponse } from '@/types/directory';
import type { UserDirectoryEntry, UserDirectoryRoleFacet } from '@/types/user';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthz } from '@/authz/useAuthz';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useUsersPageFilters } from '@/hooks/useUsersPageFilters';
import { UsersFilterBar } from '@/components/access/UsersFilterBar';
import { UsersTable } from '@/components/access/UsersTable';
import { ADUserPicker } from '@/components/users/ADUserPicker';
import { Pagination } from '@/components/tables/Pagination';
import { useUserLifecycleActions } from './users/useUserLifecycleActions';

const DIRECTORY_PAGE_SIZE = 50;

type UsersPageMode = 'access' | 'department-access' | 'directory' | 'forbidden';
type UsersPageLocationState = {
    importedUserId?: number;
    importedUserName?: string;
} | null;

export function UsersPage() {
    const { t } = useTranslation(['admin', 'common', 'errorKeys']);
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryEntry[]>([]);
    const [directoryAvailableRoles, setDirectoryAvailableRoles] = useState<UserDirectoryRoleFacet[]>([]);
    const [directoryTotal, setDirectoryTotal] = useState(0);
    const [directoryPage, setDirectoryPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isADPickerOpen, setIsADPickerOpen] = useState(false);
    const [directoryMessage, setDirectoryMessage] = useState<string | null>(null);
    const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
    const [isCheckingAllDirectory, setIsCheckingAllDirectory] = useState(false);
    const [checkingDirectoryUserId, setCheckingDirectoryUserId] = useState<number | null>(null);
    const [authMode, setAuthMode] = useState<AuthMode | null>(null);
    const [authModeStatus, setAuthModeStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [authModeError, setAuthModeError] = useState<string | null>(null);

    const { canManageUsers, user: currentUser } = usePermissions();
    const authz = useAuthz();
    const location = useLocation();
    const navigate = useNavigate();
    const locationState = location.state as UsersPageLocationState;
    const pageMode: UsersPageMode = authz.canViewAccessUsers
        ? 'access'
        : authz.canViewDepartmentAccessUsers
            ? 'department-access'
            : authz.canViewUserDirectory
                ? 'directory'
                : 'forbidden';
    const isAccessMode = pageMode === 'access' || pageMode === 'department-access';
    const isDirectoryMode = pageMode === 'directory';

    const filters = useUsersPageFilters({
        accessUsers: users,
        directoryUsers: directoryUsers,
    });

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadErrorKey(null);
            if (pageMode === 'access') {
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                setDirectoryUsers([]);
                setDirectoryAvailableRoles([]);
                setDirectoryTotal(0);
            } else if (pageMode === 'department-access') {
                const data = await accessApi.listDepartmentAccessUsers();
                setUsers(data);
                setDirectoryUsers([]);
                setDirectoryAvailableRoles([]);
                setDirectoryTotal(0);
            } else if (pageMode === 'directory') {
                const data = await userDirectoryApi.listDirectoryUsers({
                    q: filters.searchTerm || undefined,
                    role_name: filters.roleFilter !== 'all' ? filters.roleFilter : undefined,
                    skip: (directoryPage - 1) * DIRECTORY_PAGE_SIZE,
                    limit: DIRECTORY_PAGE_SIZE,
                });
                setUsers([]);
                setDirectoryUsers(data.items);
                setDirectoryAvailableRoles(data.available_roles ?? []);
                setDirectoryTotal(data.total);
            } else {
                setUsers([]);
                setDirectoryUsers([]);
                setDirectoryAvailableRoles([]);
                setDirectoryTotal(0);
            }
        } catch (error) {
            logError('Failed to fetch users.', error);
            setUsers([]);
            setDirectoryUsers([]);
            setDirectoryAvailableRoles([]);
            setDirectoryTotal(0);
            setLoadErrorKey(apiClient.toUiMessageKey(error));
        } finally {
            setIsLoading(false);
        }
    }, [directoryPage, filters.roleFilter, filters.searchTerm, pageMode]);

    useEffect(() => {
        // Wait for user to be loaded before fetching
        if (currentUser && pageMode !== 'forbidden') {
            void fetchUsers();
        }
    }, [currentUser, fetchUsers, pageMode]);

    useEffect(() => {
        if (isDirectoryMode) {
            setDirectoryPage(1);
        }
    }, [filters.roleFilter, filters.searchTerm, isDirectoryMode]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthMode(config.auth_mode);
                setAuthModeStatus('ready');
                setAuthModeError(null);
            } catch (error) {
                if (cancelled) return;
                logError('Failed to load auth mode for UsersPage.', error);
                setAuthMode(null);
                setAuthModeStatus('error');
                setAuthModeError(
                    isAuthUnavailableError(error)
                        ? t('users.auth_mode_service_unavailable', {
                            defaultValue: 'Authentication mode is temporarily unavailable. User data remains visible, but create and directory actions are disabled until configuration is available again.',
                        })
                        : t('users.auth_mode_load_failed', {
                            defaultValue: 'Unable to load authentication mode. User data remains visible, but create and directory actions are disabled until the page can load configuration.',
                        }),
                );
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [t]);

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

    // Compute display values
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
        : (directoryAvailableRoles ?? []).map((role) => ({
            value: role.name,
            label: role.display_name,
        }));

    // Stats
    const totalCount = isAccessMode ? users.length : directoryTotal;
    const activeCount = isAccessMode
        ? users.filter(u => u.is_active).length
        : directoryTotal; // Directory mode only requests active users today.
    const privilegedCount = isAccessMode
        ? users.filter(u => u.access_scope === 'global' && u.role.name !== 'admin').length
        : 0;
    const isAuthModeReady = authModeStatus === 'ready';
    const isDirectoryFirstMode = isAuthModeReady && authMode !== null && authMode !== 'password';
    const allowAuthModeActions = canManageUsers && isAuthModeReady;
    const directoryTotalPages = Math.max(1, Math.ceil(directoryTotal / DIRECTORY_PAGE_SIZE));
    const accessStatsGridClass = authz.isPlatformAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3';

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <Users className="h-8 w-8 text-accent" />
                        {isAccessMode ? t('access.title') : t('users.title')}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {isAccessMode ? t('access.subtitle') : t('users.subtitle', { defaultValue: 'View platform users and their roles.' })}
                    </p>
                </div>
                {allowAuthModeActions && (
                    <div className="flex flex-wrap items-center gap-2">
                        {authz.isPlatformAdmin && (
                            <button
                                onClick={handleCheckAllDirectory}
                                disabled={isCheckingAllDirectory}
                                className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <RefreshCw className={`h-4 w-4 ${isCheckingAllDirectory ? 'animate-spin' : ''}`} />
                                    {isCheckingAllDirectory
                                        ? t('users.checking_directory', { defaultValue: 'Checking...' })
                                        : t('users.check_directory', { defaultValue: 'Check AD' })}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={() => navigate('/users/new')}
                            className="bg-accent hover:bg-accent/80 text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
                        >
                            {isDirectoryFirstMode ? <Building2 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                            {isDirectoryFirstMode
                                ? t('users.add_from_ad', { defaultValue: 'Add from AD' })
                                : t('access.add_user')}
                        </button>
                    </div>
                )}
            </div>

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
                <div className={`grid grid-cols-1 ${accessStatsGridClass} gap-4`}>
                    <div className="glass-card p-4 flex items-center gap-4">
                        <div className="bg-purple-500/20 p-3 rounded-xl">
                            <Users className="h-6 w-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">{t('access.stats.total_users')}</p>
                            <p className="text-2xl font-bold text-white">{totalCount}</p>
                        </div>
                    </div>
                    <div className="glass-card p-4 flex items-center gap-4">
                        <div className="bg-emerald-500/20 p-3 rounded-xl">
                            <UserCheck className="h-6 w-6 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">{t('access.stats.active')}</p>
                            <p className="text-2xl font-bold text-white">{activeCount}</p>
                        </div>
                    </div>
                    <div className="glass-card p-4 flex items-center gap-4">
                        <div className="bg-amber-500/20 p-3 rounded-xl">
                            <Crown className="h-6 w-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">{t('access.stats.privileged')}</p>
                            <p className="text-2xl font-bold text-white">{privilegedCount}</p>
                        </div>
                    </div>
                    {authz.isPlatformAdmin && (
                        <div className="glass-card p-4 flex items-center gap-4">
                            <div className="bg-slate-500/20 p-3 rounded-xl">
                                <Server className="h-6 w-6 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-400">{t('access.stats.sys_admins')}</p>
                                <p className="text-2xl font-bold text-white">{users.filter(u => u.role.name === 'admin').length}</p>
                            </div>
                        </div>
                    )}
                </div>
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
                        canEditAccess={authz.canEditAccessUsers}
                        canManageUsers={canManageUsers}
                        onEditAccess={handleEditAccess}
                        onToggleStatus={handleToggleClick}
                        onBreakGlassEnable={handleBreakGlassOpen}
                        canRunDirectoryChecks={authz.isPlatformAdmin}
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

            {/* Access Edit Modal */}
            <AccessEditModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                user={selectedUser}
                onSaved={handleAccessSaved}
            />

            {/* User Status Toggle Confirmation Dialog */}
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

            {breakGlassUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                        onClick={handleBreakGlassClose}
                        aria-label={t('actions.cancel', { ns: 'common' })}
                    />
                    <div className="relative w-full max-w-md rounded-2xl border border-amber-500/20 bg-slate-900 p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-white">
                            {t('users.break_glass_enable', { defaultValue: 'Break-glass enable' })}
                        </h3>
                        <p className="mt-2 text-sm text-slate-300">
                            {t('users.break_glass_message', {
                                defaultValue: `Temporarily re-enable ${breakGlassUser.name} with an audited expiry.`,
                                name: breakGlassUser.name,
                            })}
                        </p>
                        <label
                            htmlFor="break-glass-reason"
                            className="mt-5 block text-xs font-bold uppercase tracking-widest text-slate-400"
                        >
                            {t('users.break_glass_reason', { defaultValue: 'Reason' })}
                        </label>
                        <textarea
                            id="break-glass-reason"
                            value={breakGlassReason}
                            onChange={(event) => setBreakGlassReason(event.target.value)}
                            className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/70"
                            maxLength={255}
                        />
                        <label
                            htmlFor="break-glass-expires-in-hours"
                            className="mt-4 block text-xs font-bold uppercase tracking-widest text-slate-400"
                        >
                            {t('users.break_glass_expires_in_hours', { defaultValue: 'Expires in hours' })}
                        </label>
                        <input
                            id="break-glass-expires-in-hours"
                            type="number"
                            min={1}
                            max={24}
                            value={breakGlassHours}
                            onChange={(event) => {
                                if (event.target.value === '') {
                                    setBreakGlassHours('');
                                    return;
                                }
                                const value = Number(event.target.value);
                                setBreakGlassHours(Math.min(24, Math.max(1, Number.isFinite(value) ? value : 1)));
                            }}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-amber-400/70"
                        />
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleBreakGlassClose}
                                disabled={isBreakGlassSubmitting}
                                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {t('actions.cancel', { ns: 'common' })}
                            </button>
                            <button
                                type="button"
                                onClick={handleBreakGlassSubmit}
                                disabled={isBreakGlassSubmitting || !breakGlassReason.trim() || breakGlassHours === ''}
                                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isBreakGlassSubmitting
                                    ? t('users.break_glass_enabling', { defaultValue: 'Enabling...' })
                                    : t('users.break_glass_enable', { defaultValue: 'Break-glass enable' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default UsersPage;

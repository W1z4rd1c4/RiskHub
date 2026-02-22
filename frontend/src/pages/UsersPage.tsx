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
import { userApi } from '@/services/userApi';
import type { AuthMode } from '@/services/authApi';
import { getAuthConfig } from '@/services/authConfig';
import type { AccessUserRead } from '@/types/access';
import type { DirectoryImportResponse } from '@/types/directory';
import type { UserLookup } from '@/types/user';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthz } from '@/authz/useAuthz';
import { useNavigate } from 'react-router-dom';
import { AccessEditModal } from '@/components/access/AccessEditModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useUsersPageFilters } from '@/hooks/useUsersPageFilters';
import { UsersFilterBar } from '@/components/access/UsersFilterBar';
import { UsersTable } from '@/components/access/UsersTable';
import { ADUserPicker } from '@/components/users/ADUserPicker';

export function UsersPage() {
    const { t } = useTranslation('admin');
    const [users, setUsers] = useState<AccessUserRead[]>([]);
    const [directoryUsers, setDirectoryUsers] = useState<UserLookup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AccessUserRead | null>(null);
    const [isAccessMode, setIsAccessMode] = useState(false);
    const [isADPickerOpen, setIsADPickerOpen] = useState(false);
    const [directoryMessage, setDirectoryMessage] = useState<string | null>(null);
    const [isCheckingAllDirectory, setIsCheckingAllDirectory] = useState(false);
    const [checkingDirectoryUserId, setCheckingDirectoryUserId] = useState<number | null>(null);
    const [authMode, setAuthMode] = useState<AuthMode | null>(null);

    // Confirm dialog state for user status toggle (only used in access mode)
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [userToToggle, setUserToToggle] = useState<AccessUserRead | null>(null);
    const [isToggling, setIsToggling] = useState(false);

    const { canManageUsers, user: currentUser } = usePermissions();
    const authz = useAuthz();
    const navigate = useNavigate();

    // Department heads get access view but scoped to their department
    const isDepartmentHead = authz.isDepartmentHead;

    const filters = useUsersPageFilters({
        accessUsers: users,
        directoryUsers: directoryUsers,
    });

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            if (authz.canManageAccess) {
                // Privileged users get full access data
                const data = await accessApi.listAccessUsers();
                setUsers(data);
                setIsAccessMode(true);
            } else if (isDepartmentHead) {
                // Department heads get their department's access data
                const data = await accessApi.listDepartmentAccessUsers();
                setUsers(data);
                setIsAccessMode(true); // Enable access mode to show permissions
            } else {
                // Non-privileged get scoped user lookup (read-only directory view)
                const data = await userApi.listVisibleUsers();
                setDirectoryUsers(data);
                setIsAccessMode(false);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    }, [authz.canManageAccess, isDepartmentHead]);

    useEffect(() => {
        // Wait for user to be loaded before fetching
        if (currentUser) {
            fetchUsers();
        }
    }, [currentUser, fetchUsers]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const config = await getAuthConfig();
                if (cancelled) return;
                setAuthMode(config.auth_mode);
            } catch (error) {
                console.error('Failed to load auth mode for UsersPage', error);
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, []);

    const handleToggleClick = (user: AccessUserRead) => {
        setUserToToggle(user);
        setConfirmDialogOpen(true);
    };

    const toggleUserStatus = async () => {
        if (!userToToggle) return;

        try {
            setIsToggling(true);
            await userApi.updateUser(userToToggle.id, { is_active: !userToToggle.is_active });
            fetchUsers();
        } catch (error) {
            console.error('Failed to update user status:', error);
        } finally {
            setIsToggling(false);
            setConfirmDialogOpen(false);
            setUserToToggle(null);
        }
    };

    const handleEditAccess = (user: AccessUserRead) => {
        setSelectedUser(user);
        setEditModalOpen(true);
    };

    const handleAccessSaved = () => {
        fetchUsers();
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
            console.error('Directory check-all failed', error);
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
            console.error('Directory single-user check failed', error);
            setDirectoryMessage(t('users.directory_check_failed', { defaultValue: 'Directory check failed.' }));
        } finally {
            setCheckingDirectoryUserId(null);
        }
    };

    // Compute display values
    const displayUsers = isAccessMode ? filters.filteredAccessUsers : [];
    const displayDirectoryUsers = !isAccessMode ? filters.filteredDirectoryUsers : [];

    // Stats
    const totalCount = isAccessMode ? users.length : directoryUsers.length;
    const activeCount = isAccessMode
        ? users.filter(u => u.is_active).length
        : directoryUsers.length; // Directory only shows active users
    const privilegedCount = isAccessMode
        ? users.filter(u => u.access_scope === 'global' && u.role.name !== 'admin').length
        : 0;
    const isSsoMode = authMode === 'microsoft_sso';

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
                {canManageUsers && (
                    <div className="flex flex-wrap items-center gap-2">
                        {!isSsoMode && (
                            <button
                                onClick={() => setIsADPickerOpen(true)}
                                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white transition hover:bg-white/10"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    {t('users.add_from_ad', { defaultValue: 'Add from AD' })}
                                </span>
                            </button>
                        )}
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
                            {isSsoMode ? <Building2 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
                            {isSsoMode
                                ? t('users.add_from_ad', { defaultValue: 'Add from AD' })
                                : t('access.add_user')}
                        </button>
                    </div>
                )}
            </div>

            {directoryMessage && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                    {directoryMessage}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                <div className="glass-card p-4 flex items-center gap-4">
                    <div className="bg-slate-500/20 p-3 rounded-xl">
                        <Server className="h-6 w-6 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">{t('access.stats.sys_admins')}</p>
                        <p className="text-2xl font-bold text-white">{isAccessMode ? users.filter(u => u.role.name === 'admin').length : 0}</p>
                    </div>
                </div>
            </div>

            <div className="glass-card p-6">
                <UsersFilterBar
                    isAccessMode={isAccessMode}
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
                    totalCount={users.length}
                />

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
                    canRunDirectoryChecks={authz.isPlatformAdmin}
                    checkingDirectoryUserId={checkingDirectoryUserId}
                    onCheckDirectory={handleCheckSingleDirectory}
                />
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
                onClose={() => { setConfirmDialogOpen(false); setUserToToggle(null); }}
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
        </div>
    );
}

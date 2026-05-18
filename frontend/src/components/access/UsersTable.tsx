import { useTranslation } from '@/i18n/hooks';
import type { AccessUserRead } from '@/types/access';
import type { UserDirectoryEntry } from '@/types/user';

import { AccessUserRow } from './AccessUserRow';
import { DirectoryUserRow } from './DirectoryUserRow';
import type { AccessUserActionModel, AccessUserPresentationModel } from './useAccessUsersWorkflow';

interface UsersTableProps {
    actionModelsByUserId: Map<number, AccessUserActionModel>;
    isAccessMode: boolean;
    isLoading: boolean;
    accessUsers: AccessUserRead[];
    directoryUsers: UserDirectoryEntry[];
    expandedUserId: number | null;
    onToggleExpand: (userId: number) => void;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleStatus: (user: AccessUserRead) => void;
    onBreakGlassEnable?: (user: AccessUserRead) => void;
    canRunDirectoryChecks?: boolean;
    checkingDirectoryUserId?: number | null;
    onCheckDirectory?: (user: AccessUserRead) => void;
    presentationModelsByUserId: Map<number, AccessUserPresentationModel>;
}

function LoadingRows({ isAccessMode }: { isAccessMode: boolean }) {
    return Array.from({ length: 5 }).map((_, index) => (
        <tr key={index} className="animate-pulse">
            <td colSpan={isAccessMode ? 6 : 4} className="py-8 px-4 h-16 bg-white/5 rounded-lg mb-2" />
        </tr>
    ));
}

export function UsersTable({
    actionModelsByUserId,
    isAccessMode,
    isLoading,
    accessUsers,
    directoryUsers,
    expandedUserId,
    onToggleExpand,
    onEditAccess,
    onToggleStatus,
    onBreakGlassEnable,
    canRunDirectoryChecks = false,
    checkingDirectoryUserId = null,
    onCheckDirectory,
    presentationModelsByUserId,
}: UsersTableProps) {
    const { t } = useTranslation('admin');
    const columnCount = isAccessMode ? 6 : 4;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-white/10">
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.user')}</th>
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.role_department')}</th>
                        {isAccessMode && (
                            <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.scope')}</th>
                        )}
                        {isAccessMode && (
                            <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.permissions')}</th>
                        )}
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300">{t('access.table.status')}</th>
                        <th className="py-4 px-4 text-sm font-semibold text-slate-300 text-right">{t('access.table.actions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {isLoading ? (
                        <LoadingRows isAccessMode={isAccessMode} />
                    ) : isAccessMode && accessUsers.length > 0 ? (
                        accessUsers.map((user) => {
                            const actionModel = actionModelsByUserId.get(user.id);
                            const presentationModel = presentationModelsByUserId.get(user.id);
                            if (!actionModel || !presentationModel) {
                                return null;
                            }

                            return (
                                <AccessUserRow
                                    key={user.id}
                                    actionModel={actionModel}
                                    canRunDirectoryChecks={canRunDirectoryChecks}
                                    checkingDirectoryUserId={checkingDirectoryUserId}
                                    expandedUserId={expandedUserId}
                                    onBreakGlassEnable={onBreakGlassEnable}
                                    onCheckDirectory={onCheckDirectory}
                                    onEditAccess={onEditAccess}
                                    onToggleExpand={onToggleExpand}
                                    onToggleStatus={onToggleStatus}
                                    presentationModel={presentationModel}
                                    user={user}
                                />
                            );
                        })
                    ) : !isAccessMode && directoryUsers.length > 0 ? (
                        directoryUsers.map((user) => <DirectoryUserRow key={user.id} user={user} />)
                    ) : (
                        <tr>
                            <td colSpan={columnCount} className="py-12 text-center text-slate-500">
                                {t('access.table.no_users_found')}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

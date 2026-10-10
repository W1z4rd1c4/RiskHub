import { Users } from 'lucide-react';

import { EmptyState, LoadingState, Skeleton } from '@/components/ui/state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
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
    onManageIdentity?: (user: AccessUserRead) => void;
    onEditAccess: (user: AccessUserRead) => void;
    onToggleStatus: (user: AccessUserRead) => void;
    onBreakGlassEnable?: (user: AccessUserRead) => void;
    canRunDirectoryChecks?: boolean;
    checkingDirectoryUserId?: number | null;
    onCheckDirectory?: (user: AccessUserRead) => void;
    presentationModelsByUserId: Map<number, AccessUserPresentationModel>;
}

function LoadingRows({ columnCount }: { columnCount: number }) {
    return (
        <TR>
            <TD colSpan={columnCount} className="p-0">
                <LoadingState
                    skeleton={(
                        <div className="space-y-2 p-2">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <Skeleton key={index} className="h-16 w-full" />
                            ))}
                        </div>
                    )}
                />
            </TD>
        </TR>
    );
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
    onManageIdentity,
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
        <Table
            density="compact"
            regionLabel={isAccessMode ? t('access.title') : t('users.title')}
            className="text-left"
        >
            <THead>
                <TR>
                    <TH>{t('access.table.user')}</TH>
                    <TH>{t('access.table.role_department')}</TH>
                    {isAccessMode && <TH>{t('access.table.scope')}</TH>}
                    {isAccessMode && <TH>{t('access.table.permissions')}</TH>}
                    <TH>{t('access.table.status')}</TH>
                    <TH align="right">{t('access.table.actions')}</TH>
                </TR>
            </THead>
            <TBody>
                {isLoading ? (
                    <LoadingRows columnCount={columnCount} />
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
                                onManageIdentity={onManageIdentity}
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
                    <TR>
                        <TD colSpan={columnCount} className="p-0">
                            <EmptyState layout="section" icon={Users} title={t('access.table.no_users_found')} />
                        </TD>
                    </TR>
                )}
            </TBody>
        </Table>
    );
}

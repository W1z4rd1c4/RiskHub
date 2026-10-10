import { useId } from 'react';
import { Crown, Search, User } from 'lucide-react';

import { UserAvatar } from '@/components/access/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { EmptyState } from '@/components/ui/state';
import { useTranslation } from '@/i18n/hooks';

import type { OrphanUserOption } from './resolveOrphanHelpers';

interface ResolveOrphanOwnerSelectionProps {
    handleSelectUser: (user: OrphanUserOption) => void;
    orphanDepartmentName: string | null;
    searchQuery: string;
    selectedDeptFilter: string | null;
    selectedUserId: number | null;
    setSearchQuery: (value: string) => void;
    setSelectedDeptFilter: (value: string | null) => void;
    sortedUsers: OrphanUserOption[];
}

export function ResolveOrphanOwnerSelection({
    handleSelectUser,
    orphanDepartmentName,
    searchQuery,
    selectedDeptFilter,
    selectedUserId,
    setSearchQuery,
    setSelectedDeptFilter,
    sortedUsers,
}: ResolveOrphanOwnerSelectionProps) {
    const { t } = useTranslation('common');
    const { t: tAdmin } = useTranslation('admin');
    const headingId = useId();
    const isDepartmentFilterActive = selectedDeptFilter === orphanDepartmentName;

    return (
        <div className="space-y-4">
            <h3 id={headingId} className="text-eyebrow flex items-center gap-2">
                <User className="h-4 w-4 text-success-text" aria-hidden="true" />
                {tAdmin('governance.resolve_modal.assign_new_owner')}
            </h3>
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <Input
                            type="text"
                            leadingIcon={Search}
                            data-testid="orphan-owner-search"
                            aria-label={t('filters.search_items')}
                            placeholder={t('filters.search_items')}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                    </div>
                    {orphanDepartmentName && (
                        <Button
                            type="button"
                            size="compact"
                            variant={isDepartmentFilterActive ? 'success' : 'outline'}
                            aria-pressed={isDepartmentFilterActive}
                            onClick={() => setSelectedDeptFilter(isDepartmentFilterActive ? null : orphanDepartmentName)}
                        >
                            {orphanDepartmentName}
                        </Button>
                    )}
                </div>

                {sortedUsers.length === 0 ? (
                    <EmptyState layout="inline" kind="no-results" title={t('empty.no_users_found')} />
                ) : (
                    // GAP-D-13: one radiogroup, so the chosen owner is exposed to assistive technology.
                    <RadioGroup
                        variant="card"
                        aria-labelledby={headingId}
                        value={selectedUserId === null ? '' : String(selectedUserId)}
                        onValueChange={(value) => {
                            const user = sortedUsers.find((candidate) => String(candidate.id) === value);
                            if (user) handleSelectUser(user);
                        }}
                        className="custom-scrollbar grid max-h-[250px] grid-cols-1 gap-2 space-y-0 overflow-y-auto md:grid-cols-2"
                        options={sortedUsers.map((user) => ({
                            value: String(user.id),
                            label: (
                                <span className="flex items-center gap-3">
                                    <UserAvatar name={user.name} className="h-8 w-8 text-xs" />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate text-sm font-bold">{user.name}</span>
                                            {user.employee_type === 'head' && (
                                                <Crown className="h-3 w-3 shrink-0 text-warning-text" aria-hidden="true" />
                                            )}
                                        </span>{' '}
                                        <span className="block truncate text-xs font-normal text-muted-foreground">
                                            {[user.email, user.department_name, user.role_name].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                </span>
                            ),
                        }))}
                    />
                )}
            </div>
        </div>
    );
}

import { Check, Crown, Search, User } from 'lucide-react';

import { Input } from '@/components/ui/input';
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

    return (
        <div className="space-y-4">
            <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <User className="h-4 w-4 text-success-text" />
                {tAdmin('governance.resolve_modal.assign_new_owner')}
            </h5>
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
                        <button
                            type="button"
                            onClick={() => setSelectedDeptFilter(selectedDeptFilter === orphanDepartmentName ? null : orphanDepartmentName)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selectedDeptFilter === orphanDepartmentName ? 'bg-success text-success-foreground border-success' : 'bg-success/10 text-success-text border-border hover:bg-success/20'}`}
                        >
                            {orphanDepartmentName}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {sortedUsers.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelectUser(user)}
                            className={`text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedUserId === user.id ? 'bg-success/10 border-success shadow-sm' : 'bg-tint/5 border-border hover:bg-tint/10'}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedUserId === user.id ? 'bg-success text-success-foreground' : 'bg-tint/10 text-muted-foreground'}`}>
                                {user.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                                    {user.employee_type === 'head' && <Crown className="h-3 w-3 text-warning-text" />}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {[user.email, user.department_name, user.role_name].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                            {selectedUserId === user.id && <Check className="h-4 w-4 text-success-text" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

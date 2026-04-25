import { Check, Crown, Search, User } from 'lucide-react';

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
            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-400" />
                {tAdmin('governance.resolve_modal.assign_new_owner')}
            </h5>
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder={t('filters.search_items')}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-emerald-400/40"
                        />
                    </div>
                    {orphanDepartmentName && (
                        <button
                            onClick={() => setSelectedDeptFilter(selectedDeptFilter === orphanDepartmentName ? null : orphanDepartmentName)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${selectedDeptFilter === orphanDepartmentName ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-500/10 text-emerald-400 border-white/10 hover:bg-emerald-500/20'}`}
                        >
                            {orphanDepartmentName}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                    {sortedUsers.map((user) => (
                        <button
                            key={user.id}
                            onClick={() => handleSelectUser(user)}
                            className={`text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${selectedUserId === user.id ? 'bg-emerald-500/10 border-emerald-500 shadow-sm' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedUserId === user.id ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                                {user.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-white truncate">{user.name}</p>
                                    {user.employee_type === 'head' && <Crown className="h-3 w-3 text-amber-500" />}
                                </div>
                                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                            </div>
                            {selectedUserId === user.id && <Check className="h-4 w-4 text-emerald-500" />}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

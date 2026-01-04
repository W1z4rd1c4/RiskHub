import { useState } from 'react';
import { ShieldAlert, ClipboardList, AlertTriangle, UserCheck, Filter, Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { OrphanedItem } from '@/types/orphanedItem';

interface OrphanedItemsTableProps {
    items: OrphanedItem[];
    onResolve: (item: OrphanedItem) => void;
    onView?: (item: OrphanedItem) => void;
}

const typeIcons: Record<string, typeof ShieldAlert> = {
    risk: ShieldAlert,
    control: ClipboardList,
    kri: AlertTriangle,
};

const typeLabels: Record<string, string> = {
    risk: 'Risk',
    control: 'Control',
    kri: 'KRI',
};

export function OrphanedItemsTable({ items, onResolve, onView }: OrphanedItemsTableProps) {
    const [filter, setFilter] = useState<string>('all');

    const filteredItems = filter === 'all'
        ? items
        : items.filter(item => item.item_type === filter);

    const isOld = (dateStr: string) => {
        const date = new Date(dateStr);
        const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
        return daysDiff > 7;
    };

    if (items.length === 0) {
        return (
            <div className="glass-card text-center py-16">
                <AlertTriangle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">All Clear</h3>
                <p className="text-slate-500 max-w-md mx-auto">
                    No orphaned items found. All risks and controls have assigned owners.
                </p>
            </div>
        );
    }

    return (
        <div className="glass-card !p-0 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                    Orphaned Items ({filteredItems.length})
                </h3>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                        <option value="all">All Types</option>
                        <option value="risk">Risks Only</option>
                        <option value="control">Controls Only</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Department</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Previous Owner</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Orphaned</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredItems.map((item) => {
                            const Icon = typeIcons[item.item_type] || AlertTriangle;
                            const old = isOld(item.orphaned_at);

                            return (
                                <tr
                                    key={item.id}
                                    onClick={() => onView?.(item)}
                                    className={`group hover:bg-white/5 transition-all cursor-pointer relative ${old ? 'bg-amber-500/5' : ''}`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg transition-transform group-hover:scale-110 ${item.item_type === 'risk' ? 'bg-rose-500/10 text-rose-400' : 'bg-accent/10 text-accent'}`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <span className="text-sm font-medium text-white">
                                                {typeLabels[item.item_type] || item.item_type}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="text-sm font-bold text-white group-hover:text-accent transition-colors">{item.item_name}</p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-xs text-slate-500 line-clamp-2 max-w-md">{item.item_description || '-'}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.department_name === 'Uncategorised' ? (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit">
                                                <Building2 className="h-3 w-3" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Uncategorised</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-slate-400 font-medium">
                                                {item.department_name || 'N/A'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                                <UserCheck className="h-3 w-3 text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{item.previous_owner_name}</p>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{item.previous_owner_email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-bold uppercase tracking-widest ${old ? 'text-amber-400' : 'text-slate-500'}`}>
                                            {formatDistanceToNow(new Date(item.orphaned_at), { addSuffix: true })}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onResolve(item);
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-accent text-white hover:text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-white/10 group-hover:border-accent/50 shadow-sm active:scale-95"
                                        >
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Resolve
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';

import type { DepartmentDetail } from '@/services/departmentApi';

interface DepartmentDetailHeaderProps {
    department: DepartmentDetail;
    onBack: () => void;
    onRefresh: () => void;
}

export function DepartmentDetailHeader({ department, onBack, onRefresh }: DepartmentDetailHeaderProps) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Building2 className="h-8 w-8 text-accent" />
                        <h2 className="text-3xl font-black text-white">{department.name}</h2>
                        <span className="px-3 py-1 rounded-full bg-white/10 text-slate-400 text-xs font-mono">
                            {department.code}
                        </span>
                    </div>
                    {department.description && <p className="text-slate-500 font-medium">{department.description}</p>}
                </div>
            </div>
            <button
                onClick={onRefresh}
                className="px-4 py-2 glass rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
                <RefreshCw className="h-5 w-5" />
            </button>
        </div>
    );
}

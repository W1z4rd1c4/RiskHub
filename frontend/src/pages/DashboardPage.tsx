import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, Building2, AlertTriangle, CheckCircle } from 'lucide-react';

const stats = [
    {
        title: 'Total Controls',
        value: '0',
        icon: ClipboardList,
        description: 'Across all departments',
    },
    {
        title: 'Departments',
        value: '0',
        icon: Building2,
        description: 'Active departments',
    },
    {
        title: 'High Risk',
        value: '0',
        icon: AlertTriangle,
        description: 'Controls with risk level 4-5',
    },
    {
        title: 'Completed',
        value: '0%',
        icon: CheckCircle,
        description: 'Controls executed this month',
    },
];

export function DashboardPage() {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
                <p className="text-slate-500">Risk management overview</p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-500">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className="h-4 w-4 text-slate-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <p className="text-xs text-slate-500">{stat.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Placeholder for charts */}
            <Card>
                <CardHeader>
                    <CardTitle>Risk Overview</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center text-slate-400">
                    Charts will be added in Phase 3
                </CardContent>
            </Card>
        </div>
    );
}

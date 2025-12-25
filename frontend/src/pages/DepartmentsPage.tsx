import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function DepartmentsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Departments</h2>
                    <p className="text-slate-500">Manage departments and their control catalogs</p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Department
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Departments</CardTitle>
                </CardHeader>
                <CardContent className="h-64 flex items-center justify-center text-slate-400">
                    Department management will be implemented in Phase 2
                </CardContent>
            </Card>
        </div>
    );
}
